//! Data migration tool for migrating data from Node.js SQLite database to Rust backend
//!
//! This module provides utilities for:
//! - Backing up the existing database
//! - Importing data from the Node.js backend database
//! - Verifying data integrity after migration

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MigrationError {
    #[error("Source database not found: {0}")]
    SourceNotFound(PathBuf),

    #[error("Destination database already exists: {0}")]
    DestinationExists(PathBuf),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Backup error: {0}")]
    Backup(String),
}

pub type MigrationResult<T> = Result<T, MigrationError>;

/// Statistics about the migration
#[derive(Debug, Clone, Default)]
pub struct MigrationStats {
    pub workspaces_migrated: usize,
    pub worktrees_migrated: usize,
    pub agents_migrated: usize,
    pub messages_migrated: usize,
    pub sessions_migrated: usize,
    pub usage_stats_migrated: usize,
}

impl MigrationStats {
    pub fn total(&self) -> usize {
        self.workspaces_migrated
            + self.worktrees_migrated
            + self.agents_migrated
            + self.messages_migrated
            + self.sessions_migrated
            + self.usage_stats_migrated
    }
}

/// Backup an existing database file
///
/// Creates a backup with timestamp: `database.db.backup.YYYYMMDD_HHMMSS`
pub fn backup_database(db_path: &Path) -> MigrationResult<PathBuf> {
    if !db_path.exists() {
        return Err(MigrationError::Backup(format!(
            "Database file does not exist: {}",
            db_path.display()
        )));
    }

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let backup_path = db_path.with_extension(format!("db.backup.{}", timestamp));

    fs::copy(db_path, &backup_path)?;

    tracing::info!("Created database backup: {}", backup_path.display());
    Ok(backup_path)
}

/// Migrate data from a Node.js backend SQLite database to the Rust backend
///
/// This function assumes:
/// - Both databases have the same schema (as designed in the migration plan)
/// - The destination database already has migrations run
///
/// Returns statistics about what was migrated.
pub fn migrate_from_nodejs(
    source_path: &Path,
    dest_conn: &Connection,
) -> MigrationResult<MigrationStats> {
    if !source_path.exists() {
        return Err(MigrationError::SourceNotFound(source_path.to_path_buf()));
    }

    let source_conn = Connection::open(source_path)?;
    let mut stats = MigrationStats::default();

    // Disable foreign keys temporarily for import
    dest_conn.execute("PRAGMA foreign_keys = OFF", [])?;

    // Migrate workspaces
    stats.workspaces_migrated = migrate_table(
        &source_conn,
        dest_conn,
        "workspaces",
        &["id", "name", "path", "created_at", "updated_at"],
    )?;

    // Migrate worktrees
    stats.worktrees_migrated = migrate_table(
        &source_conn,
        dest_conn,
        "worktrees",
        &[
            "id",
            "workspace_id",
            "name",
            "branch",
            "path",
            "sort_mode",
            "display_order",
            "is_main",
            "created_at",
            "updated_at",
        ],
    )?;

    // Migrate agents (with status 'finished' → 'idle' conversion)
    stats.agents_migrated = migrate_agents(&source_conn, dest_conn)?;

    // Migrate messages
    stats.messages_migrated = migrate_table(
        &source_conn,
        dest_conn,
        "messages",
        &[
            "id",
            "agent_id",
            "role",
            "content",
            "token_count",
            "tool_name",
            "tool_input",
            "tool_output",
            "is_complete",
            "created_at",
        ],
    )?;

    // Migrate agent sessions
    stats.sessions_migrated = migrate_table(
        &source_conn,
        dest_conn,
        "agent_sessions",
        &[
            "id",
            "agent_id",
            "session_data",
            "context_snapshot",
            "created_at",
        ],
    )?;

    // Migrate usage stats
    stats.usage_stats_migrated = migrate_table_optional(
        &source_conn,
        dest_conn,
        "usage_stats",
        &[
            "id",
            "date",
            "period",
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "request_count",
            "error_count",
            "model_usage",
            "created_at",
            "updated_at",
        ],
    )?;

    // Re-enable foreign keys
    dest_conn.execute("PRAGMA foreign_keys = ON", [])?;

    tracing::info!(
        "Migration complete: {} total records migrated",
        stats.total()
    );

    Ok(stats)
}

/// Migrate agents table with 'finished' → 'idle' status conversion
fn migrate_agents(
    source_conn: &Connection,
    dest_conn: &Connection,
) -> MigrationResult<usize> {
    let columns = &[
        "id", "worktree_id", "name", "status", "context_level", "mode",
        "permissions", "display_order", "pid", "session_id", "parent_agent_id",
        "created_at", "updated_at", "started_at", "stopped_at", "deleted_at",
    ];
    let columns_str = columns.join(", ");
    let placeholders = columns.iter().map(|_| "?").collect::<Vec<_>>().join(", ");

    let select_sql = format!("SELECT {} FROM agents", columns_str);
    let insert_sql = format!(
        "INSERT OR REPLACE INTO agents ({}) VALUES ({})",
        columns_str, placeholders
    );

    let mut select_stmt = source_conn.prepare(&select_sql)?;
    let mut insert_stmt = dest_conn.prepare(&insert_sql)?;

    let status_idx = columns.iter().position(|&c| c == "status").unwrap();
    let mut count = 0;
    let mut rows = select_stmt.query([])?;

    while let Some(row) = rows.next()? {
        let mut values: Vec<rusqlite::types::Value> = (0..columns.len())
            .map(|i| row.get(i).unwrap_or(rusqlite::types::Value::Null))
            .collect();

        // Convert 'finished' → 'idle'
        if let rusqlite::types::Value::Text(ref s) = values[status_idx] {
            if s == "finished" {
                values[status_idx] = rusqlite::types::Value::Text("idle".to_string());
            }
        }

        insert_stmt.execute(rusqlite::params_from_iter(values.iter()))?;
        count += 1;
    }

    tracing::info!("Migrated {} agent records (finished → idle)", count);
    Ok(count)
}

/// Migrate a single table from source to destination
fn migrate_table(
    source_conn: &Connection,
    dest_conn: &Connection,
    table_name: &str,
    columns: &[&str],
) -> MigrationResult<usize> {
    let columns_str = columns.join(", ");
    let placeholders = columns.iter().map(|_| "?").collect::<Vec<_>>().join(", ");

    let select_sql = format!("SELECT {} FROM {}", columns_str, table_name);
    let insert_sql = format!(
        "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
        table_name, columns_str, placeholders
    );

    let mut select_stmt = source_conn.prepare(&select_sql)?;
    let mut insert_stmt = dest_conn.prepare(&insert_sql)?;

    let mut count = 0;
    let mut rows = select_stmt.query([])?;

    while let Some(row) = rows.next()? {
        let values: Vec<rusqlite::types::Value> = (0..columns.len())
            .map(|i| row.get(i).unwrap_or(rusqlite::types::Value::Null))
            .collect();

        insert_stmt.execute(rusqlite::params_from_iter(values.iter()))?;
        count += 1;
    }

    tracing::info!("Migrated {} records from {}", count, table_name);
    Ok(count)
}

/// Migrate a table that may or may not exist in the source database
fn migrate_table_optional(
    source_conn: &Connection,
    dest_conn: &Connection,
    table_name: &str,
    columns: &[&str],
) -> MigrationResult<usize> {
    // Check if table exists in source
    let table_exists: bool = source_conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?",
            [table_name],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !table_exists {
        tracing::info!("Table {} does not exist in source, skipping", table_name);
        return Ok(0);
    }

    migrate_table(source_conn, dest_conn, table_name, columns)
}

/// Verify data integrity after migration
///
/// Checks:
/// - All foreign key constraints are satisfied
/// - Record counts match between source and destination
/// - No orphaned records
pub fn verify_migration(
    source_path: &Path,
    dest_conn: &Connection,
) -> MigrationResult<Vec<String>> {
    let source_conn = Connection::open(source_path)?;
    let mut warnings = Vec::new();

    // Check record counts for core tables
    let tables = ["workspaces", "worktrees", "agents", "messages", "agent_sessions"];

    for table in tables {
        let source_count: i64 = source_conn
            .query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |row| {
                row.get(0)
            })
            .unwrap_or(0);

        let dest_count: i64 = dest_conn
            .query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |row| {
                row.get(0)
            })
            .unwrap_or(0);

        if source_count != dest_count {
            warnings.push(format!(
                "Record count mismatch in {}: source={}, dest={}",
                table, source_count, dest_count
            ));
        }
    }

    // Check foreign key integrity
    let fk_check: Vec<(String,)> = dest_conn
        .prepare("PRAGMA foreign_key_check")?
        .query_map([], |row| Ok((row.get::<_, String>(0)?,)))?
        .filter_map(|r| r.ok())
        .collect();

    if !fk_check.is_empty() {
        for (table,) in fk_check {
            warnings.push(format!("Foreign key violation in table: {}", table));
        }
    }

    // Check for orphaned agents (worktree doesn't exist)
    let orphaned_agents: i64 = dest_conn
        .query_row(
            r#"SELECT COUNT(*) FROM agents
               WHERE worktree_id NOT IN (SELECT id FROM worktrees)"#,
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if orphaned_agents > 0 {
        warnings.push(format!(
            "Found {} orphaned agents (worktree doesn't exist)",
            orphaned_agents
        ));
    }

    // Check for orphaned worktrees (workspace doesn't exist)
    let orphaned_worktrees: i64 = dest_conn
        .query_row(
            r#"SELECT COUNT(*) FROM worktrees
               WHERE workspace_id NOT IN (SELECT id FROM workspaces)"#,
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if orphaned_worktrees > 0 {
        warnings.push(format!(
            "Found {} orphaned worktrees (workspace doesn't exist)",
            orphaned_worktrees
        ));
    }

    Ok(warnings)
}

/// Get the default Node.js database path
pub fn default_nodejs_db_path() -> PathBuf {
    // Node.js backend stores database in ~/.claude-manager/database.db
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".claude-manager").join("database.db")
}

/// Get the default Rust/Tauri database path
pub fn default_rust_db_path() -> PathBuf {
    // Rust backend stores database in app data directory
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".claude-manager").join("claude-manager.db")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn setup_source_db(path: &Path) -> Connection {
        let conn = Connection::open(path).unwrap();

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS worktrees (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                name TEXT NOT NULL,
                branch TEXT NOT NULL,
                path TEXT NOT NULL,
                sort_mode TEXT DEFAULT 'free',
                display_order INTEGER DEFAULT 0,
                is_main INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                worktree_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'finished',
                context_level INTEGER DEFAULT 0,
                mode TEXT DEFAULT 'regular',
                permissions TEXT DEFAULT '[]',
                display_order INTEGER DEFAULT 0,
                pid INTEGER,
                session_id TEXT,
                parent_agent_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                stopped_at TEXT,
                deleted_at TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                token_count INTEGER,
                tool_name TEXT,
                tool_input TEXT,
                tool_output TEXT,
                is_complete INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_sessions (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                session_data TEXT,
                context_snapshot TEXT,
                created_at TEXT NOT NULL
            );

            -- Insert test data
            INSERT INTO workspaces VALUES ('ws_1', 'Test Workspace', '/tmp/test', datetime('now'), datetime('now'));
            INSERT INTO worktrees VALUES ('wt_1', 'ws_1', 'main', 'main', '/tmp/test', 'free', 0, 1, datetime('now'), datetime('now'));
            INSERT INTO agents VALUES ('ag_1', 'wt_1', 'Test Agent', 'finished', 50, 'regular', '["read"]', 0, NULL, NULL, NULL, datetime('now'), datetime('now'), NULL, NULL, NULL);
            INSERT INTO messages VALUES ('msg_1', 'ag_1', 'user', 'Hello', 10, NULL, NULL, NULL, 1, datetime('now'));
            "#,
        )
        .unwrap();

        conn
    }

    fn setup_dest_db(path: &Path) -> Connection {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        crate::db::migrations::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_backup_database() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");

        // Create a file to backup
        fs::write(&db_path, "test content").unwrap();

        let backup_path = backup_database(&db_path).unwrap();

        assert!(backup_path.exists());
        assert!(backup_path
            .to_string_lossy()
            .contains(".db.backup."));
    }

    #[test]
    fn test_backup_nonexistent() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("nonexistent.db");

        let result = backup_database(&db_path);
        assert!(result.is_err());
    }

    #[test]
    fn test_migrate_from_nodejs() {
        let temp_dir = tempdir().unwrap();
        let source_path = temp_dir.path().join("source.db");
        let dest_path = temp_dir.path().join("dest.db");

        let _source_conn = setup_source_db(&source_path);
        let dest_conn = setup_dest_db(&dest_path);

        let stats = migrate_from_nodejs(&source_path, &dest_conn).unwrap();

        assert_eq!(stats.workspaces_migrated, 1);
        assert_eq!(stats.worktrees_migrated, 1);
        assert_eq!(stats.agents_migrated, 1);
        assert_eq!(stats.messages_migrated, 1);
    }

    #[test]
    fn test_verify_migration() {
        let temp_dir = tempdir().unwrap();
        let source_path = temp_dir.path().join("source.db");
        let dest_path = temp_dir.path().join("dest.db");

        let _source_conn = setup_source_db(&source_path);
        let dest_conn = setup_dest_db(&dest_path);

        migrate_from_nodejs(&source_path, &dest_conn).unwrap();

        let warnings = verify_migration(&source_path, &dest_conn).unwrap();
        assert!(
            warnings.is_empty(),
            "Expected no warnings but got: {:?}",
            warnings
        );
    }

    #[test]
    fn test_migration_stats() {
        let stats = MigrationStats {
            workspaces_migrated: 1,
            worktrees_migrated: 2,
            agents_migrated: 3,
            messages_migrated: 10,
            sessions_migrated: 1,
            usage_stats_migrated: 5,
        };

        assert_eq!(stats.total(), 22);
    }
}
