import type Database from 'better-sqlite3'

export const version = 1
export const name = 'initial_schema'

export function up(db: Database.Database): void {
  db.exec(`
    -- Schema migrations table
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      checksum TEXT NOT NULL
    );

    -- Workspaces
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      worktree_count INTEGER NOT NULL DEFAULT 0,
      agent_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_workspaces_path ON workspaces(path);
    CREATE INDEX idx_workspaces_updated ON workspaces(updated_at DESC);

    -- Worktrees
    CREATE TABLE worktrees (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      branch TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      sort_mode TEXT NOT NULL DEFAULT 'free' CHECK(sort_mode IN ('free', 'status', 'name')),
      display_order INTEGER NOT NULL DEFAULT 0,
      is_main INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      UNIQUE(workspace_id, name)
    );
    CREATE INDEX idx_worktrees_workspace ON worktrees(workspace_id);
    CREATE INDEX idx_worktrees_path ON worktrees(path);
    CREATE INDEX idx_worktrees_order ON worktrees(workspace_id, display_order);

    -- Agents
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      worktree_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('running', 'waiting', 'error', 'finished')),
      context_level INTEGER NOT NULL DEFAULT 0 CHECK(context_level >= 0 AND context_level <= 100),
      mode TEXT NOT NULL DEFAULT 'regular' CHECK(mode IN ('auto', 'plan', 'regular')),
      permissions TEXT NOT NULL DEFAULT '["read"]',
      display_order INTEGER NOT NULL DEFAULT 0,
      pid INTEGER,
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      stopped_at TEXT,
      deleted_at TEXT,
      parent_agent_id TEXT,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL
    );
    CREATE INDEX idx_agents_worktree ON agents(worktree_id);
    CREATE INDEX idx_agents_status ON agents(status);
    CREATE INDEX idx_agents_active ON agents(worktree_id, deleted_at) WHERE deleted_at IS NULL;
    CREATE INDEX idx_agents_deleted ON agents(worktree_id, deleted_at) WHERE deleted_at IS NOT NULL;
    CREATE INDEX idx_agents_order ON agents(worktree_id, display_order);

    -- Messages
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      token_count INTEGER,
      tool_name TEXT,
      tool_input TEXT,
      tool_output TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_complete INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_messages_agent ON messages(agent_id);
    CREATE INDEX idx_messages_agent_time ON messages(agent_id, created_at);
    CREATE INDEX idx_messages_role ON messages(agent_id, role);

    -- Usage Stats
    CREATE TABLE usage_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      period TEXT NOT NULL CHECK(period IN ('daily', 'weekly', 'monthly')),
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      model_usage TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, period)
    );
    CREATE INDEX idx_usage_date ON usage_stats(date DESC);
    CREATE INDEX idx_usage_period ON usage_stats(period, date DESC);

    -- Settings
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('string', 'number', 'boolean', 'json')),
      description TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Agent Sessions
    CREATE TABLE agent_sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      session_data TEXT NOT NULL,
      context_snapshot TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_sessions_agent ON agent_sessions(agent_id);

    -- Insert default settings
    INSERT INTO settings (key, value, type, description) VALUES
      ('theme', 'system', 'string', 'UI theme preference'),
      ('auto_save', 'true', 'boolean', 'Auto-save workspace state'),
      ('notifications', 'true', 'boolean', 'Enable desktop notifications'),
      ('default_mode', 'regular', 'string', 'Default agent mode'),
      ('confirm_delete', 'true', 'boolean', 'Confirm before deleting agents'),
      ('max_context_warning', '80', 'number', 'Context level warning threshold');
  `)
}

export function down(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS agent_sessions;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS usage_stats;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS agents;
    DROP TABLE IF EXISTS worktrees;
    DROP TABLE IF EXISTS workspaces;
    DROP TABLE IF EXISTS schema_migrations;
  `)
}
