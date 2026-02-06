//! Claude Manager - Rust Backend Library
//!
//! This library provides the core functionality for Claude Manager,
//! a GUI application for managing Claude Code CLI agents across git worktrees.

pub mod commands;
pub mod db;
pub mod error;
pub mod services;
pub mod types;

use std::sync::Arc;

use db::DbPool;
use services::{AgentService, ProcessManager, UsageService, WorkspaceService, WorktreeService};

/// Application state shared across all Tauri commands
pub struct AppState {
    /// Database connection pool
    pub pool: DbPool,
    /// Process manager for Claude CLI agents
    pub process_manager: Arc<ProcessManager>,
    /// Agent service for agent-related operations
    pub agent_service: Arc<AgentService>,
    /// Workspace service for workspace-related operations
    pub workspace_service: Arc<WorkspaceService>,
    /// Worktree service for worktree-related operations
    pub worktree_service: Arc<WorktreeService>,
    /// Usage service for tracking API usage
    pub usage_service: Arc<UsageService>,
}

// Re-export commonly used types
pub use error::{AppError, AppResult};
pub use types::*;
