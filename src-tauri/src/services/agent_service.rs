//! Agent service for managing Claude Code agents

use std::sync::Arc;

use thiserror::Error;
use uuid::Uuid;

use crate::db::{AgentRepository, DbPool, MessageRepository};
use crate::services::{ProcessError, ProcessManager};
use crate::types::{
    Agent, AgentMode, AgentStatus, Message, MessageRole, Permission, UpdateAgentInput,
};

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
    message_repo: MessageRepository,
    process_manager: Arc<ProcessManager>,
}

impl AgentService {
    pub fn new(pool: DbPool, process_manager: Arc<ProcessManager>) -> Self {
        Self {
            agent_repo: AgentRepository::new(pool.clone()),
            message_repo: MessageRepository::new(pool),
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
            status: AgentStatus::Finished,
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

        let pid = self.process_manager.spawn_agent(
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

        self.get_agent(id)
    }

    /// Stop an agent
    pub fn stop_agent(&self, id: &str, force: bool) -> Result<Agent, AgentError> {
        self.process_manager.stop_agent(id, force)?;

        self.agent_repo
            .update_status(id, AgentStatus::Finished, None)
            .map_err(|e| AgentError::Database(e.to_string()))?;

        self.get_agent(id)
    }

    /// Send a message to an agent
    pub fn send_message(&self, id: &str, content: &str) -> Result<Message, AgentError> {
        let now = chrono::Utc::now().to_rfc3339();
        let message = Message {
            id: format!(
                "msg_{}{}",
                chrono::Utc::now().timestamp_millis(),
                &Uuid::new_v4().to_string()[..8]
            ),
            agent_id: id.to_string(),
            role: MessageRole::User,
            content: content.to_string(),
            token_count: None,
            tool_name: None,
            tool_input: None,
            tool_output: None,
            created_at: now,
            is_complete: true,
        };

        self.message_repo
            .create(&message)
            .map_err(|e| AgentError::Database(e.to_string()))?;

        self.process_manager.send_message(id, content)?;

        Ok(message)
    }

    /// Get messages for an agent
    pub fn get_messages(
        &self,
        agent_id: &str,
        limit: usize,
        before: Option<&str>,
    ) -> Result<(Vec<Message>, bool, Option<String>), AgentError> {
        self.message_repo
            .get_paginated(agent_id, limit, before)
            .map_err(|e| AgentError::Database(e.to_string()))
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

    /// Fork an agent
    pub fn fork_agent(&self, id: &str, name: Option<String>) -> Result<Agent, AgentError> {
        let parent = self.get_agent(id)?;
        let now = chrono::Utc::now().to_rfc3339();

        let forked = Agent {
            id: format!(
                "ag_{}{}",
                chrono::Utc::now().timestamp_millis(),
                &Uuid::new_v4().to_string()[..8]
            ),
            name: name.unwrap_or_else(|| format!("{} (fork)", parent.name)),
            parent_agent_id: Some(parent.id.clone()),
            status: AgentStatus::Finished,
            pid: None,
            session_id: parent.session_id.clone(),
            worktree_id: parent.worktree_id,
            context_level: parent.context_level,
            mode: parent.mode,
            permissions: parent.permissions,
            display_order: parent.display_order + 1,
            created_at: now.clone(),
            updated_at: now,
            started_at: None,
            stopped_at: None,
            deleted_at: None,
        };

        self.agent_repo
            .create(&forked)
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
