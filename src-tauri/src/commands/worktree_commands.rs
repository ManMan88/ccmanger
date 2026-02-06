//! Worktree-related Tauri commands

use tauri::State;

use crate::types::{
    BranchInfo, CheckoutBranchInput, CreateWorktreeInput, GitStatusInfo, ReorderWorktreesInput,
    UpdateWorktreeInput, Worktree, WorktreeListResponse,
};
use crate::AppState;

/// List all worktrees for a workspace
#[tauri::command]
pub async fn list_worktrees(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<WorktreeListResponse, String> {
    state
        .worktree_service
        .list_worktrees(&workspace_id)
        .map(|worktrees| WorktreeListResponse { worktrees })
        .map_err(|e| e.to_string())
}

/// Get a single worktree by ID
#[tauri::command]
pub async fn get_worktree(
    id: String,
    state: State<'_, AppState>,
) -> Result<Worktree, String> {
    state
        .worktree_service
        .get_worktree(&id)
        .map_err(|e| e.to_string())
}

/// Create a new worktree
#[tauri::command]
pub async fn create_worktree(
    input: CreateWorktreeInput,
    state: State<'_, AppState>,
) -> Result<Worktree, String> {
    state
        .worktree_service
        .create_worktree(
            &input.workspace_id,
            &input.name,
            &input.branch,
            input.path.as_deref(),
            input.create_branch.unwrap_or(false),
        )
        .map_err(|e| e.to_string())
}

/// Update a worktree
#[tauri::command]
pub async fn update_worktree(
    id: String,
    input: UpdateWorktreeInput,
    state: State<'_, AppState>,
) -> Result<Worktree, String> {
    state
        .worktree_service
        .update_worktree(&id, input)
        .map_err(|e| e.to_string())
}

/// Delete a worktree
#[tauri::command]
pub async fn delete_worktree(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .worktree_service
        .delete_worktree(&id)
        .map_err(|e| e.to_string())
}

/// Checkout a branch in a worktree
#[tauri::command]
pub async fn checkout_branch(
    id: String,
    input: CheckoutBranchInput,
    state: State<'_, AppState>,
) -> Result<Worktree, String> {
    state
        .worktree_service
        .checkout_branch(&id, &input.branch, input.create.unwrap_or(false))
        .map_err(|e| e.to_string())
}

/// Reorder worktrees
#[tauri::command]
pub async fn reorder_worktrees(
    workspace_id: String,
    input: ReorderWorktreesInput,
    state: State<'_, AppState>,
) -> Result<Vec<Worktree>, String> {
    state
        .worktree_service
        .reorder_worktrees(&workspace_id, &input.worktree_ids)
        .map_err(|e| e.to_string())
}

/// Get git status for a worktree
#[tauri::command]
pub async fn get_git_status(
    id: String,
    state: State<'_, AppState>,
) -> Result<GitStatusInfo, String> {
    state
        .worktree_service
        .get_git_status(&id)
        .map_err(|e| e.to_string())
}

/// List branches for a worktree
#[tauri::command]
pub async fn list_branches(
    id: String,
    state: State<'_, AppState>,
) -> Result<BranchInfo, String> {
    state
        .worktree_service
        .list_branches(&id)
        .map_err(|e| e.to_string())
}
