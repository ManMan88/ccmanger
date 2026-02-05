//! Agent type definitions

use serde::{Deserialize, Serialize};

/// Agent status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Running,
    Waiting,
    Error,
    #[default]
    Finished,
}

impl AgentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentStatus::Running => "running",
            AgentStatus::Waiting => "waiting",
            AgentStatus::Error => "error",
            AgentStatus::Finished => "finished",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "running" => AgentStatus::Running,
            "waiting" => AgentStatus::Waiting,
            "error" => AgentStatus::Error,
            _ => AgentStatus::Finished,
        }
    }
}

/// Agent mode enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AgentMode {
    Auto,
    Plan,
    #[default]
    Regular,
}

impl AgentMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentMode::Auto => "auto",
            AgentMode::Plan => "plan",
            AgentMode::Regular => "regular",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "auto" => AgentMode::Auto,
            "plan" => AgentMode::Plan,
            _ => AgentMode::Regular,
        }
    }
}

/// Permission enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    Read,
    Write,
    Execute,
}

impl Permission {
    pub fn as_str(&self) -> &'static str {
        match self {
            Permission::Read => "read",
            Permission::Write => "write",
            Permission::Execute => "execute",
        }
    }
}

/// Database row representation (snake_case fields)
#[derive(Debug, Clone)]
pub struct AgentRow {
    pub id: String,
    pub worktree_id: String,
    pub name: String,
    pub status: String,
    pub context_level: i32,
    pub mode: String,
    pub permissions: String, // JSON array
    pub display_order: i32,
    pub pid: Option<i32>,
    pub session_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub stopped_at: Option<String>,
    pub deleted_at: Option<String>,
    pub parent_agent_id: Option<String>,
}

/// API representation (camelCase via serde)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub worktree_id: String,
    pub name: String,
    pub status: AgentStatus,
    pub context_level: i32,
    pub mode: AgentMode,
    pub permissions: Vec<Permission>,
    pub display_order: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stopped_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_agent_id: Option<String>,
}

impl From<AgentRow> for Agent {
    fn from(row: AgentRow) -> Self {
        Agent {
            id: row.id,
            worktree_id: row.worktree_id,
            name: row.name,
            status: AgentStatus::from_str(&row.status),
            context_level: row.context_level,
            mode: AgentMode::from_str(&row.mode),
            permissions: serde_json::from_str(&row.permissions).unwrap_or_else(|_| vec![Permission::Read]),
            display_order: row.display_order,
            pid: row.pid,
            session_id: row.session_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            started_at: row.started_at,
            stopped_at: row.stopped_at,
            deleted_at: row.deleted_at,
            parent_agent_id: row.parent_agent_id,
        }
    }
}

/// Input for creating a new agent
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentInput {
    pub worktree_id: String,
    pub name: Option<String>,
    pub mode: Option<AgentMode>,
    pub permissions: Option<Vec<Permission>>,
    pub initial_prompt: Option<String>,
}

/// Input for updating an agent
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgentInput {
    pub name: Option<String>,
    pub mode: Option<AgentMode>,
    pub permissions: Option<Vec<Permission>>,
    pub display_order: Option<i32>,
}

/// Response for agent list
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListResponse {
    pub agents: Vec<Agent>,
}

/// Input for reordering agents
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderAgentsInput {
    pub agent_ids: Vec<String>,
}
