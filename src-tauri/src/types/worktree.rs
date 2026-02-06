//! Worktree type definitions

use serde::{Deserialize, Serialize};

/// Sort mode for worktrees
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SortMode {
    #[default]
    Free,
    Status,
    Name,
}

impl SortMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            SortMode::Free => "free",
            SortMode::Status => "status",
            SortMode::Name => "name",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "status" => SortMode::Status,
            "name" => SortMode::Name,
            _ => SortMode::Free,
        }
    }
}

/// Database row representation for worktree
#[derive(Debug, Clone)]
pub struct WorktreeRow {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub branch: String,
    pub path: String,
    pub sort_mode: String,
    pub display_order: i32,
    pub is_main: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// API representation for worktree
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub branch: String,
    pub path: String,
    pub sort_mode: SortMode,
    pub display_order: i32,
    pub is_main: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<WorktreeRow> for Worktree {
    fn from(row: WorktreeRow) -> Self {
        Worktree {
            id: row.id,
            workspace_id: row.workspace_id,
            name: row.name,
            branch: row.branch,
            path: row.path,
            sort_mode: SortMode::parse(&row.sort_mode),
            display_order: row.display_order,
            is_main: row.is_main,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// Input for creating a new worktree
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorktreeInput {
    pub workspace_id: String,
    pub name: String,
    pub branch: String,
    pub path: Option<String>,
    pub create_branch: Option<bool>,
}

/// Input for updating a worktree
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorktreeInput {
    pub name: Option<String>,
    pub sort_mode: Option<SortMode>,
    pub display_order: Option<i32>,
}

/// Input for checking out a branch
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutBranchInput {
    pub branch: String,
    pub create: Option<bool>,
}

/// Input for reordering worktrees
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderWorktreesInput {
    pub worktree_ids: Vec<String>,
}

/// Response for worktree list
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeListResponse {
    pub worktrees: Vec<Worktree>,
}

/// Git branch information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub local: Vec<String>,
    pub remote: Vec<String>,
    pub current: String,
}

/// Git status information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusInfo {
    pub is_clean: bool,
    pub ahead: i32,
    pub behind: i32,
    pub modified: Vec<String>,
    pub staged: Vec<String>,
    pub untracked: Vec<String>,
}
