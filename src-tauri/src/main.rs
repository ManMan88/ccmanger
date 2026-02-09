#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use claude_manager_lib::{commands, db, services, AppState};
use std::sync::Arc;
use tauri::Manager;

fn main() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    tracing::info!("Starting Claude Manager");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Get data directory
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            tracing::info!("Data directory: {:?}", data_dir);

            // Initialize database
            let pool = db::init_database(data_dir.clone())
                .expect("Failed to initialize database");

            tracing::info!("Database initialized");

            // Clear any orphaned process PIDs from previous run
            let agent_repo = db::repositories::AgentRepository::new(pool.clone());
            if let Err(e) = agent_repo.clear_running_pids() {
                tracing::warn!("Failed to clear orphaned PIDs: {}", e);
            }

            // Initialize process manager
            let claude_cli_path = std::env::var("CLAUDE_CLI_PATH")
                .unwrap_or_else(|_| "claude".to_string());
            tracing::info!("Claude CLI path: {}", claude_cli_path);

            let process_manager = Arc::new(services::ProcessManager::new(claude_cli_path));

            // Initialize services
            let agent_service =
                Arc::new(services::AgentService::new(pool.clone(), process_manager.clone()));
            let workspace_service = Arc::new(services::WorkspaceService::new(pool.clone()));
            let worktree_service = Arc::new(services::WorktreeService::new(pool.clone()));
            let usage_service = Arc::new(services::UsageService::new(pool.clone()));

            // Create DB sync repo before pool moves into app state
            let db_sync_repo = db::repositories::AgentRepository::new(pool.clone());

            // Create app state
            let app_state = AppState {
                pool,
                process_manager: process_manager.clone(),
                agent_service,
                workspace_service,
                worktree_service,
                usage_service,
            };

            // Store in app state
            app.manage(app_state);

            // Start WebSocket server in background
            let ws_rx = process_manager.subscribe();
            let ws_pm = process_manager.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = services::start_websocket_server(ws_rx, ws_pm).await {
                    tracing::error!("WebSocket server error: {}", e);
                }
            });

            // Sync process events to database status
            let db_sync_rx = process_manager.subscribe();
            tauri::async_runtime::spawn(async move {
                let mut rx = db_sync_rx;
                while let Ok(event) = rx.recv().await {
                    match event {
                        services::ProcessEvent::Exit { ref agent_id, .. } => {
                            if let Err(e) = db_sync_repo.update_status(
                                agent_id,
                                claude_manager_lib::types::AgentStatus::Finished,
                                None,
                            ) {
                                tracing::warn!("Failed to sync exit status for {}: {}", agent_id, e);
                            }
                        }
                        services::ProcessEvent::Status {
                            ref agent_id,
                            ref status,
                            ..
                        } => {
                            if let Err(e) = db_sync_repo.update_status(agent_id, status.clone(), None) {
                                tracing::warn!(
                                    "Failed to sync status for {}: {}",
                                    agent_id,
                                    e
                                );
                            }
                        }
                        _ => {}
                    }
                }
            });

            tracing::info!("Claude Manager setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Workspace commands
            commands::list_workspaces,
            commands::get_workspace,
            commands::create_workspace,
            commands::delete_workspace,
            commands::refresh_workspace,
            // Worktree commands
            commands::list_worktrees,
            commands::get_worktree,
            commands::create_worktree,
            commands::update_worktree,
            commands::delete_worktree,
            commands::checkout_branch,
            commands::reorder_worktrees,
            commands::get_git_status,
            commands::list_branches,
            // Agent commands
            commands::list_agents,
            commands::get_agent,
            commands::create_agent,
            commands::update_agent,
            commands::delete_agent,
            commands::start_agent,
            commands::stop_agent,
            commands::send_message_to_agent,
            commands::get_agent_messages,
            commands::fork_agent,
            commands::restore_agent,
            commands::reorder_agents,
            // Usage commands
            commands::get_usage,
            commands::get_usage_history,
            commands::get_usage_today,
            commands::get_usage_limits,
            commands::get_claude_usage,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Graceful shutdown: stop all agents
                if let Some(state) = window.try_state::<AppState>() {
                    tracing::info!("Shutting down - stopping all agents");
                    state.process_manager.stop_all();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}
