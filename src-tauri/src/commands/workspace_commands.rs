//! Workspace-related Tauri commands

use tauri::State;

use crate::types::{CreateWorkspaceInput, Workspace, WorkspaceListResponse, WorkspaceWithDetails};
use crate::AppState;

/// List all workspaces
#[tauri::command]
pub async fn list_workspaces(
    state: State<'_, AppState>,
) -> Result<WorkspaceListResponse, String> {
    state
        .workspace_service
        .list_workspaces()
        .map(|workspaces| WorkspaceListResponse { workspaces })
        .map_err(|e| e.to_string())
}

/// Get a single workspace by ID
#[tauri::command]
pub async fn get_workspace(
    id: String,
    state: State<'_, AppState>,
) -> Result<WorkspaceWithDetails, String> {
    state
        .workspace_service
        .get_workspace_with_details(&id)
        .map_err(|e| e.to_string())
}

/// Create a new workspace
#[tauri::command]
pub async fn create_workspace(
    input: CreateWorkspaceInput,
    state: State<'_, AppState>,
) -> Result<Workspace, String> {
    state
        .workspace_service
        .create_workspace(&input.path, input.name.as_deref())
        .map_err(|e| e.to_string())
}

/// Delete a workspace
#[tauri::command]
pub async fn delete_workspace(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .workspace_service
        .delete_workspace(&id)
        .map_err(|e| e.to_string())
}

/// Refresh workspace data (re-scan worktrees)
#[tauri::command]
pub async fn refresh_workspace(
    id: String,
    state: State<'_, AppState>,
) -> Result<WorkspaceWithDetails, String> {
    state
        .workspace_service
        .refresh_workspace(&id)
        .map_err(|e| e.to_string())
}
