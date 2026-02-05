//! Workspace type definitions

use serde::{Deserialize, Serialize};

use super::{Agent, Worktree};

/// Database row representation for workspace
#[derive(Debug, Clone)]
pub struct WorkspaceRow {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub updated_at: String,
    pub worktree_count: i32,
    pub agent_count: i32,
}

/// API representation for workspace
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub updated_at: String,
    pub worktree_count: i32,
    pub agent_count: i32,
}

impl From<WorkspaceRow> for Workspace {
    fn from(row: WorkspaceRow) -> Self {
        Workspace {
            id: row.id,
            name: row.name,
            path: row.path,
            created_at: row.created_at,
            updated_at: row.updated_at,
            worktree_count: row.worktree_count,
            agent_count: row.agent_count,
        }
    }
}

/// Workspace with full details including worktrees and agents
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWithDetails {
    #[serde(flatten)]
    pub workspace: Workspace,
    pub worktrees: Vec<WorktreeWithAgents>,
}

/// Worktree with its agents
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeWithAgents {
    #[serde(flatten)]
    pub worktree: Worktree,
    pub agents: Vec<Agent>,
    pub previous_agents: Vec<Agent>,
}

/// Input for creating a new workspace
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    pub path: String,
    pub name: Option<String>,
}

/// Response for workspace list
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceListResponse {
    pub workspaces: Vec<Workspace>,
}
