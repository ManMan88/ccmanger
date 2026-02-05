//! Worktree repository for database operations

use rusqlite::params;

use crate::db::{DbPool, DbResult};
use crate::types::{Worktree, WorktreeRow};

pub struct WorktreeRepository {
    pool: DbPool,
}

impl WorktreeRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn find_by_id(&self, id: &str) -> DbResult<Option<Worktree>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at
            FROM worktrees WHERE id = ?
        "#,
        )?;

        let row = stmt
            .query_row([id], |row| {
                Ok(WorktreeRow {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    name: row.get(2)?,
                    branch: row.get(3)?,
                    path: row.get(4)?,
                    sort_mode: row.get(5)?,
                    display_order: row.get(6)?,
                    is_main: row.get::<_, i32>(7)? != 0,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .optional()?;

        Ok(row.map(Worktree::from))
    }

    pub fn find_by_path(&self, path: &str) -> DbResult<Option<Worktree>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at
            FROM worktrees WHERE path = ?
        "#,
        )?;

        let row = stmt
            .query_row([path], |row| {
                Ok(WorktreeRow {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    name: row.get(2)?,
                    branch: row.get(3)?,
                    path: row.get(4)?,
                    sort_mode: row.get(5)?,
                    display_order: row.get(6)?,
                    is_main: row.get::<_, i32>(7)? != 0,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .optional()?;

        Ok(row.map(Worktree::from))
    }

    pub fn find_by_workspace_id(&self, workspace_id: &str) -> DbResult<Vec<Worktree>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at
            FROM worktrees WHERE workspace_id = ? ORDER BY display_order, created_at
        "#,
        )?;

        let rows = stmt.query_map([workspace_id], |row| {
            Ok(WorktreeRow {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                branch: row.get(3)?,
                path: row.get(4)?,
                sort_mode: row.get(5)?,
                display_order: row.get(6)?,
                is_main: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;

        let worktrees: Vec<Worktree> = rows.filter_map(|r| r.ok()).map(Worktree::from).collect();

        Ok(worktrees)
    }

    pub fn create(&self, worktree: &Worktree) -> DbResult<Worktree> {
        let conn = self.pool.get()?;

        conn.execute(
            r#"
            INSERT INTO worktrees (id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
            params![
                worktree.id,
                worktree.workspace_id,
                worktree.name,
                worktree.branch,
                worktree.path,
                worktree.sort_mode.as_str(),
                worktree.display_order,
                worktree.is_main as i32,
                worktree.created_at,
                worktree.updated_at,
            ],
        )?;

        self.find_by_id(&worktree.id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn update(&self, worktree: &Worktree) -> DbResult<Worktree> {
        let conn = self.pool.get()?;

        conn.execute(
            r#"
            UPDATE worktrees SET
                name = ?,
                branch = ?,
                sort_mode = ?,
                display_order = ?,
                updated_at = datetime('now')
            WHERE id = ?
        "#,
            params![
                worktree.name,
                worktree.branch,
                worktree.sort_mode.as_str(),
                worktree.display_order,
                worktree.id,
            ],
        )?;

        self.find_by_id(&worktree.id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn delete(&self, id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM worktrees WHERE id = ?", [id])?;
        Ok(())
    }

    pub fn reorder(&self, workspace_id: &str, worktree_ids: &[String]) -> DbResult<()> {
        let conn = self.pool.get()?;

        for (index, id) in worktree_ids.iter().enumerate() {
            conn.execute(
                r#"
                UPDATE worktrees SET display_order = ?, updated_at = datetime('now')
                WHERE id = ? AND workspace_id = ?
            "#,
                params![index as i32, id, workspace_id],
            )?;
        }

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
