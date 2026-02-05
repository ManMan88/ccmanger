//! Migration tests to ensure database schema integrity

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use tempfile::tempdir;

use claude_manager_lib::db::migrations;

#[test]
fn test_migrations_run_successfully() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test_migrations.db");

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(1)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");

    // Run migrations
    let result = migrations::run_migrations(&conn);
    assert!(result.is_ok(), "Migrations should run successfully");

    // Verify schema_migrations table exists and has entries
    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("Failed to count migrations");
    assert!(count > 0, "At least one migration should be recorded");
}

#[test]
fn test_migrations_are_idempotent() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test_idempotent.db");

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(1)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");

    // Run migrations twice
    migrations::run_migrations(&conn).expect("First migration should succeed");
    migrations::run_migrations(&conn).expect("Second migration should succeed (idempotent)");

    // Verify only one migration is recorded (not duplicated)
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = 1",
            [],
            |row| row.get(0),
        )
        .expect("Failed to count migrations");
    assert_eq!(count, 1, "Migration should only be recorded once");
}

#[test]
fn test_all_tables_created() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test_tables.db");

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(1)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");
    migrations::run_migrations(&conn).expect("Migrations should succeed");

    // List of tables that should exist
    let expected_tables = vec![
        "schema_migrations",
        "workspaces",
        "worktrees",
        "agents",
        "messages",
        "agent_sessions",
        "usage_stats",
        "settings",
    ];

    for table in expected_tables {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?",
                [table],
                |row| row.get(0),
            )
            .expect(&format!("Failed to check if table {} exists", table));
        assert!(exists, "Table '{}' should exist", table);
    }
}

#[test]
fn test_foreign_key_constraints() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test_fk.db");

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(1)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");
    migrations::run_migrations(&conn).expect("Migrations should succeed");

    // Verify foreign keys are enabled
    let fk_enabled: bool = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i32>(0))
        .map(|v| v == 1)
        .expect("Failed to check foreign_keys pragma");
    assert!(fk_enabled, "Foreign keys should be enabled");

    // Try to insert a worktree without a workspace (should fail)
    let result = conn.execute(
        r#"INSERT INTO worktrees (id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at)
           VALUES ('wt_test', 'nonexistent_ws', 'test', 'main', '/tmp', 'free', 0, 1, datetime('now'), datetime('now'))"#,
        [],
    );
    assert!(
        result.is_err(),
        "Inserting worktree with nonexistent workspace should fail"
    );
}

#[test]
fn test_workspaces_table_schema() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test_ws_schema.db");

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(1)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");
    migrations::run_migrations(&conn).expect("Migrations should succeed");

    // Insert a workspace
    conn.execute(
        r#"INSERT INTO workspaces (id, name, path, created_at, updated_at)
           VALUES ('ws_test', 'Test Workspace', '/tmp/test', datetime('now'), datetime('now'))"#,
        [],
    )
    .expect("Should be able to insert workspace");

    // Verify we can read it back
    let name: String = conn
        .query_row("SELECT name FROM workspaces WHERE id = 'ws_test'", [], |row| {
            row.get(0)
        })
        .expect("Should be able to read workspace");
    assert_eq!(name, "Test Workspace");
}

#[test]
fn test_agents_table_schema() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test_agent_schema.db");

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(1)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");
    migrations::run_migrations(&conn).expect("Migrations should succeed");

    // Create workspace and worktree first
    conn.execute(
        r#"INSERT INTO workspaces (id, name, path, created_at, updated_at)
           VALUES ('ws_test', 'Test', '/tmp', datetime('now'), datetime('now'))"#,
        [],
    )
    .expect("Should insert workspace");

    conn.execute(
        r#"INSERT INTO worktrees (id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at)
           VALUES ('wt_test', 'ws_test', 'main', 'main', '/tmp', 'free', 0, 1, datetime('now'), datetime('now'))"#,
        [],
    )
    .expect("Should insert worktree");

    // Insert an agent
    conn.execute(
        r#"INSERT INTO agents (id, worktree_id, name, status, context_level, mode, permissions, display_order, created_at, updated_at)
           VALUES ('ag_test', 'wt_test', 'Test Agent', 'finished', 0, 'regular', '["read"]', 0, datetime('now'), datetime('now'))"#,
        [],
    )
    .expect("Should insert agent");

    // Verify all columns exist
    let (name, status, mode): (String, String, String) = conn
        .query_row(
            "SELECT name, status, mode FROM agents WHERE id = 'ag_test'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("Should read agent");

    assert_eq!(name, "Test Agent");
    assert_eq!(status, "finished");
    assert_eq!(mode, "regular");
}

#[test]
fn test_messages_table_schema() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test_msg_schema.db");

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(1)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");
    migrations::run_migrations(&conn).expect("Migrations should succeed");

    // Create workspace, worktree, and agent
    conn.execute(
        r#"INSERT INTO workspaces (id, name, path, created_at, updated_at)
           VALUES ('ws_test', 'Test', '/tmp', datetime('now'), datetime('now'))"#,
        [],
    )
    .expect("Should insert workspace");

    conn.execute(
        r#"INSERT INTO worktrees (id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at)
           VALUES ('wt_test', 'ws_test', 'main', 'main', '/tmp', 'free', 0, 1, datetime('now'), datetime('now'))"#,
        [],
    )
    .expect("Should insert worktree");

    conn.execute(
        r#"INSERT INTO agents (id, worktree_id, name, status, context_level, mode, permissions, display_order, created_at, updated_at)
           VALUES ('ag_test', 'wt_test', 'Test Agent', 'finished', 0, 'regular', '["read"]', 0, datetime('now'), datetime('now'))"#,
        [],
    )
    .expect("Should insert agent");

    // Insert a message
    conn.execute(
        r#"INSERT INTO messages (id, agent_id, role, content, is_complete, created_at)
           VALUES ('msg_test', 'ag_test', 'user', 'Hello', 1, datetime('now'))"#,
        [],
    )
    .expect("Should insert message");

    // Verify message
    let (role, content): (String, String) = conn
        .query_row(
            "SELECT role, content FROM messages WHERE id = 'msg_test'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("Should read message");

    assert_eq!(role, "user");
    assert_eq!(content, "Hello");
}

#[test]
fn test_cascade_delete_worktrees() {
    let temp_dir = tempdir().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test_cascade.db");

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(1)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");
    migrations::run_migrations(&conn).expect("Migrations should succeed");

    // Create workspace, worktree, and agent
    conn.execute(
        r#"INSERT INTO workspaces (id, name, path, created_at, updated_at)
           VALUES ('ws_test', 'Test', '/tmp', datetime('now'), datetime('now'))"#,
        [],
    )
    .unwrap();

    conn.execute(
        r#"INSERT INTO worktrees (id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at)
           VALUES ('wt_test', 'ws_test', 'main', 'main', '/tmp', 'free', 0, 1, datetime('now'), datetime('now'))"#,
        [],
    )
    .unwrap();

    conn.execute(
        r#"INSERT INTO agents (id, worktree_id, name, status, context_level, mode, permissions, display_order, created_at, updated_at)
           VALUES ('ag_test', 'wt_test', 'Test', 'finished', 0, 'regular', '[]', 0, datetime('now'), datetime('now'))"#,
        [],
    )
    .unwrap();

    // Delete workspace
    conn.execute("DELETE FROM workspaces WHERE id = 'ws_test'", [])
        .unwrap();

    // Worktree should be deleted too (cascade)
    let worktree_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM worktrees WHERE workspace_id = 'ws_test'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(worktree_count, 0, "Worktrees should be cascade deleted");

    // Agent should be deleted too (cascade)
    let agent_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM agents WHERE worktree_id = 'wt_test'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(agent_count, 0, "Agents should be cascade deleted");
}
