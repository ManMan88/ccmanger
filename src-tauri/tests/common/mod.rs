//! Common test utilities and helpers
//!
//! This module provides shared test infrastructure for integration tests.

pub mod fixtures;
pub mod mocks;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use tempfile::TempDir;

use claude_manager_lib::db::{migrations, DbPool};
use claude_manager_lib::services::ProcessManager;
use claude_manager_lib::types::{SortMode, Workspace, Worktree};

static TEST_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Test context that holds all resources needed for testing
pub struct TestContext {
    /// Database connection pool
    pub pool: DbPool,
    /// Process manager (mock CLI for testing)
    pub process_manager: Arc<ProcessManager>,
    /// Temporary directory for test files
    pub temp_dir: TempDir,
    /// Pre-created workspace ID
    pub workspace_id: String,
    /// Pre-created worktree ID
    pub worktree_id: String,
}

impl TestContext {
    /// Create a new test context with a fresh database
    pub fn new() -> Self {
        let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
        let counter = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let db_path = temp_dir
            .path()
            .join(format!("test_db_{}.db", counter));

        let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
            conn.execute_batch("PRAGMA foreign_keys = ON;")?;
            Ok(())
        });

        let pool = Pool::builder()
            .max_size(5)
            .build(manager)
            .expect("Failed to create pool");

        // Run migrations
        let conn = pool.get().expect("Failed to get connection");
        migrations::run_migrations(&conn).expect("Failed to run migrations");
        drop(conn);

        // Use mock CLI (echo) for testing
        let process_manager = Arc::new(ProcessManager::new("echo".to_string()));

        // Create default workspace and worktree
        let workspace_id = format!("ws_test_{}", counter);
        let worktree_id = format!("wt_test_{}", counter);
        let now = chrono::Utc::now().to_rfc3339();

        let conn = pool.get().expect("Failed to get connection");
        conn.execute(
            r#"INSERT INTO workspaces (id, name, path, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5)"#,
            rusqlite::params![
                &workspace_id,
                "Test Workspace",
                temp_dir.path().to_str().unwrap(),
                &now,
                &now,
            ],
        )
        .expect("Failed to create test workspace");

        conn.execute(
            r#"INSERT INTO worktrees (id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#,
            rusqlite::params![
                &worktree_id,
                &workspace_id,
                "main",
                "main",
                temp_dir.path().to_str().unwrap(),
                "free",
                0,
                1,
                &now,
                &now,
            ],
        )
        .expect("Failed to create test worktree");

        Self {
            pool,
            process_manager,
            temp_dir,
            workspace_id,
            worktree_id,
        }
    }

    /// Create a new test context with custom workspace name
    pub fn with_workspace_name(name: &str) -> Self {
        let ctx = Self::new();
        let conn = ctx.pool.get().expect("Failed to get connection");
        conn.execute(
            "UPDATE workspaces SET name = ? WHERE id = ?",
            rusqlite::params![name, &ctx.workspace_id],
        )
        .expect("Failed to update workspace name");
        ctx
    }

    /// Get the workspace for this test context
    pub fn get_workspace(&self) -> Workspace {
        let conn = self.pool.get().expect("Failed to get connection");
        let mut stmt = conn
            .prepare(
                r#"SELECT id, name, path, created_at, updated_at,
                          (SELECT COUNT(*) FROM worktrees WHERE workspace_id = workspaces.id) as worktree_count,
                          (SELECT COUNT(*) FROM agents a JOIN worktrees w ON a.worktree_id = w.id WHERE w.workspace_id = workspaces.id) as agent_count
                   FROM workspaces WHERE id = ?"#,
            )
            .expect("Failed to prepare statement");

        stmt.query_row([&self.workspace_id], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                worktree_count: row.get(5)?,
                agent_count: row.get(6)?,
            })
        })
        .expect("Failed to get workspace")
    }

    /// Get the worktree for this test context
    pub fn get_worktree(&self) -> Worktree {
        let conn = self.pool.get().expect("Failed to get connection");
        let mut stmt = conn
            .prepare(
                r#"SELECT id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at
                   FROM worktrees WHERE id = ?"#,
            )
            .expect("Failed to prepare statement");

        stmt.query_row([&self.worktree_id], |row| {
            let sort_mode_str: String = row.get(5)?;
            let is_main: i32 = row.get(7)?;
            Ok(Worktree {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                branch: row.get(3)?,
                path: row.get(4)?,
                sort_mode: match sort_mode_str.as_str() {
                    "status" => SortMode::Status,
                    "name" => SortMode::Name,
                    _ => SortMode::Free,
                },
                display_order: row.get(6)?,
                is_main: is_main != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .expect("Failed to get worktree")
    }

    /// Clear all data from tables (for test isolation)
    pub fn clear_tables(&self) {
        let conn = self.pool.get().expect("Failed to get connection");
        conn.execute_batch(
            r#"
            DELETE FROM messages;
            DELETE FROM agent_sessions;
            DELETE FROM agents;
            DELETE FROM worktrees;
            DELETE FROM workspaces;
        "#,
        )
        .expect("Failed to clear tables");
    }

    /// Get the temporary directory path
    pub fn temp_path(&self) -> &std::path::Path {
        self.temp_dir.path()
    }
}

impl Default for TestContext {
    fn default() -> Self {
        Self::new()
    }
}

/// Create a test pool without any pre-populated data
pub fn create_empty_test_pool() -> (DbPool, TempDir) {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let counter = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
    let db_path = temp_dir.path().join(format!("test_db_empty_{}.db", counter));

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(())
    });

    let pool = Pool::builder()
        .max_size(5)
        .build(manager)
        .expect("Failed to create pool");

    let conn = pool.get().expect("Failed to get connection");
    migrations::run_migrations(&conn).expect("Failed to run migrations");

    (pool, temp_dir)
}
