//! WebSocket message type definitions

use serde::{Deserialize, Serialize};

use super::{AgentStatus, UsageStats};

/// Incoming WebSocket message types (client -> server)
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsClientMessage {
    #[serde(rename = "subscribe:agent")]
    SubscribeAgent { payload: SubscribeAgentPayload },
    #[serde(rename = "unsubscribe:agent")]
    UnsubscribeAgent { payload: UnsubscribeAgentPayload },
    #[serde(rename = "subscribe:workspace")]
    SubscribeWorkspace { payload: SubscribeWorkspacePayload },
    #[serde(rename = "unsubscribe:workspace")]
    UnsubscribeWorkspace { payload: UnsubscribeWorkspacePayload },
    Ping,
}

/// Outgoing WebSocket message types (server -> client)
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsServerMessage {
    #[serde(rename = "agent:output")]
    AgentOutput(AgentOutputPayload),
    #[serde(rename = "agent:status")]
    AgentStatus(AgentStatusPayload),
    #[serde(rename = "agent:context")]
    AgentContext(AgentContextPayload),
    #[serde(rename = "agent:error")]
    AgentError(AgentErrorPayload),
    #[serde(rename = "agent:terminated")]
    AgentTerminated(AgentTerminatedPayload),
    #[serde(rename = "workspace:updated")]
    WorkspaceUpdated(WorkspaceUpdatedPayload),
    #[serde(rename = "usage:updated")]
    UsageUpdated(UsageUpdatedPayload),
    Pong,
}

// Client -> Server payloads

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeAgentPayload {
    pub agent_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsubscribeAgentPayload {
    pub agent_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeWorkspacePayload {
    pub workspace_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsubscribeWorkspacePayload {
    pub workspace_id: String,
}

// Server -> Client payloads

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOutputPayload {
    pub agent_id: String,
    pub content: String,
    pub is_complete: bool,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusPayload {
    pub agent_id: String,
    pub status: AgentStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContextPayload {
    pub agent_id: String,
    pub level: i32,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentErrorPayload {
    pub agent_id: String,
    pub error: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTerminatedPayload {
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUpdatedPayload {
    pub workspace_id: String,
    pub event: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageUpdatedPayload {
    pub usage: UsageStats,
    pub timestamp: String,
}
