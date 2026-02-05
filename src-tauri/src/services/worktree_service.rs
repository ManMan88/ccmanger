//! Worktree service for managing git worktrees

use thiserror::Error;
use uuid::Uuid;

use crate::db::{DbPool, WorkspaceRepository, WorktreeRepository};
use crate::services::GitService;
use crate::types::{BranchInfo, GitStatusInfo, UpdateWorktreeInput, Worktree};

#[derive(Error, Debug)]
pub enum WorktreeError {
    #[error("Worktree not found: {0}")]
    NotFound(String),
    #[error("Workspace not found: {0}")]
    WorkspaceNotFound(String),
    #[error("Cannot delete main worktree")]
    CannotDeleteMain,
    #[error("Database error: {0}")]
    Database(String),
    #[error("Git error: {0}")]
    Git(String),
}

pub struct WorktreeService {
    worktree_repo: WorktreeRepository,
    workspace_repo: WorkspaceRepository,
}

impl WorktreeService {
    pub fn new(pool: DbPool) -> Self {
        Self {
            worktree_repo: WorktreeRepository::new(pool.clone()),
            workspace_repo: WorkspaceRepository::new(pool),
        }
    }

    /// List worktrees for a workspace
    pub fn list_worktrees(&self, workspace_id: &str) -> Result<Vec<Worktree>, WorktreeError> {
        self.worktree_repo
            .find_by_workspace_id(workspace_id)
            .map_err(|e| WorktreeError::Database(e.to_string()))
    }

    /// Get a worktree by ID
    pub fn get_worktree(&self, id: &str) -> Result<Worktree, WorktreeError> {
        self.worktree_repo
            .find_by_id(id)
            .map_err(|e| WorktreeError::Database(e.to_string()))?
            .ok_or_else(|| WorktreeError::NotFound(id.to_string()))
    }

    /// Create a new worktree
    pub fn create_worktree(
        &self,
        workspace_id: &str,
        name: &str,
        branch: &str,
        path: Option<&str>,
        create_branch: bool,
    ) -> Result<Worktree, WorktreeError> {
        // Get workspace to get repo path
        let workspace = self
            .workspace_repo
            .find_by_id(workspace_id)
            .map_err(|e| WorktreeError::Database(e.to_string()))?
            .ok_or_else(|| WorktreeError::WorkspaceNotFound(workspace_id.to_string()))?;

        // Determine worktree path
        let worktree_path = path
            .map(|p| p.to_string())
            .unwrap_or_else(|| {
                let parent = std::path::Path::new(&workspace.path)
                    .parent()
                    .unwrap_or(std::path::Path::new("."));
                parent.join(name).to_string_lossy().to_string()
            });

        // Create worktree using git
        let wt_info = GitService::add_worktree(&workspace.path, &worktree_path, branch, create_branch)
            .map_err(|e| WorktreeError::Git(e.to_string()))?;

        // Create database record
        let now = chrono::Utc::now().to_rfc3339();
        let worktree = Worktree {
            id: format!(
                "wt_{}{}",
                chrono::Utc::now().timestamp_millis(),
                &Uuid::new_v4().to_string()[..8]
            ),
            workspace_id: workspace_id.to_string(),
            name: name.to_string(),
            branch: wt_info.branch,
            path: wt_info.path,
            sort_mode: crate::types::SortMode::Free,
            display_order: 0,
            is_main: false,
            created_at: now.clone(),
            updated_at: now,
        };

        let created = self
            .worktree_repo
            .create(&worktree)
            .map_err(|e| WorktreeError::Database(e.to_string()))?;

        // Update workspace counts
        self.workspace_repo
            .update_counts(workspace_id)
            .map_err(|e| WorktreeError::Database(e.to_string()))?;

        Ok(created)
    }

    /// Update a worktree
    pub fn update_worktree(
        &self,
        id: &str,
        input: UpdateWorktreeInput,
    ) -> Result<Worktree, WorktreeError> {
        let mut worktree = self.get_worktree(id)?;

        if let Some(name) = input.name {
            worktree.name = name;
        }
        if let Some(sort_mode) = input.sort_mode {
            worktree.sort_mode = sort_mode;
        }
        if let Some(display_order) = input.display_order {
            worktree.display_order = display_order;
        }

        worktree.updated_at = chrono::Utc::now().to_rfc3339();

        self.worktree_repo
            .update(&worktree)
            .map_err(|e| WorktreeError::Database(e.to_string()))
    }

    /// Delete a worktree
    pub fn delete_worktree(&self, id: &str) -> Result<(), WorktreeError> {
        let worktree = self.get_worktree(id)?;

        if worktree.is_main {
            return Err(WorktreeError::CannotDeleteMain);
        }

        // Get workspace to get repo path
        let workspace = self
            .workspace_repo
            .find_by_id(&worktree.workspace_id)
            .map_err(|e| WorktreeError::Database(e.to_string()))?
            .ok_or_else(|| WorktreeError::WorkspaceNotFound(worktree.workspace_id.clone()))?;

        // Remove worktree from git
        GitService::remove_worktree(&workspace.path, &worktree.path)
            .map_err(|e| WorktreeError::Git(e.to_string()))?;

        // Delete database record
        self.worktree_repo
            .delete(id)
            .map_err(|e| WorktreeError::Database(e.to_string()))?;

        // Update workspace counts
        self.workspace_repo
            .update_counts(&worktree.workspace_id)
            .map_err(|e| WorktreeError::Database(e.to_string()))?;

        Ok(())
    }

    /// Checkout a branch in a worktree
    pub fn checkout_branch(
        &self,
        id: &str,
        branch: &str,
        create: bool,
    ) -> Result<Worktree, WorktreeError> {
        let mut worktree = self.get_worktree(id)?;

        GitService::checkout_branch(&worktree.path, branch, create)
            .map_err(|e| WorktreeError::Git(e.to_string()))?;

        worktree.branch = branch.to_string();
        worktree.updated_at = chrono::Utc::now().to_rfc3339();

        self.worktree_repo
            .update(&worktree)
            .map_err(|e| WorktreeError::Database(e.to_string()))
    }

    /// Reorder worktrees
    pub fn reorder_worktrees(
        &self,
        workspace_id: &str,
        worktree_ids: &[String],
    ) -> Result<Vec<Worktree>, WorktreeError> {
        self.worktree_repo
            .reorder(workspace_id, worktree_ids)
            .map_err(|e| WorktreeError::Database(e.to_string()))?;

        self.list_worktrees(workspace_id)
    }

    /// Get git status for a worktree
    pub fn get_git_status(&self, id: &str) -> Result<GitStatusInfo, WorktreeError> {
        let worktree = self.get_worktree(id)?;
        GitService::get_status(&worktree.path).map_err(|e| WorktreeError::Git(e.to_string()))
    }

    /// List branches for a worktree
    pub fn list_branches(&self, id: &str) -> Result<BranchInfo, WorktreeError> {
        let worktree = self.get_worktree(id)?;
        GitService::list_branches(&worktree.path).map_err(|e| WorktreeError::Git(e.to_string()))
    }
}
