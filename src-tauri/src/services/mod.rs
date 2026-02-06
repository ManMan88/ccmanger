//! Service layer for Claude Manager
//!
//! This module contains all the business logic services that coordinate
//! between the command layer and the database/process layers.

pub mod agent_service;
pub mod claude_api_service;
pub mod git_service;
pub mod process_service;
pub mod usage_service;
pub mod websocket_server;
pub mod workspace_service;
pub mod worktree_service;

pub use agent_service::{AgentError, AgentService};
pub use claude_api_service::{ClaudeApiError, ClaudeApiService};
pub use git_service::{GitError, GitService};
pub use process_service::{ProcessError, ProcessEvent, ProcessManager};
pub use usage_service::{UsageError, UsageService};
pub use websocket_server::start_websocket_server;
pub use workspace_service::{WorkspaceError, WorkspaceService};
pub use worktree_service::{WorktreeError, WorktreeService};
