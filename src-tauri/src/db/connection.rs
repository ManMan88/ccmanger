//! Database connection management

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("Database error: {0}")]
    Rusqlite(#[from] rusqlite::Error),
    #[error("Pool error: {0}")]
    Pool(#[from] r2d2::Error),
    #[error("Migration error: {0}")]
    Migration(String),
    #[error("Not found")]
    NotFound,
}

pub type DbPool = Pool<SqliteConnectionManager>;
pub type DbResult<T> = Result<T, DbError>;

/// Initialize the database connection pool and run migrations
pub fn init_database(data_dir: PathBuf) -> DbResult<DbPool> {
    let db_path = data_dir.join("claude-manager.db");

    // Ensure directory exists
    std::fs::create_dir_all(&data_dir).ok();

    tracing::info!("Initializing database at {:?}", db_path);

    let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
        // Enable WAL mode and foreign keys
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA cache_size = -64000;
            PRAGMA synchronous = NORMAL;
        "#,
        )?;
        Ok(())
    });

    let pool = Pool::builder().max_size(10).build(manager)?;

    // Run migrations
    {
        let conn = pool.get()?;
        super::migrations::run_migrations(&conn)?;
    }

    Ok(pool)
}
