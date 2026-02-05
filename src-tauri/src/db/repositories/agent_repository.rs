//! Agent repository for database operations

use rusqlite::params;

use crate::db::{DbPool, DbResult};
use crate::types::{Agent, AgentRow, AgentStatus};

pub struct AgentRepository {
    pool: DbPool,
}

impl AgentRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn find_by_id(&self, id: &str) -> DbResult<Option<Agent>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, worktree_id, name, status, context_level, mode, permissions,
                   display_order, pid, session_id, created_at, updated_at,
                   started_at, stopped_at, deleted_at, parent_agent_id
            FROM agents WHERE id = ?
        "#,
        )?;

        let row = stmt
            .query_row([id], |row| {
                Ok(AgentRow {
                    id: row.get(0)?,
                    worktree_id: row.get(1)?,
                    name: row.get(2)?,
                    status: row.get(3)?,
                    context_level: row.get(4)?,
                    mode: row.get(5)?,
                    permissions: row.get(6)?,
                    display_order: row.get(7)?,
                    pid: row.get(8)?,
                    session_id: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    started_at: row.get(12)?,
                    stopped_at: row.get(13)?,
                    deleted_at: row.get(14)?,
                    parent_agent_id: row.get(15)?,
                })
            })
            .optional()?;

        Ok(row.map(Agent::from))
    }

    pub fn find_by_worktree_id(
        &self,
        worktree_id: &str,
        include_deleted: bool,
    ) -> DbResult<Vec<Agent>> {
        let conn = self.pool.get()?;
        let sql = if include_deleted {
            r#"
                SELECT id, worktree_id, name, status, context_level, mode, permissions,
                       display_order, pid, session_id, created_at, updated_at,
                       started_at, stopped_at, deleted_at, parent_agent_id
                FROM agents WHERE worktree_id = ? ORDER BY display_order
            "#
        } else {
            r#"
                SELECT id, worktree_id, name, status, context_level, mode, permissions,
                       display_order, pid, session_id, created_at, updated_at,
                       started_at, stopped_at, deleted_at, parent_agent_id
                FROM agents WHERE worktree_id = ? AND deleted_at IS NULL ORDER BY display_order
            "#
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([worktree_id], |row| {
            Ok(AgentRow {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                name: row.get(2)?,
                status: row.get(3)?,
                context_level: row.get(4)?,
                mode: row.get(5)?,
                permissions: row.get(6)?,
                display_order: row.get(7)?,
                pid: row.get(8)?,
                session_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                started_at: row.get(12)?,
                stopped_at: row.get(13)?,
                deleted_at: row.get(14)?,
                parent_agent_id: row.get(15)?,
            })
        })?;

        let agents: Vec<Agent> = rows.filter_map(|r| r.ok()).map(Agent::from).collect();

        Ok(agents)
    }

    pub fn find_deleted_by_worktree_id(&self, worktree_id: &str) -> DbResult<Vec<Agent>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, worktree_id, name, status, context_level, mode, permissions,
                   display_order, pid, session_id, created_at, updated_at,
                   started_at, stopped_at, deleted_at, parent_agent_id
            FROM agents WHERE worktree_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC
        "#,
        )?;

        let rows = stmt.query_map([worktree_id], |row| {
            Ok(AgentRow {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                name: row.get(2)?,
                status: row.get(3)?,
                context_level: row.get(4)?,
                mode: row.get(5)?,
                permissions: row.get(6)?,
                display_order: row.get(7)?,
                pid: row.get(8)?,
                session_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                started_at: row.get(12)?,
                stopped_at: row.get(13)?,
                deleted_at: row.get(14)?,
                parent_agent_id: row.get(15)?,
            })
        })?;

        let agents: Vec<Agent> = rows.filter_map(|r| r.ok()).map(Agent::from).collect();

        Ok(agents)
    }

    pub fn create(&self, agent: &Agent) -> DbResult<Agent> {
        let conn = self.pool.get()?;
        let permissions_json =
            serde_json::to_string(&agent.permissions).unwrap_or_else(|_| "[\"read\"]".to_string());

        conn.execute(
            r#"
            INSERT INTO agents (id, worktree_id, name, status, context_level, mode,
                               permissions, display_order, pid, session_id, parent_agent_id,
                               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
            params![
                agent.id,
                agent.worktree_id,
                agent.name,
                agent.status.as_str(),
                agent.context_level,
                agent.mode.as_str(),
                permissions_json,
                agent.display_order,
                agent.pid,
                agent.session_id,
                agent.parent_agent_id,
                agent.created_at,
                agent.updated_at,
            ],
        )?;

        self.find_by_id(&agent.id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn update(&self, agent: &Agent) -> DbResult<Agent> {
        let conn = self.pool.get()?;
        let permissions_json =
            serde_json::to_string(&agent.permissions).unwrap_or_else(|_| "[\"read\"]".to_string());

        conn.execute(
            r#"
            UPDATE agents SET
                name = ?,
                status = ?,
                context_level = ?,
                mode = ?,
                permissions = ?,
                display_order = ?,
                pid = ?,
                session_id = ?,
                updated_at = datetime('now')
            WHERE id = ?
        "#,
            params![
                agent.name,
                agent.status.as_str(),
                agent.context_level,
                agent.mode.as_str(),
                permissions_json,
                agent.display_order,
                agent.pid,
                agent.session_id,
                agent.id,
            ],
        )?;

        self.find_by_id(&agent.id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows.into())
    }

    pub fn update_status(
        &self,
        id: &str,
        status: AgentStatus,
        pid: Option<i32>,
    ) -> DbResult<()> {
        let conn = self.pool.get()?;

        conn.execute(
            r#"
            UPDATE agents
            SET status = ?, pid = ?, updated_at = datetime('now')
            WHERE id = ?
        "#,
            params![status.as_str(), pid, id],
        )?;

        Ok(())
    }

    pub fn soft_delete(&self, id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute(
            r#"
            UPDATE agents
            SET deleted_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
        "#,
            [id],
        )?;
        Ok(())
    }

    pub fn hard_delete(&self, id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM agents WHERE id = ?", [id])?;
        Ok(())
    }

    pub fn restore(&self, id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute(
            r#"
            UPDATE agents
            SET deleted_at = NULL, updated_at = datetime('now')
            WHERE id = ?
        "#,
            [id],
        )?;
        Ok(())
    }

    pub fn clear_running_pids(&self) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute(
            r#"
            UPDATE agents
            SET pid = NULL, status = 'finished', updated_at = datetime('now')
            WHERE pid IS NOT NULL
        "#,
            [],
        )?;
        Ok(())
    }

    pub fn reorder(&self, worktree_id: &str, agent_ids: &[String]) -> DbResult<()> {
        let conn = self.pool.get()?;

        for (index, id) in agent_ids.iter().enumerate() {
            conn.execute(
                r#"
                UPDATE agents SET display_order = ?, updated_at = datetime('now')
                WHERE id = ? AND worktree_id = ?
            "#,
                params![index as i32, id, worktree_id],
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
