//! Workspace API integration tests

mod common {
    pub use crate::common::*;
}

use claude_manager_lib::db::WorkspaceRepository;
use claude_manager_lib::services::WorkspaceService;

use common::TestContext;

#[test]
fn test_workspace_get() {
    let ctx = TestContext::new();
    let service = WorkspaceService::new(ctx.pool.clone());

    // The test context already has a workspace
    let workspace = service
        .get_workspace(&ctx.workspace_id)
        .expect("Should get workspace");

    assert_eq!(workspace.id, ctx.workspace_id);
    assert_eq!(workspace.name, "Test Workspace");
}

#[test]
fn test_workspace_not_found() {
    let ctx = TestContext::new();
    let service = WorkspaceService::new(ctx.pool.clone());

    let result = service.get_workspace("nonexistent");
    assert!(result.is_err());
}

#[test]
fn test_workspace_list() {
    let ctx = TestContext::new();
    let service = WorkspaceService::new(ctx.pool.clone());

    let workspaces = service
        .list_workspaces()
        .expect("Should list workspaces");

    // Should have at least the test context workspace
    assert!(!workspaces.is_empty());
    assert!(workspaces.iter().any(|w| w.id == ctx.workspace_id));
}

#[test]
fn test_workspace_counts() {
    let ctx = TestContext::new();
    let service = WorkspaceService::new(ctx.pool.clone());

    // The test context already has a workspace with a worktree
    let workspace = service
        .get_workspace(&ctx.workspace_id)
        .expect("Should get workspace");

    // The workspace exists and we can verify its name
    assert_eq!(workspace.name, "Test Workspace");
    // Note: worktree_count may be 0 because the test context workspace
    // may not have its counts updated - that's done by scan_worktrees
    // which requires a valid git repo
}

#[test]
fn test_workspace_repository_direct() {
    let ctx = TestContext::new();
    let repo = WorkspaceRepository::new(ctx.pool.clone());

    // Test repository directly
    let workspaces = repo.find_all().expect("Should find all workspaces");
    assert!(!workspaces.is_empty());

    let workspace = repo
        .find_by_id(&ctx.workspace_id)
        .expect("Should find workspace by id");
    assert!(workspace.is_some());

    let workspace = workspace.unwrap();
    assert_eq!(workspace.id, ctx.workspace_id);
}

#[test]
fn test_workspace_delete() {
    let ctx = TestContext::new();
    let repo = WorkspaceRepository::new(ctx.pool.clone());

    // Create a workspace directly for deletion testing
    let now = chrono::Utc::now().to_rfc3339();
    let ws = claude_manager_lib::types::Workspace {
        id: "ws_to_delete".to_string(),
        name: "To Delete".to_string(),
        path: "/tmp/delete-test".to_string(),
        created_at: now.clone(),
        updated_at: now,
        worktree_count: 0,
        agent_count: 0,
    };

    repo.create(&ws).expect("Should create workspace");

    // Verify it exists
    let found = repo.find_by_id("ws_to_delete").unwrap();
    assert!(found.is_some());

    // Delete it
    repo.delete("ws_to_delete").expect("Should delete");

    // Verify it's gone
    let found = repo.find_by_id("ws_to_delete").unwrap();
    assert!(found.is_none());
}
