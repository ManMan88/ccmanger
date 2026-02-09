//! Agent-related Tauri commands

use tauri::State;

use crate::types::{
    Agent, AgentListResponse, AgentMode, CreateAgentInput, MessageListResponse, Permission,
    ReorderAgentsInput, SendMessageInput, SendMessageResponse, UpdateAgentInput,
};
use crate::AppState;

/// List all agents for a worktree
#[tauri::command]
pub async fn list_agents(
    worktree_id: String,
    include_deleted: Option<bool>,
    state: State<'_, AppState>,
) -> Result<AgentListResponse, String> {
    state
        .agent_service
        .list_agents(&worktree_id, include_deleted.unwrap_or(false))
        .map(|agents| AgentListResponse { agents })
        .map_err(|e| e.to_string())
}

/// Get a single agent by ID
#[tauri::command]
pub async fn get_agent(
    id: String,
    state: State<'_, AppState>,
) -> Result<Agent, String> {
    state
        .agent_service
        .get_agent(&id)
        .map_err(|e| e.to_string())
}

/// Create a new agent
#[tauri::command]
pub async fn create_agent(
    input: CreateAgentInput,
    state: State<'_, AppState>,
) -> Result<Agent, String> {
    state
        .agent_service
        .create_agent(
            &input.worktree_id,
            input.name,
            input.mode.unwrap_or(AgentMode::Regular),
            input.permissions.unwrap_or_else(|| vec![Permission::Read]),
        )
        .map_err(|e| e.to_string())
}

/// Update an agent
#[tauri::command]
pub async fn update_agent(
    id: String,
    input: UpdateAgentInput,
    state: State<'_, AppState>,
) -> Result<Agent, String> {
    state
        .agent_service
        .update_agent(&id, input)
        .map_err(|e| e.to_string())
}

/// Delete an agent
#[tauri::command]
pub async fn delete_agent(
    id: String,
    archive: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .agent_service
        .delete_agent(&id, archive.unwrap_or(true))
        .map_err(|e| e.to_string())
}

/// Start an agent
#[tauri::command]
pub async fn start_agent(
    id: String,
    initial_prompt: Option<String>,
    state: State<'_, AppState>,
) -> Result<Agent, String> {
    let agent = state.agent_service.get_agent(&id).map_err(|e| e.to_string())?;
    let worktree = state.worktree_service.get_worktree(&agent.worktree_id).map_err(|e| e.to_string())?;
    state
        .agent_service
        .start_agent(&id, &worktree.path, initial_prompt.as_deref())
        .map_err(|e| e.to_string())
}

/// Stop an agent
#[tauri::command]
pub async fn stop_agent(
    id: String,
    force: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Agent, String> {
    state
        .agent_service
        .stop_agent(&id, force.unwrap_or(false))
        .map_err(|e| e.to_string())
}

/// Send a message to an agent
#[tauri::command]
pub async fn send_message_to_agent(
    id: String,
    input: SendMessageInput,
    state: State<'_, AppState>,
) -> Result<SendMessageResponse, String> {
    let message = state
        .agent_service
        .send_message(&id, &input.content)
        .map_err(|e| e.to_string())?;

    Ok(SendMessageResponse {
        message_id: message.id,
        status: "sent".to_string(),
        running: true,
    })
}

/// Get messages for an agent
#[tauri::command]
pub async fn get_agent_messages(
    id: String,
    limit: Option<usize>,
    before: Option<String>,
    state: State<'_, AppState>,
) -> Result<MessageListResponse, String> {
    let (messages, has_more, next_cursor) = state
        .agent_service
        .get_messages(&id, limit.unwrap_or(100), before.as_deref())
        .map_err(|e| e.to_string())?;

    Ok(MessageListResponse {
        messages,
        has_more,
        next_cursor,
    })
}

/// Fork an agent
#[tauri::command]
pub async fn fork_agent(
    id: String,
    name: Option<String>,
    state: State<'_, AppState>,
) -> Result<Agent, String> {
    state
        .agent_service
        .fork_agent(&id, name)
        .map_err(|e| e.to_string())
}

/// Restore a deleted agent
#[tauri::command]
pub async fn restore_agent(
    id: String,
    state: State<'_, AppState>,
) -> Result<Agent, String> {
    state
        .agent_service
        .restore_agent(&id)
        .map_err(|e| e.to_string())
}

/// Reorder agents
#[tauri::command]
pub async fn reorder_agents(
    worktree_id: String,
    input: ReorderAgentsInput,
    state: State<'_, AppState>,
) -> Result<Vec<Agent>, String> {
    state
        .agent_service
        .reorder_agents(&worktree_id, &input.agent_ids)
        .map_err(|e| e.to_string())
}
