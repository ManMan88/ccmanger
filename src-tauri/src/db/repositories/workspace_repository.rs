//! Workspace repository for database operations

use rusqlite::params;

use crate::db::{DbPool, DbResult};
use crate::types::{Workspace, WorkspaceRow};

pub struct WorkspaceRepository {
    pool: DbPool,
}

impl WorkspaceRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn find_by_id(&self, id: &str) -> DbResult<Option<Workspace>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, path, created_at, updated_at, worktree_count, agent_count
            FROM workspaces WHERE id = ?
        "#,
        )?;

        let row = stmt
            .query_row([id], |row| {
                Ok(WorkspaceRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    worktree_count: row.get(5)?,
                    agent_count: row.get(6)?,
                })
            })
            .optional()?;

        Ok(row.map(Workspace::from))
    }

    pub fn find_all(&self) -> DbResult<Vec<Workspace>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, path, created_at, updated_at, worktree_count, agent_count
            FROM workspaces ORDER BY updated_at DESC
        "#,
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(WorkspaceRow {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                worktree_count: row.get(5)?,
                agent_count: row.get(6)?,
            })
        })?;

        let workspaces: Vec<Workspace> = rows.filter_map(|r| r.ok()).map(Workspace::from).collect();

        Ok(workspaces)
    }

    pub fn create(&self, workspace: &Workspace) -> DbResult<Workspace> {
        let conn = self.pool.get()?;

        conn.execute(
            r#"
            INSERT INTO workspaces (id, name, path, created_at, updated_at, worktree_count, agent_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
            params![
                workspace.id,
                workspace.name,
                workspace.path,
                workspace.created_at,
                workspace.updated_at,
                workspace.worktree_count,
                workspace.agent_count,
            ],
        )?;

        self.find_by_id(&workspace.id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn delete(&self, id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM workspaces WHERE id = ?", [id])?;
        Ok(())
    }

    pub fn update_counts(&self, id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;

        conn.execute(
            r#"
            UPDATE workspaces SET
                worktree_count = (SELECT COUNT(*) FROM worktrees WHERE workspace_id = ?),
                agent_count = (
                    SELECT COUNT(*) FROM agents a
                    JOIN worktrees w ON a.worktree_id = w.id
                    WHERE w.workspace_id = ? AND a.deleted_at IS NULL
                ),
                updated_at = datetime('now')
            WHERE id = ?
        "#,
            params![id, id, id],
        )?;

        Ok(())
    }
}

// Helper trait for optional query results
trait OptionalExt<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalExt<T> for Result<T, rusqlite::Error> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbPool;
    use r2d2::Pool;
    use r2d2_sqlite::SqliteConnectionManager;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // Counter for unique database paths
    static DB_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn create_test_pool() -> DbPool {
        // Use unique path for each test to avoid conflicts
        let counter = DB_COUNTER.fetch_add(1, Ordering::SeqCst);
        let db_path = format!(
            "/tmp/test_db_{}_workspace_{}.db",
            std::process::id(),
            counter
        );

        // Clean up if exists
        let _ = std::fs::remove_file(&db_path);

        let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
            conn.execute_batch(
                r#"
                PRAGMA foreign_keys = ON;
                "#,
            )?;
            Ok(())
        });

        let pool = Pool::builder().max_size(5).build(manager).unwrap();

        // Run migrations
        let conn = pool.get().unwrap();
        crate::db::migrations::run_migrations(&conn).unwrap();

        pool
    }

    fn create_test_workspace() -> Workspace {
        let now = chrono::Utc::now().to_rfc3339();
        Workspace {
            id: format!("ws_{}", uuid::Uuid::new_v4()),
            name: "Test Workspace".to_string(),
            path: format!("/tmp/test-workspace-{}", uuid::Uuid::new_v4()),
            created_at: now.clone(),
            updated_at: now,
            worktree_count: 0,
            agent_count: 0,
        }
    }

    #[test]
    fn test_create_workspace() {
        let pool = create_test_pool();
        let repo = WorkspaceRepository::new(pool);

        let workspace = create_test_workspace();
        let created = repo.create(&workspace).unwrap();

        assert_eq!(created.id, workspace.id);
        assert_eq!(created.name, "Test Workspace");
        assert_eq!(created.path, workspace.path);
    }

    #[test]
    fn test_find_by_id() {
        let pool = create_test_pool();
        let repo = WorkspaceRepository::new(pool);

        let workspace = create_test_workspace();
        repo.create(&workspace).unwrap();

        let found = repo.find_by_id(&workspace.id).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, workspace.id);
    }

    #[test]
    fn test_find_by_id_not_found() {
        let pool = create_test_pool();
        let repo = WorkspaceRepository::new(pool);

        let found = repo.find_by_id("nonexistent").unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn test_find_all() {
        let pool = create_test_pool();
        let repo = WorkspaceRepository::new(pool);

        let workspace1 = create_test_workspace();
        let workspace2 = create_test_workspace();

        repo.create(&workspace1).unwrap();
        repo.create(&workspace2).unwrap();

        let all = repo.find_all().unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_delete() {
        let pool = create_test_pool();
        let repo = WorkspaceRepository::new(pool);

        let workspace = create_test_workspace();
        repo.create(&workspace).unwrap();
        repo.delete(&workspace.id).unwrap();

        let found = repo.find_by_id(&workspace.id).unwrap();
        assert!(found.is_none());
    }
}
