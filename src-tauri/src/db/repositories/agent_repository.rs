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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbPool;
    use crate::types::{AgentMode, Permission, Workspace, Worktree};
    use r2d2::Pool;
    use r2d2_sqlite::SqliteConnectionManager;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // Counter for unique database paths
    static DB_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn create_test_pool() -> DbPool {
        // Use unique path for each test to avoid conflicts
        let counter = DB_COUNTER.fetch_add(1, Ordering::SeqCst);
        let db_path = format!("/tmp/test_db_{}_agent_{}.db", std::process::id(), counter);

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

    fn create_test_workspace(pool: &DbPool) -> Workspace {
        let now = chrono::Utc::now().to_rfc3339();
        let workspace = Workspace {
            id: format!("ws_{}", uuid::Uuid::new_v4()),
            name: "Test Workspace".to_string(),
            path: "/tmp/test-workspace".to_string(),
            created_at: now.clone(),
            updated_at: now,
            worktree_count: 0,
            agent_count: 0,
        };

        let conn = pool.get().unwrap();
        conn.execute(
            r#"INSERT INTO workspaces (id, name, path, created_at, updated_at, worktree_count, agent_count)
               VALUES (?, ?, ?, ?, ?, ?, ?)"#,
            rusqlite::params![
                workspace.id,
                workspace.name,
                workspace.path,
                workspace.created_at,
                workspace.updated_at,
                workspace.worktree_count,
                workspace.agent_count,
            ],
        )
        .unwrap();

        workspace
    }

    fn create_test_worktree(pool: &DbPool, workspace_id: &str) -> Worktree {
        let now = chrono::Utc::now().to_rfc3339();
        let worktree = Worktree {
            id: format!("wt_{}", uuid::Uuid::new_v4()),
            workspace_id: workspace_id.to_string(),
            name: "main".to_string(),
            branch: "main".to_string(),
            path: "/tmp/test-workspace".to_string(),
            sort_mode: crate::types::SortMode::Free,
            display_order: 0,
            is_main: true,
            created_at: now.clone(),
            updated_at: now,
        };

        let conn = pool.get().unwrap();
        conn.execute(
            r#"INSERT INTO worktrees (id, workspace_id, name, branch, path, sort_mode, display_order, is_main, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
            rusqlite::params![
                worktree.id,
                worktree.workspace_id,
                worktree.name,
                worktree.branch,
                worktree.path,
                "free",
                worktree.display_order,
                worktree.is_main as i32,
                worktree.created_at,
                worktree.updated_at,
            ],
        )
        .unwrap();

        worktree
    }

    fn create_test_agent(worktree_id: &str) -> Agent {
        let now = chrono::Utc::now().to_rfc3339();
        Agent {
            id: format!("ag_{}", uuid::Uuid::new_v4()),
            worktree_id: worktree_id.to_string(),
            name: "Test Agent".to_string(),
            status: AgentStatus::Finished,
            context_level: 0,
            mode: AgentMode::Regular,
            permissions: vec![Permission::Read],
            display_order: 0,
            pid: None,
            session_id: None,
            created_at: now.clone(),
            updated_at: now,
            started_at: None,
            stopped_at: None,
            deleted_at: None,
            parent_agent_id: None,
        }
    }

    #[test]
    fn test_create_agent() {
        let pool = create_test_pool();
        let workspace = create_test_workspace(&pool);
        let worktree = create_test_worktree(&pool, &workspace.id);
        let repo = AgentRepository::new(pool);

        let agent = create_test_agent(&worktree.id);
        let created = repo.create(&agent).unwrap();

        assert_eq!(created.id, agent.id);
        assert_eq!(created.name, "Test Agent");
        assert_eq!(created.status, AgentStatus::Finished);
        assert_eq!(created.mode, AgentMode::Regular);
    }

    #[test]
    fn test_find_by_id() {
        let pool = create_test_pool();
        let workspace = create_test_workspace(&pool);
        let worktree = create_test_worktree(&pool, &workspace.id);
        let repo = AgentRepository::new(pool);

        let agent = create_test_agent(&worktree.id);
        repo.create(&agent).unwrap();

        let found = repo.find_by_id(&agent.id).unwrap();
        assert!(found.is_some());
        let found = found.unwrap();
        assert_eq!(found.id, agent.id);
    }

    #[test]
    fn test_find_by_id_not_found() {
        let pool = create_test_pool();
        let repo = AgentRepository::new(pool);

        let found = repo.find_by_id("nonexistent").unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn test_find_by_worktree_id() {
        let pool = create_test_pool();
        let workspace = create_test_workspace(&pool);
        let worktree = create_test_worktree(&pool, &workspace.id);
        let repo = AgentRepository::new(pool.clone());

        // Create multiple agents
        let agent1 = create_test_agent(&worktree.id);
        let mut agent2 = create_test_agent(&worktree.id);
        agent2.name = "Agent 2".to_string();

        repo.create(&agent1).unwrap();
        repo.create(&agent2).unwrap();

        let agents = repo.find_by_worktree_id(&worktree.id, false).unwrap();
        assert_eq!(agents.len(), 2);
    }

    #[test]
    fn test_update_status() {
        let pool = create_test_pool();
        let workspace = create_test_workspace(&pool);
        let worktree = create_test_worktree(&pool, &workspace.id);
        let repo = AgentRepository::new(pool);

        let agent = create_test_agent(&worktree.id);
        repo.create(&agent).unwrap();

        repo.update_status(&agent.id, AgentStatus::Running, Some(12345))
            .unwrap();

        let updated = repo.find_by_id(&agent.id).unwrap().unwrap();
        assert_eq!(updated.status, AgentStatus::Running);
        assert_eq!(updated.pid, Some(12345));
    }

    #[test]
    fn test_soft_delete() {
        let pool = create_test_pool();
        let workspace = create_test_workspace(&pool);
        let worktree = create_test_worktree(&pool, &workspace.id);
        let repo = AgentRepository::new(pool);

        let agent = create_test_agent(&worktree.id);
        repo.create(&agent).unwrap();

        repo.soft_delete(&agent.id).unwrap();

        // Should not appear in normal query
        let agents = repo.find_by_worktree_id(&worktree.id, false).unwrap();
        assert_eq!(agents.len(), 0);

        // Should appear with include_deleted
        let agents = repo.find_by_worktree_id(&worktree.id, true).unwrap();
        assert_eq!(agents.len(), 1);
        assert!(agents[0].deleted_at.is_some());
    }

    #[test]
    fn test_restore() {
        let pool = create_test_pool();
        let workspace = create_test_workspace(&pool);
        let worktree = create_test_worktree(&pool, &workspace.id);
        let repo = AgentRepository::new(pool);

        let agent = create_test_agent(&worktree.id);
        repo.create(&agent).unwrap();
        repo.soft_delete(&agent.id).unwrap();
        repo.restore(&agent.id).unwrap();

        let restored = repo.find_by_id(&agent.id).unwrap().unwrap();
        assert!(restored.deleted_at.is_none());
    }

    #[test]
    fn test_hard_delete() {
        let pool = create_test_pool();
        let workspace = create_test_workspace(&pool);
        let worktree = create_test_worktree(&pool, &workspace.id);
        let repo = AgentRepository::new(pool);

        let agent = create_test_agent(&worktree.id);
        repo.create(&agent).unwrap();
        repo.hard_delete(&agent.id).unwrap();

        let found = repo.find_by_id(&agent.id).unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn test_reorder() {
        let pool = create_test_pool();
        let workspace = create_test_workspace(&pool);
        let worktree = create_test_worktree(&pool, &workspace.id);
        let repo = AgentRepository::new(pool.clone());

        let mut agent1 = create_test_agent(&worktree.id);
        let mut agent2 = create_test_agent(&worktree.id);
        agent1.name = "Agent 1".to_string();
        agent2.name = "Agent 2".to_string();

        let created1 = repo.create(&agent1).unwrap();
        let created2 = repo.create(&agent2).unwrap();

        // Reorder: agent2 first, then agent1
        repo.reorder(&worktree.id, &[created2.id.clone(), created1.id.clone()])
            .unwrap();

        let agents = repo.find_by_worktree_id(&worktree.id, false).unwrap();
        assert_eq!(agents[0].display_order, 0);
        assert_eq!(agents[1].display_order, 1);
    }

    #[test]
    fn test_clear_running_pids() {
        let pool = create_test_pool();
        let workspace = create_test_workspace(&pool);
        let worktree = create_test_worktree(&pool, &workspace.id);
        let repo = AgentRepository::new(pool);

        let agent = create_test_agent(&worktree.id);
        repo.create(&agent).unwrap();
        repo.update_status(&agent.id, AgentStatus::Running, Some(12345))
            .unwrap();

        repo.clear_running_pids().unwrap();

        let updated = repo.find_by_id(&agent.id).unwrap().unwrap();
        assert_eq!(updated.status, AgentStatus::Finished);
        assert!(updated.pid.is_none());
    }
}
