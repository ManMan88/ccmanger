//! Agent API integration tests

mod common {
    pub use crate::common::*;
}

use std::sync::Arc;

use claude_manager_lib::db::AgentRepository;
use claude_manager_lib::services::{AgentService, ProcessManager};
use claude_manager_lib::types::{AgentMode, AgentStatus, Permission, UpdateAgentInput};

use common::fixtures::AgentBuilder;
use common::TestContext;

#[test]
fn test_agent_crud() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    // Create agent
    let created = service
        .create_agent(
            &ctx.worktree_id,
            Some("Test Agent".to_string()),
            AgentMode::Regular,
            vec![Permission::Read],
        )
        .expect("Should create agent");

    assert!(created.id.starts_with("ag_"));
    assert_eq!(created.name, "Test Agent");
    assert_eq!(created.status, AgentStatus::Finished);
    assert_eq!(created.mode, AgentMode::Regular);
    assert_eq!(created.permissions, vec![Permission::Read]);

    // Get agent
    let found = service
        .get_agent(&created.id)
        .expect("Should get agent");
    assert_eq!(found.name, "Test Agent");

    // Update agent
    let updated = service
        .update_agent(
            &created.id,
            UpdateAgentInput {
                name: Some("Updated Agent".to_string()),
                mode: Some(AgentMode::Auto),
                permissions: Some(vec![Permission::Read, Permission::Write]),
                display_order: None,
            },
        )
        .expect("Should update agent");

    assert_eq!(updated.name, "Updated Agent");
    assert_eq!(updated.mode, AgentMode::Auto);
    assert_eq!(
        updated.permissions,
        vec![Permission::Read, Permission::Write]
    );

    // Delete agent (archive)
    service
        .delete_agent(&created.id, true)
        .expect("Should archive agent");

    // Verify not in normal list
    let agents = service
        .list_agents(&ctx.worktree_id, false)
        .expect("Should list agents");
    assert!(!agents.iter().any(|a| a.id == created.id));

    // Verify in deleted list
    let agents = service
        .list_agents(&ctx.worktree_id, true)
        .expect("Should list all agents including deleted");
    assert!(agents.iter().any(|a| a.id == created.id));
}

#[test]
fn test_agent_default_name() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    // Create agent without explicit name
    let created = service
        .create_agent(
            &ctx.worktree_id,
            None,
            AgentMode::Regular,
            vec![Permission::Read],
        )
        .expect("Should create agent");

    // Should have a default name like "Agent HH:MM"
    assert!(
        created.name.starts_with("Agent"),
        "Default name should start with 'Agent'"
    );
}

#[test]
fn test_agent_not_found() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    let result = service.get_agent("nonexistent");
    assert!(result.is_err());
}

#[test]
fn test_agent_fork() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    // Create parent agent
    let parent = service
        .create_agent(
            &ctx.worktree_id,
            Some("Parent Agent".to_string()),
            AgentMode::Auto,
            vec![Permission::Read, Permission::Write],
        )
        .expect("Should create parent");

    // Fork agent
    let forked = service
        .fork_agent(&parent.id, None)
        .expect("Should fork agent");

    assert_eq!(forked.name, "Parent Agent (fork)");
    assert_eq!(forked.mode, AgentMode::Auto);
    assert_eq!(
        forked.permissions,
        vec![Permission::Read, Permission::Write]
    );
    assert_eq!(forked.parent_agent_id, Some(parent.id));
}

#[test]
fn test_agent_fork_with_custom_name() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    let parent = service
        .create_agent(
            &ctx.worktree_id,
            Some("Parent".to_string()),
            AgentMode::Regular,
            vec![],
        )
        .expect("Should create parent");

    let forked = service
        .fork_agent(&parent.id, Some("Custom Fork Name".to_string()))
        .expect("Should fork agent");

    assert_eq!(forked.name, "Custom Fork Name");
}

#[test]
fn test_agent_restore() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    let agent = service
        .create_agent(
            &ctx.worktree_id,
            Some("Test".to_string()),
            AgentMode::Regular,
            vec![],
        )
        .expect("Should create agent");

    // Archive
    service
        .delete_agent(&agent.id, true)
        .expect("Should archive");

    // Restore
    let restored = service
        .restore_agent(&agent.id)
        .expect("Should restore agent");

    assert!(restored.deleted_at.is_none());

    // Verify appears in normal list
    let agents = service
        .list_agents(&ctx.worktree_id, false)
        .expect("Should list agents");
    assert!(agents.iter().any(|a| a.id == agent.id));
}

#[test]
fn test_agent_permanent_delete() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    let agent = service
        .create_agent(
            &ctx.worktree_id,
            Some("Test".to_string()),
            AgentMode::Regular,
            vec![],
        )
        .expect("Should create agent");

    // Permanent delete
    service
        .delete_agent(&agent.id, false)
        .expect("Should permanently delete");

    // Verify not found even with include_deleted
    let agents = service
        .list_agents(&ctx.worktree_id, true)
        .expect("Should list all agents");
    assert!(!agents.iter().any(|a| a.id == agent.id));
}

#[test]
fn test_agent_reorder() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    let agent1 = service
        .create_agent(
            &ctx.worktree_id,
            Some("Agent 1".to_string()),
            AgentMode::Regular,
            vec![],
        )
        .expect("Should create agent 1");

    let agent2 = service
        .create_agent(
            &ctx.worktree_id,
            Some("Agent 2".to_string()),
            AgentMode::Regular,
            vec![],
        )
        .expect("Should create agent 2");

    // Reorder: agent2 first
    let reordered = service
        .reorder_agents(&ctx.worktree_id, &[agent2.id.clone(), agent1.id.clone()])
        .expect("Should reorder agents");

    let a2 = reordered.iter().find(|a| a.id == agent2.id).unwrap();
    let a1 = reordered.iter().find(|a| a.id == agent1.id).unwrap();

    assert_eq!(a2.display_order, 0);
    assert_eq!(a1.display_order, 1);
}

#[test]
fn test_agent_modes() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    // Test all modes
    for mode in [AgentMode::Regular, AgentMode::Auto, AgentMode::Plan] {
        let agent = service
            .create_agent(
                &ctx.worktree_id,
                Some(format!("{:?} Agent", mode)),
                mode.clone(),
                vec![],
            )
            .expect(&format!("Should create {:?} agent", mode));

        assert_eq!(agent.mode, mode);
    }
}

#[test]
fn test_agent_permissions() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    let all_perms = vec![Permission::Read, Permission::Write, Permission::Execute];

    let agent = service
        .create_agent(
            &ctx.worktree_id,
            Some("Full Perms Agent".to_string()),
            AgentMode::Auto,
            all_perms.clone(),
        )
        .expect("Should create agent with all permissions");

    assert_eq!(agent.permissions, all_perms);
}

#[test]
fn test_agent_repository_direct() {
    let ctx = TestContext::new();
    let repo = AgentRepository::new(ctx.pool.clone());

    // Create agent using fixture builder
    let agent = AgentBuilder::new(&ctx.worktree_id)
        .name("Repository Test Agent")
        .mode(AgentMode::Regular)
        .permissions(vec![Permission::Read])
        .build();

    // Use repository directly
    let created = repo.create(&agent).expect("Should create via repository");
    assert_eq!(created.name, "Repository Test Agent");

    let found = repo
        .find_by_id(&agent.id)
        .expect("Should find by id")
        .expect("Should exist");
    assert_eq!(found.id, agent.id);

    let by_worktree = repo
        .find_by_worktree_id(&ctx.worktree_id, false)
        .expect("Should find by worktree");
    assert!(by_worktree.iter().any(|a| a.id == agent.id));
}

#[test]
fn test_agent_list_empty_worktree() {
    let ctx = TestContext::new();
    let pm = Arc::new(ProcessManager::new("echo".to_string()));
    let service = AgentService::new(ctx.pool.clone(), pm);

    // List agents for a worktree with no agents
    let agents = service
        .list_agents(&ctx.worktree_id, false)
        .expect("Should list agents");

    // Initially empty (test context doesn't create agents)
    assert!(agents.is_empty());
}
