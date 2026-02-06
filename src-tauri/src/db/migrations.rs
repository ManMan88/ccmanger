//! Database migrations

use rusqlite::Connection;

use super::DbResult;

/// Run all pending migrations
pub fn run_migrations(conn: &Connection) -> DbResult<()> {
    // Create migrations table
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now')),
            checksum TEXT
        )
    "#,
        [],
    )?;

    let migrations = vec![(
        1,
        "initial_schema",
        include_str!("migrations/001_initial_schema.sql"),
    )];

    for (version, name, sql) in migrations {
        let applied: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM schema_migrations WHERE version = ?",
                [version],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !applied {
            tracing::info!("Running migration {}: {}", version, name);
            conn.execute_batch(sql)?;
            conn.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                rusqlite::params![version, name],
            )?;
            tracing::info!("Applied migration {}: {}", version, name);
        }
    }

    Ok(())
}
