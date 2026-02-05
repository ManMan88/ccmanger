//! Error types and result aliases for Claude Manager

use serde::Serialize;
use thiserror::Error;

/// Main application error type
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] crate::db::DbError),

    #[error("Agent error: {0}")]
    Agent(#[from] crate::services::AgentError),

    #[error("Process error: {0}")]
    Process(#[from] crate::services::ProcessError),

    #[error("Git error: {0}")]
    Git(#[from] crate::services::GitError),

    #[error("Workspace error: {0}")]
    Workspace(#[from] crate::services::WorkspaceError),

    #[error("Worktree error: {0}")]
    Worktree(#[from] crate::services::WorktreeError),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Internal error: {0}")]
    Internal(String),
}

/// Application result type
pub type AppResult<T> = Result<T, AppError>;

/// Error response structure for API/IPC
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl From<AppError> for ErrorResponse {
    fn from(err: AppError) -> Self {
        let (code, message) = match &err {
            AppError::Database(e) => ("DATABASE_ERROR", e.to_string()),
            AppError::Agent(e) => ("AGENT_ERROR", e.to_string()),
            AppError::Process(e) => ("PROCESS_ERROR", e.to_string()),
            AppError::Git(e) => ("GIT_ERROR", e.to_string()),
            AppError::Workspace(e) => ("WORKSPACE_ERROR", e.to_string()),
            AppError::Worktree(e) => ("WORKTREE_ERROR", e.to_string()),
            AppError::Validation(msg) => ("VALIDATION_ERROR", msg.clone()),
            AppError::NotFound(msg) => ("NOT_FOUND", msg.clone()),
            AppError::Io(e) => ("IO_ERROR", e.to_string()),
            AppError::Json(e) => ("JSON_ERROR", e.to_string()),
            AppError::Internal(msg) => ("INTERNAL_ERROR", msg.clone()),
        };

        ErrorResponse {
            code: code.to_string(),
            message,
            details: None,
        }
    }
}

// Implement conversion to Tauri's invoke error
impl From<AppError> for tauri::ipc::InvokeError {
    fn from(err: AppError) -> Self {
        tauri::ipc::InvokeError::from(err.to_string())
    }
}

// Convenience trait for adding context to errors
pub trait ResultExt<T> {
    fn with_context<F, S>(self, f: F) -> AppResult<T>
    where
        F: FnOnce() -> S,
        S: Into<String>;
}

impl<T, E: Into<AppError>> ResultExt<T> for Result<T, E> {
    fn with_context<F, S>(self, f: F) -> AppResult<T>
    where
        F: FnOnce() -> S,
        S: Into<String>,
    {
        self.map_err(|e| {
            let base_err: AppError = e.into();
            AppError::Internal(format!("{}: {}", f().into(), base_err))
        })
    }
}
