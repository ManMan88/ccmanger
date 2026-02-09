-- Rename 'finished' status to 'idle' for agents
-- SQLite doesn't support ALTER TABLE to modify CHECK constraints,
-- so we recreate the table with the updated constraint.

-- 1. Create new table with 'idle' in the CHECK constraint
CREATE TABLE agents_new (
    id TEXT PRIMARY KEY,
    worktree_id TEXT NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('running', 'waiting', 'error', 'idle')),
    context_level INTEGER NOT NULL DEFAULT 0 CHECK (context_level >= 0 AND context_level <= 100),
    mode TEXT NOT NULL DEFAULT 'regular' CHECK (mode IN ('auto', 'plan', 'regular')),
    permissions TEXT NOT NULL DEFAULT '["read"]',
    display_order INTEGER NOT NULL DEFAULT 0,
    pid INTEGER,
    session_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    stopped_at TEXT,
    deleted_at TEXT,
    parent_agent_id TEXT REFERENCES agents_new(id) ON DELETE SET NULL
);

-- 2. Copy data, converting 'finished' to 'idle'
INSERT INTO agents_new
SELECT id, worktree_id, name,
       CASE WHEN status = 'finished' THEN 'idle' ELSE status END,
       context_level, mode, permissions, display_order, pid, session_id,
       created_at, updated_at, started_at, stopped_at, deleted_at, parent_agent_id
FROM agents;

-- 3. Drop old table and rename
DROP TABLE agents;
ALTER TABLE agents_new RENAME TO agents;

-- 4. Recreate indexes
CREATE INDEX idx_agents_worktree_id ON agents(worktree_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_active ON agents(worktree_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_deleted ON agents(worktree_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_agents_order ON agents(worktree_id, display_order);
