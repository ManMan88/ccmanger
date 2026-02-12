//! Agent service for managing Claude Code agents

use std::sync::Arc;

use thiserror::Error;
use uuid::Uuid;

use crate::db::{AgentRepository, DbPool};
use crate::services::{ProcessError, ProcessManager};
use crate::types::{Agent, AgentMode, AgentStatus, Permission, UpdateAgentInput};

#[derive(Error, Debug)]
pub enum AgentError {
    #[error("Agent not found: {0}")]
    NotFound(String),
    #[error("Database error: {0}")]
    Database(String),
    #[error("Process error: {0}")]
    Process(#[from] ProcessError),
    #[error("Validation error: {0}")]
    Validation(String),
}

pub struct AgentService {
    agent_repo: AgentRepository,
    process_manager: Arc<ProcessManager>,
}

impl AgentService {
    pub fn new(pool: DbPool, process_manager: Arc<ProcessManager>) -> Self {
        Self {
            agent_repo: AgentRepository::new(pool),
            process_manager,
        }
    }

    /// Create a new agent
    pub fn create_agent(
        &self,
        worktree_id: &str,
        name: Option<String>,
        mode: AgentMode,
        permissions: Vec<Permission>,
    ) -> Result<Agent, AgentError> {
        let agent_name =
            name.unwrap_or_else(|| format!("Agent {}", chrono::Utc::now().format("%H:%M")));

        let now = chrono::Utc::now().to_rfc3339();
        let agent = Agent {
            id: format!(
                "ag_{}{}",
                chrono::Utc::now().timestamp_millis(),
                &Uuid::new_v4().to_string()[..8]
            ),
            worktree_id: worktree_id.to_string(),
            name: agent_name,
            status: AgentStatus::Idle,
            context_level: 0,
            mode,
            permissions,
            display_order: 0,
            pid: None,
            session_id: None,
            created_at: now.clone(),
            updated_at: now,
            started_at: None,
            stopped_at: None,
            deleted_at: None,
            parent_agent_id: None,
        };

        self.agent_repo
            .create(&agent)
            .map_err(|e| AgentError::Database(e.to_string()))
    }

    /// Get an agent by ID
    pub fn get_agent(&self, id: &str) -> Result<Agent, AgentError> {
        self.agent_repo
            .find_by_id(id)
            .map_err(|e| AgentError::Database(e.to_string()))?
            .ok_or_else(|| AgentError::NotFound(id.to_string()))
    }

    /// List agents for a worktree
    pub fn list_agents(
        &self,
        worktree_id: &str,
        include_deleted: bool,
    ) -> Result<Vec<Agent>, AgentError> {
        self.agent_repo
            .find_by_worktree_id(worktree_id, include_deleted)
            .map_err(|e| AgentError::Database(e.to_string()))
    }

    /// Update an agent
    pub fn update_agent(&self, id: &str, input: UpdateAgentInput) -> Result<Agent, AgentError> {
        let mut agent = self.get_agent(id)?;

        if let Some(name) = input.name {
            agent.name = name;
        }
        if let Some(mode) = input.mode {
            agent.mode = mode;
        }
        if let Some(permissions) = input.permissions {
            agent.permissions = permissions;
        }
        if let Some(display_order) = input.display_order {
            agent.display_order = display_order;
        }

        agent.updated_at = chrono::Utc::now().to_rfc3339();

        self.agent_repo
            .update(&agent)
            .map_err(|e| AgentError::Database(e.to_string()))
    }

    /// Start an agent
    pub fn start_agent(
        &self,
        id: &str,
        worktree_path: &str,
        initial_prompt: Option<&str>,
    ) -> Result<Agent, AgentError> {
        let agent = self.get_agent(id)?;

        let (pid, session_id) = self.process_manager.spawn_agent(
            id,
            worktree_path,
            agent.mode,
            &agent.permissions,
            initial_prompt,
            agent.session_id.as_deref(),
        )?;

        self.agent_repo
            .update_status(id, AgentStatus::Running, Some(pid as i32))
            .map_err(|e| AgentError::Database(e.to_string()))?;

        // Persist session_id for future resume and hook matching
        self.agent_repo
            .update_session_id(id, &session_id)
            .map_err(|e| AgentError::Database(e.to_string()))?;

        self.get_agent(id)
    }

    /// Stop an agent
    pub fn stop_agent(&self, id: &str, force: bool) -> Result<Agent, AgentError> {
        self.process_manager.stop_agent(id, force)?;

        if force {
            // For force stop, update DB immediately since process is killed
            self.agent_repo
                .update_status(id, AgentStatus::Idle, None)
                .map_err(|e| AgentError::Database(e.to_string()))?;
        }
        // For graceful stop (SIGINT), the DB status sync task in main.rs
        // will update when the process actually exits

        self.get_agent(id)
    }

    /// Delete an agent
    pub fn delete_agent(&self, id: &str, archive: bool) -> Result<(), AgentError> {
        // Stop if running
        if self.process_manager.is_running(id) {
            self.process_manager.stop_agent(id, true)?;
        }

        if archive {
            self.agent_repo.soft_delete(id)
        } else {
            self.agent_repo.hard_delete(id)
        }
        .map_err(|e| AgentError::Database(e.to_string()))
    }

    /// Restore a deleted agent
    pub fn restore_agent(&self, id: &str) -> Result<Agent, AgentError> {
        self.agent_repo
            .restore(id)
            .map_err(|e| AgentError::Database(e.to_string()))?;

        self.get_agent(id)
    }

    /// Reorder agents
    pub fn reorder_agents(
        &self,
        worktree_id: &str,
        agent_ids: &[String],
    ) -> Result<Vec<Agent>, AgentError> {
        self.agent_repo
            .reorder(worktree_id, agent_ids)
            .map_err(|e| AgentError::Database(e.to_string()))?;

        self.list_agents(worktree_id, false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DbPool;
    use crate::types::{SortMode, Workspace, Worktree};
    use r2d2::Pool;
    use r2d2_sqlite::SqliteConnectionManager;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static DB_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn create_test_pool() -> DbPool {
        let counter = DB_COUNTER.fetch_add(1, Ordering::SeqCst);
        let db_path = format!(
            "/tmp/test_db_{}_agent_service_{}.db",
            std::process::id(),
            counter
        );
        let _ = std::fs::remove_file(&db_path);

        let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
            conn.execute_batch("PRAGMA foreign_keys = ON;")?;
            Ok(())
        });

        let pool = Pool::builder().max_size(5).build(manager).unwrap();
        let conn = pool.get().unwrap();
        crate::db::migrations::run_migrations(&conn).unwrap();

        pool
    }

    fn setup_test_data(pool: &DbPool) -> (Workspace, Worktree) {
        let now = chrono::Utc::now().to_rfc3339();
        let workspace = Workspace {
            id: format!("ws_{}", Uuid::new_v4()),
            name: "Test Workspace".to_string(),
            path: format!("/tmp/test-workspace-{}", Uuid::new_v4()),
            created_at: now.clone(),
            updated_at: now.clone(),
            worktree_count: 0,
            agent_count: 0,
        };

        let worktree = Worktree {
            id: format!("wt_{}", Uuid::new_v4()),
            workspace_id: workspace.id.clone(),
            name: "main".to_string(),
            branch: "main".to_string(),
            path: workspace.path.clone(),
            sort_mode: SortMode::Free,
            display_order: 0,
            is_main: true,
            created_at: now.clone(),
            updated_at: now,
        };

        let conn = pool.get().unwrap();
        conn.execute(
            r#"INSERT INTO workspaces (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"#,
            rusqlite::params![
                workspace.id,
                workspace.name,
                workspace.path,
                workspace.created_at,
                workspace.updated_at,
            ],
        )
        .unwrap();

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

        (workspace, worktree)
    }

    #[test]
    fn test_create_agent() {
        let pool = create_test_pool();
        let (_, worktree) = setup_test_data(&pool);
        let process_manager = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, process_manager);

        let agent = service
            .create_agent(
                &worktree.id,
                Some("Test Agent".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .unwrap();

        assert_eq!(agent.name, "Test Agent");
        assert_eq!(agent.mode, AgentMode::Regular);
        assert_eq!(agent.status, AgentStatus::Idle);
        assert!(agent.id.starts_with("ag_"));
    }

    #[test]
    fn test_get_agent() {
        let pool = create_test_pool();
        let (_, worktree) = setup_test_data(&pool);
        let process_manager = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, process_manager);

        let created = service
            .create_agent(
                &worktree.id,
                Some("Test Agent".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .unwrap();

        let found = service.get_agent(&created.id).unwrap();
        assert_eq!(found.id, created.id);
        assert_eq!(found.name, "Test Agent");
    }

    #[test]
    fn test_get_agent_not_found() {
        let pool = create_test_pool();
        let process_manager = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, process_manager);

        let result = service.get_agent("nonexistent");
        assert!(matches!(result, Err(AgentError::NotFound(_))));
    }

    #[test]
    fn test_list_agents() {
        let pool = create_test_pool();
        let (_, worktree) = setup_test_data(&pool);
        let process_manager = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, process_manager);

        service
            .create_agent(
                &worktree.id,
                Some("Agent 1".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .unwrap();
        service
            .create_agent(
                &worktree.id,
                Some("Agent 2".to_string()),
                AgentMode::Auto,
                vec![Permission::Read, Permission::Write],
            )
            .unwrap();

        let agents = service.list_agents(&worktree.id, false).unwrap();
        assert_eq!(agents.len(), 2);
    }

    #[test]
    fn test_update_agent() {
        let pool = create_test_pool();
        let (_, worktree) = setup_test_data(&pool);
        let process_manager = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, process_manager);

        let created = service
            .create_agent(
                &worktree.id,
                Some("Test Agent".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .unwrap();

        let updated = service
            .update_agent(
                &created.id,
                UpdateAgentInput {
                    name: Some("Updated Agent".to_string()),
                    mode: Some(AgentMode::Auto),
                    permissions: None,
                    display_order: None,
                },
            )
            .unwrap();

        assert_eq!(updated.name, "Updated Agent");
        assert_eq!(updated.mode, AgentMode::Auto);
    }

    #[test]
    fn test_delete_agent_archive() {
        let pool = create_test_pool();
        let (_, worktree) = setup_test_data(&pool);
        let process_manager = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, process_manager);

        let created = service
            .create_agent(
                &worktree.id,
                Some("Test Agent".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .unwrap();

        service.delete_agent(&created.id, true).unwrap();

        // Should not appear in normal list
        let agents = service.list_agents(&worktree.id, false).unwrap();
        assert_eq!(agents.len(), 0);

        // Should appear with include_deleted
        let agents = service.list_agents(&worktree.id, true).unwrap();
        assert_eq!(agents.len(), 1);
    }

    #[test]
    fn test_delete_agent_permanent() {
        let pool = create_test_pool();
        let (_, worktree) = setup_test_data(&pool);
        let process_manager = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, process_manager);

        let created = service
            .create_agent(
                &worktree.id,
                Some("Test Agent".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .unwrap();

        service.delete_agent(&created.id, false).unwrap();

        // Should not appear even with include_deleted
        let agents = service.list_agents(&worktree.id, true).unwrap();
        assert_eq!(agents.len(), 0);
    }

    #[test]
    fn test_restore_agent() {
        let pool = create_test_pool();
        let (_, worktree) = setup_test_data(&pool);
        let process_manager = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, process_manager);

        let created = service
            .create_agent(
                &worktree.id,
                Some("Test Agent".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .unwrap();

        service.delete_agent(&created.id, true).unwrap();
        let restored = service.restore_agent(&created.id).unwrap();

        assert!(restored.deleted_at.is_none());

        let agents = service.list_agents(&worktree.id, false).unwrap();
        assert_eq!(agents.len(), 1);
    }

    #[test]
    fn test_reorder_agents() {
        let pool = create_test_pool();
        let (_, worktree) = setup_test_data(&pool);
        let process_manager = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, process_manager);

        let agent1 = service
            .create_agent(
                &worktree.id,
                Some("Agent 1".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .unwrap();
        let agent2 = service
            .create_agent(
                &worktree.id,
                Some("Agent 2".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            )
            .unwrap();

        // Reorder: agent2 first
        let reordered = service
            .reorder_agents(&worktree.id, &[agent2.id.clone(), agent1.id.clone()])
            .unwrap();

        assert_eq!(reordered[0].display_order, 0);
        assert_eq!(reordered[1].display_order, 1);
    }
}
