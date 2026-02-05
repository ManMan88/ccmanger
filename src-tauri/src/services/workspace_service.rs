//! Workspace service for managing git workspaces

use thiserror::Error;
use uuid::Uuid;

use crate::db::{AgentRepository, DbPool, WorkspaceRepository, WorktreeRepository};
use crate::services::GitService;
use crate::types::{Workspace, WorkspaceWithDetails, WorktreeWithAgents};

#[derive(Error, Debug)]
pub enum WorkspaceError {
    #[error("Workspace not found: {0}")]
    NotFound(String),
    #[error("Invalid path: {0}")]
    InvalidPath(String),
    #[error("Database error: {0}")]
    Database(String),
    #[error("Git error: {0}")]
    Git(String),
}

pub struct WorkspaceService {
    workspace_repo: WorkspaceRepository,
    worktree_repo: WorktreeRepository,
    agent_repo: AgentRepository,
}

impl WorkspaceService {
    pub fn new(pool: DbPool) -> Self {
        Self {
            workspace_repo: WorkspaceRepository::new(pool.clone()),
            worktree_repo: WorktreeRepository::new(pool.clone()),
            agent_repo: AgentRepository::new(pool),
        }
    }

    /// Create a new workspace from a git repository path
    pub fn create_workspace(
        &self,
        path: &str,
        name: Option<&str>,
    ) -> Result<Workspace, WorkspaceError> {
        // Validate path is a git repository
        if !GitService::is_valid_repository(path) {
            return Err(WorkspaceError::InvalidPath(format!(
                "Not a valid git repository: {}",
                path
            )));
        }

        // Get repository name from path or use provided name
        let repo_name = name
            .map(|s| s.to_string())
            .or_else(|| {
                std::path::Path::new(path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| "Unnamed Workspace".to_string());

        let now = chrono::Utc::now().to_rfc3339();
        let workspace = Workspace {
            id: format!(
                "ws_{}{}",
                chrono::Utc::now().timestamp_millis(),
                &Uuid::new_v4().to_string()[..8]
            ),
            name: repo_name,
            path: path.to_string(),
            created_at: now.clone(),
            updated_at: now,
            worktree_count: 0,
            agent_count: 0,
        };

        let created = self
            .workspace_repo
            .create(&workspace)
            .map_err(|e| WorkspaceError::Database(e.to_string()))?;

        // Scan and add existing worktrees
        self.scan_worktrees(&created.id, path)?;

        // Return updated workspace with counts
        self.get_workspace(&created.id)
    }

    /// Get a workspace by ID
    pub fn get_workspace(&self, id: &str) -> Result<Workspace, WorkspaceError> {
        self.workspace_repo
            .find_by_id(id)
            .map_err(|e| WorkspaceError::Database(e.to_string()))?
            .ok_or_else(|| WorkspaceError::NotFound(id.to_string()))
    }

    /// Get a workspace with full details
    pub fn get_workspace_with_details(&self, id: &str) -> Result<WorkspaceWithDetails, WorkspaceError> {
        let workspace = self.get_workspace(id)?;

        let worktrees = self
            .worktree_repo
            .find_by_workspace_id(id)
            .map_err(|e| WorkspaceError::Database(e.to_string()))?;

        let mut worktrees_with_agents = Vec::new();
        for worktree in worktrees {
            let agents = self
                .agent_repo
                .find_by_worktree_id(&worktree.id, false)
                .map_err(|e| WorkspaceError::Database(e.to_string()))?;

            let previous_agents = self
                .agent_repo
                .find_deleted_by_worktree_id(&worktree.id)
                .map_err(|e| WorkspaceError::Database(e.to_string()))?;

            worktrees_with_agents.push(WorktreeWithAgents {
                worktree,
                agents,
                previous_agents,
            });
        }

        Ok(WorkspaceWithDetails {
            workspace,
            worktrees: worktrees_with_agents,
        })
    }

    /// List all workspaces
    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, WorkspaceError> {
        self.workspace_repo
            .find_all()
            .map_err(|e| WorkspaceError::Database(e.to_string()))
    }

    /// Delete a workspace
    pub fn delete_workspace(&self, id: &str) -> Result<(), WorkspaceError> {
        // Verify workspace exists
        self.get_workspace(id)?;

        self.workspace_repo
            .delete(id)
            .map_err(|e| WorkspaceError::Database(e.to_string()))
    }

    /// Refresh workspace data
    pub fn refresh_workspace(&self, id: &str) -> Result<WorkspaceWithDetails, WorkspaceError> {
        let workspace = self.get_workspace(id)?;

        // Re-scan worktrees
        self.scan_worktrees(id, &workspace.path)?;

        self.get_workspace_with_details(id)
    }

    /// Scan and sync worktrees from git
    fn scan_worktrees(&self, workspace_id: &str, repo_path: &str) -> Result<(), WorkspaceError> {
        let git_worktrees =
            GitService::list_worktrees(repo_path).map_err(|e| WorkspaceError::Git(e.to_string()))?;

        for wt_info in git_worktrees {
            // Check if worktree already exists
            if self
                .worktree_repo
                .find_by_path(&wt_info.path)
                .map_err(|e| WorkspaceError::Database(e.to_string()))?
                .is_none()
            {
                // Create new worktree record
                let now = chrono::Utc::now().to_rfc3339();
                let worktree = crate::types::Worktree {
                    id: format!(
                        "wt_{}{}",
                        chrono::Utc::now().timestamp_millis(),
                        &Uuid::new_v4().to_string()[..8]
                    ),
                    workspace_id: workspace_id.to_string(),
                    name: std::path::Path::new(&wt_info.path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unnamed")
                        .to_string(),
                    branch: wt_info.branch,
                    path: wt_info.path,
                    sort_mode: crate::types::SortMode::Free,
                    display_order: 0,
                    is_main: wt_info.is_main,
                    created_at: now.clone(),
                    updated_at: now,
                };

                self.worktree_repo
                    .create(&worktree)
                    .map_err(|e| WorkspaceError::Database(e.to_string()))?;
            }
        }

        // Update workspace counts
        self.workspace_repo
            .update_counts(workspace_id)
            .map_err(|e| WorkspaceError::Database(e.to_string()))?;

        Ok(())
    }
}
