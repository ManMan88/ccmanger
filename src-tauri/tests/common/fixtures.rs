//! Test fixtures and data factories
//!
//! This module provides factory functions for creating test data.

use claude_manager_lib::types::{
    Agent, AgentMode, AgentStatus, Message, MessageRole, Permission, Workspace, Worktree,
    SortMode,
};
use uuid::Uuid;

/// Create a test workspace with default values
pub fn create_workspace() -> Workspace {
    let now = chrono::Utc::now().to_rfc3339();
    Workspace {
        id: format!("ws_{}", Uuid::new_v4()),
        name: "Test Workspace".to_string(),
        path: format!("/tmp/test-workspace-{}", Uuid::new_v4()),
        created_at: now.clone(),
        updated_at: now,
        worktree_count: 0,
        agent_count: 0,
    }
}

/// Create a test workspace with a custom name
pub fn create_workspace_with_name(name: &str) -> Workspace {
    let mut ws = create_workspace();
    ws.name = name.to_string();
    ws
}

/// Create a test worktree with default values
pub fn create_worktree(workspace_id: &str) -> Worktree {
    let now = chrono::Utc::now().to_rfc3339();
    Worktree {
        id: format!("wt_{}", Uuid::new_v4()),
        workspace_id: workspace_id.to_string(),
        name: "main".to_string(),
        branch: "main".to_string(),
        path: format!("/tmp/test-worktree-{}", Uuid::new_v4()),
        sort_mode: SortMode::Free,
        display_order: 0,
        is_main: true,
        created_at: now.clone(),
        updated_at: now,
    }
}

/// Create a test worktree with a custom branch
pub fn create_worktree_with_branch(workspace_id: &str, branch: &str) -> Worktree {
    let mut wt = create_worktree(workspace_id);
    wt.name = branch.to_string();
    wt.branch = branch.to_string();
    wt.is_main = branch == "main";
    wt
}

/// Create a test agent with default values
pub fn create_agent(worktree_id: &str) -> Agent {
    let now = chrono::Utc::now().to_rfc3339();
    Agent {
        id: format!("ag_{}{}",
            chrono::Utc::now().timestamp_millis(),
            &Uuid::new_v4().to_string()[..8]
        ),
        worktree_id: worktree_id.to_string(),
        name: "Test Agent".to_string(),
        status: AgentStatus::Finished,
        context_level: 0,
        mode: AgentMode::Regular,
        permissions: vec![Permission::Read],
        display_order: 0,
        pid: None,
        session_id: None,
        created_at: now.clone(),
        updated_at: now,
        started_at: None,
        stopped_at: None,
        deleted_at: None,
        parent_agent_id: None,
    }
}

/// Create a test agent with a custom name
pub fn create_agent_with_name(worktree_id: &str, name: &str) -> Agent {
    let mut agent = create_agent(worktree_id);
    agent.name = name.to_string();
    agent
}

/// Create a test agent with a specific mode
pub fn create_agent_with_mode(worktree_id: &str, mode: AgentMode) -> Agent {
    let mut agent = create_agent(worktree_id);
    agent.mode = mode;
    agent
}

/// Create a test agent with specific permissions
pub fn create_agent_with_permissions(worktree_id: &str, permissions: Vec<Permission>) -> Agent {
    let mut agent = create_agent(worktree_id);
    agent.permissions = permissions;
    agent
}

/// Create a running test agent
pub fn create_running_agent(worktree_id: &str) -> Agent {
    let mut agent = create_agent(worktree_id);
    agent.status = AgentStatus::Running;
    agent.pid = Some(12345);
    agent.started_at = Some(chrono::Utc::now().to_rfc3339());
    agent
}

/// Create a test message
pub fn create_message(agent_id: &str) -> Message {
    let now = chrono::Utc::now().to_rfc3339();
    Message {
        id: format!("msg_{}{}",
            chrono::Utc::now().timestamp_millis(),
            &Uuid::new_v4().to_string()[..8]
        ),
        agent_id: agent_id.to_string(),
        role: MessageRole::User,
        content: "Test message content".to_string(),
        token_count: None,
        tool_name: None,
        tool_input: None,
        tool_output: None,
        created_at: now,
        is_complete: true,
    }
}

/// Create a user message
pub fn create_user_message(agent_id: &str, content: &str) -> Message {
    let mut msg = create_message(agent_id);
    msg.content = content.to_string();
    msg.role = MessageRole::User;
    msg
}

/// Create an assistant message
pub fn create_assistant_message(agent_id: &str, content: &str) -> Message {
    let mut msg = create_message(agent_id);
    msg.content = content.to_string();
    msg.role = MessageRole::Assistant;
    msg
}

/// Create a tool use message
pub fn create_tool_message(agent_id: &str, tool_name: &str, input: &str, output: &str) -> Message {
    let mut msg = create_message(agent_id);
    msg.role = MessageRole::Assistant;
    msg.content = String::new();
    msg.tool_name = Some(tool_name.to_string());
    msg.tool_input = Some(input.to_string());
    msg.tool_output = Some(output.to_string());
    msg
}

/// Builder for creating agents with various configurations
pub struct AgentBuilder {
    agent: Agent,
}

impl AgentBuilder {
    pub fn new(worktree_id: &str) -> Self {
        Self {
            agent: create_agent(worktree_id),
        }
    }

    pub fn name(mut self, name: &str) -> Self {
        self.agent.name = name.to_string();
        self
    }

    pub fn mode(mut self, mode: AgentMode) -> Self {
        self.agent.mode = mode;
        self
    }

    pub fn permissions(mut self, permissions: Vec<Permission>) -> Self {
        self.agent.permissions = permissions;
        self
    }

    pub fn status(mut self, status: AgentStatus) -> Self {
        self.agent.status = status;
        self
    }

    pub fn context_level(mut self, level: i32) -> Self {
        self.agent.context_level = level;
        self
    }

    pub fn display_order(mut self, order: i32) -> Self {
        self.agent.display_order = order;
        self
    }

    pub fn parent(mut self, parent_id: &str) -> Self {
        self.agent.parent_agent_id = Some(parent_id.to_string());
        self
    }

    pub fn build(self) -> Agent {
        self.agent
    }
}
