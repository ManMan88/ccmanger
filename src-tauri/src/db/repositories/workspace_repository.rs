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
