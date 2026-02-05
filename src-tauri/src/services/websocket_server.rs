//! WebSocket server for real-time updates

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use chrono::Utc;
use futures::{SinkExt, StreamExt};
use parking_lot::RwLock;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::services::ProcessEvent;
use crate::types::{
    AgentContextPayload, AgentErrorPayload, AgentOutputPayload, AgentStatusPayload,
    AgentTerminatedPayload, WsClientMessage, WsServerMessage,
};

/// Connected client information
struct ConnectedClient {
    subscribed_agents: HashSet<String>,
    subscribed_workspaces: HashSet<String>,
    sender: tokio::sync::mpsc::UnboundedSender<String>,
}

/// Client manager for tracking WebSocket connections
struct ClientManager {
    clients: RwLock<HashMap<String, ConnectedClient>>,
}

impl ClientManager {
    fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
        }
    }

    fn add_client(&self, id: &str, sender: tokio::sync::mpsc::UnboundedSender<String>) {
        let client = ConnectedClient {
            subscribed_agents: HashSet::new(),
            subscribed_workspaces: HashSet::new(),
            sender,
        };
        self.clients.write().insert(id.to_string(), client);
    }

    fn remove_client(&self, id: &str) {
        self.clients.write().remove(id);
    }

    fn subscribe_to_agent(&self, client_id: &str, agent_id: &str) {
        if let Some(client) = self.clients.write().get_mut(client_id) {
            client.subscribed_agents.insert(agent_id.to_string());
        }
    }

    fn unsubscribe_from_agent(&self, client_id: &str, agent_id: &str) {
        if let Some(client) = self.clients.write().get_mut(client_id) {
            client.subscribed_agents.remove(agent_id);
        }
    }

    fn subscribe_to_workspace(&self, client_id: &str, workspace_id: &str) {
        if let Some(client) = self.clients.write().get_mut(client_id) {
            client.subscribed_workspaces.insert(workspace_id.to_string());
        }
    }

    fn unsubscribe_from_workspace(&self, client_id: &str, workspace_id: &str) {
        if let Some(client) = self.clients.write().get_mut(client_id) {
            client.subscribed_workspaces.remove(workspace_id);
        }
    }

    fn send_to_agent_subscribers(&self, agent_id: &str, message: &str) {
        let clients = self.clients.read();
        for client in clients.values() {
            if client.subscribed_agents.contains(agent_id) {
                let _ = client.sender.send(message.to_string());
            }
        }
    }

    fn send_pong(&self, client_id: &str) {
        let clients = self.clients.read();
        if let Some(client) = clients.get(client_id) {
            let pong = serde_json::to_string(&WsServerMessage::Pong).unwrap_or_default();
            let _ = client.sender.send(pong);
        }
    }
}

/// WebSocket server state
struct WsState {
    client_manager: Arc<ClientManager>,
}

/// Start the WebSocket server
pub async fn start_websocket_server(
    mut process_rx: broadcast::Receiver<ProcessEvent>,
) -> Result<(), std::io::Error> {
    let client_manager = Arc::new(ClientManager::new());
    let state = Arc::new(WsState {
        client_manager: client_manager.clone(),
    });

    // Spawn task to broadcast process events
    let cm = client_manager.clone();
    tokio::spawn(async move {
        while let Ok(event) = process_rx.recv().await {
            let message = match event {
                ProcessEvent::Output {
                    agent_id,
                    content,
                    is_complete,
                } => {
                    let payload = AgentOutputPayload {
                        agent_id: agent_id.clone(),
                        content,
                        is_complete,
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    let msg = WsServerMessage::AgentOutput(payload);
                    Some((agent_id, serde_json::to_string(&msg).ok()))
                }
                ProcessEvent::Status {
                    agent_id,
                    status,
                    reason,
                } => {
                    let payload = AgentStatusPayload {
                        agent_id: agent_id.clone(),
                        status,
                        reason,
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    let msg = WsServerMessage::AgentStatus(payload);
                    Some((agent_id, serde_json::to_string(&msg).ok()))
                }
                ProcessEvent::Context { agent_id, level } => {
                    let payload = AgentContextPayload {
                        agent_id: agent_id.clone(),
                        level,
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    let msg = WsServerMessage::AgentContext(payload);
                    Some((agent_id, serde_json::to_string(&msg).ok()))
                }
                ProcessEvent::Error { agent_id, message } => {
                    let payload = AgentErrorPayload {
                        agent_id: agent_id.clone(),
                        error: message,
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    let msg = WsServerMessage::AgentError(payload);
                    Some((agent_id, serde_json::to_string(&msg).ok()))
                }
                ProcessEvent::Exit {
                    agent_id,
                    code,
                    signal,
                } => {
                    let payload = AgentTerminatedPayload {
                        agent_id: agent_id.clone(),
                        exit_code: code,
                        signal,
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    let msg = WsServerMessage::AgentTerminated(payload);
                    Some((agent_id, serde_json::to_string(&msg).ok()))
                }
            };

            if let Some((agent_id, Some(json))) = message {
                cm.send_to_agent_subscribers(&agent_id, &json);
            }
        }
    });

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001").await?;
    tracing::info!("WebSocket server listening on ws://127.0.0.1:3001/ws");

    axum::serve(listener, app).await?;

    Ok(())
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<WsState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<WsState>) {
    let (mut sender, mut receiver) = socket.split();
    let client_id = uuid::Uuid::new_v4().to_string();

    // Create channel for sending messages to this client
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    state.client_manager.add_client(&client_id, tx);

    // Task to send messages to the WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    let client_manager = state.client_manager.clone();
    let client_id_clone = client_id.clone();

    while let Some(msg) = receiver.next().await {
        if let Ok(Message::Text(text)) = msg {
            if let Ok(parsed) = serde_json::from_str::<WsClientMessage>(&text) {
                match parsed {
                    WsClientMessage::SubscribeAgent { payload } => {
                        client_manager.subscribe_to_agent(&client_id_clone, &payload.agent_id);
                    }
                    WsClientMessage::UnsubscribeAgent { payload } => {
                        client_manager.unsubscribe_from_agent(&client_id_clone, &payload.agent_id);
                    }
                    WsClientMessage::SubscribeWorkspace { payload } => {
                        client_manager
                            .subscribe_to_workspace(&client_id_clone, &payload.workspace_id);
                    }
                    WsClientMessage::UnsubscribeWorkspace { payload } => {
                        client_manager
                            .unsubscribe_from_workspace(&client_id_clone, &payload.workspace_id);
                    }
                    WsClientMessage::Ping => {
                        client_manager.send_pong(&client_id_clone);
                    }
                }
            }
        }
    }

    // Cleanup
    state.client_manager.remove_client(&client_id);
    send_task.abort();
}
