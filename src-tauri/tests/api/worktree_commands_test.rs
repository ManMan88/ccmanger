//! Worktree API integration tests

mod common {
    pub use crate::common::*;
}

use claude_manager_lib::db::WorktreeRepository;
use claude_manager_lib::services::WorktreeService;
use claude_manager_lib::types::{SortMode, UpdateWorktreeInput};

use common::TestContext;

#[test]
fn test_worktree_get() {
    let ctx = TestContext::new();
    let service = WorktreeService::new(ctx.pool.clone());

    // The test context already has a worktree
    let worktree = service
        .get_worktree(&ctx.worktree_id)
        .expect("Should get worktree");

    assert_eq!(worktree.id, ctx.worktree_id);
    assert_eq!(worktree.workspace_id, ctx.workspace_id);
}

#[test]
fn test_worktree_not_found() {
    let ctx = TestContext::new();
    let service = WorktreeService::new(ctx.pool.clone());

    let result = service.get_worktree("nonexistent");
    assert!(result.is_err());
}

#[test]
fn test_worktree_list() {
    let ctx = TestContext::new();
    let service = WorktreeService::new(ctx.pool.clone());

    let worktrees = service
        .list_worktrees(&ctx.workspace_id)
        .expect("Should list worktrees");

    // Should have at least the test context worktree
    assert!(!worktrees.is_empty());
    assert!(worktrees.iter().any(|w| w.id == ctx.worktree_id));
}

#[test]
fn test_worktree_default_sort_mode() {
    let ctx = TestContext::new();
    let service = WorktreeService::new(ctx.pool.clone());

    let worktree = service
        .get_worktree(&ctx.worktree_id)
        .expect("Should get worktree");

    assert_eq!(worktree.sort_mode, SortMode::Free);
}

#[test]
fn test_worktree_update() {
    let ctx = TestContext::new();
    let service = WorktreeService::new(ctx.pool.clone());

    // Update the worktree
    let updated = service
        .update_worktree(
            &ctx.worktree_id,
            UpdateWorktreeInput {
                name: Some("Updated Name".to_string()),
                sort_mode: Some(SortMode::Status),
                display_order: Some(5),
            },
        )
        .expect("Should update worktree");

    assert_eq!(updated.name, "Updated Name");
    assert_eq!(updated.sort_mode, SortMode::Status);
    assert_eq!(updated.display_order, 5);
}

#[test]
fn test_worktree_main_flag() {
    let ctx = TestContext::new();
    let service = WorktreeService::new(ctx.pool.clone());

    // The default worktree should be marked as main
    let worktree = service
        .get_worktree(&ctx.worktree_id)
        .expect("Should get worktree");

    assert!(worktree.is_main, "Default worktree should be marked as main");
}

#[test]
fn test_worktree_repository_direct() {
    let ctx = TestContext::new();
    let repo = WorktreeRepository::new(ctx.pool.clone());

    // Test repository directly
    let worktrees = repo
        .find_by_workspace_id(&ctx.workspace_id)
        .expect("Should find worktrees by workspace id");
    assert!(!worktrees.is_empty());

    let worktree = repo
        .find_by_id(&ctx.worktree_id)
        .expect("Should find worktree by id");
    assert!(worktree.is_some());

    let worktree = worktree.unwrap();
    assert_eq!(worktree.id, ctx.worktree_id);
}

#[test]
fn test_worktree_reorder() {
    let ctx = TestContext::new();
    let repo = WorktreeRepository::new(ctx.pool.clone());

    // Create additional worktrees directly for testing
    let now = chrono::Utc::now().to_rfc3339();

    let wt1 = claude_manager_lib::types::Worktree {
        id: format!("wt_reorder_1_{}", ctx.workspace_id),
        workspace_id: ctx.workspace_id.clone(),
        name: "branch1".to_string(),
        branch: "branch1".to_string(),
        path: format!("{}/b1", ctx.temp_path().display()),
        sort_mode: SortMode::Free,
        display_order: 1,
        is_main: false,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    let wt2 = claude_manager_lib::types::Worktree {
        id: format!("wt_reorder_2_{}", ctx.workspace_id),
        workspace_id: ctx.workspace_id.clone(),
        name: "branch2".to_string(),
        branch: "branch2".to_string(),
        path: format!("{}/b2", ctx.temp_path().display()),
        sort_mode: SortMode::Free,
        display_order: 2,
        is_main: false,
        created_at: now.clone(),
        updated_at: now,
    };

    repo.create(&wt1).expect("Should create wt1");
    repo.create(&wt2).expect("Should create wt2");

    // Reorder: wt2 first, wt1 second
    repo.reorder(&ctx.workspace_id, &[wt2.id.clone(), wt1.id.clone(), ctx.worktree_id.clone()])
        .expect("Should reorder");

    // Verify order
    let worktrees = repo.find_by_workspace_id(&ctx.workspace_id).unwrap();
    let wt2_updated = worktrees.iter().find(|w| w.id == wt2.id).unwrap();
    let wt1_updated = worktrees.iter().find(|w| w.id == wt1.id).unwrap();

    assert_eq!(wt2_updated.display_order, 0);
    assert_eq!(wt1_updated.display_order, 1);
}
