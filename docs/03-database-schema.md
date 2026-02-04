# Database Schema

## Overview

Claude Manager uses SQLite for data persistence. SQLite was chosen for:
- Zero configuration required
- Single file database (easy backup/portability)
- Excellent read performance for our use case
- No separate database server needed
- Synchronous operations via better-sqlite3

## Database Location

```
~/.claude-manager/
├── data.db              # Main database
├── data.db-wal          # Write-ahead log (auto-managed)
├── data.db-shm          # Shared memory file (auto-managed)
└── backups/
    └── data.db.bak.{timestamp}
```

## Schema Version Management

Migrations are tracked in a dedicated table:

```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    checksum TEXT NOT NULL
);
```

## Table Definitions

### 1. workspaces

Stores registered workspace (git repository) information.

```sql
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Denormalized counts for quick access
    worktree_count INTEGER NOT NULL DEFAULT 0,
    agent_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_workspaces_path ON workspaces(path);
CREATE INDEX idx_workspaces_updated ON workspaces(updated_at DESC);
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT | UUID (ws_xxxx format) |
| name | TEXT | Derived from directory name |
| path | TEXT | Absolute path to git repository |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |
| worktree_count | INTEGER | Cached count of worktrees |
| agent_count | INTEGER | Cached count of active agents |

### 2. worktrees

Stores git worktree information.

```sql
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
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT | UUID (wt_xxxx format) |
| workspace_id | TEXT | FK to workspaces |
| name | TEXT | User-friendly name |
| branch | TEXT | Current git branch |
| path | TEXT | Absolute filesystem path |
| sort_mode | TEXT | Agent sort mode (free/status/name) |
| display_order | INTEGER | Position in UI |
| is_main | INTEGER | 1 if main worktree (not deletable) |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

### 3. agents

Stores agent instances and their configuration.

```sql
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    worktree_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('running', 'waiting', 'error', 'finished')),
    context_level INTEGER NOT NULL DEFAULT 0 CHECK(context_level >= 0 AND context_level <= 100),
    mode TEXT NOT NULL DEFAULT 'regular' CHECK(mode IN ('auto', 'plan', 'regular')),
    permissions TEXT NOT NULL DEFAULT '["read"]', -- JSON array
    display_order INTEGER NOT NULL DEFAULT 0,

    -- Process information (runtime only)
    pid INTEGER,
    session_id TEXT,

    -- Lifecycle timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    stopped_at TEXT,

    -- Soft delete for history
    deleted_at TEXT,

    -- Parent reference for forked agents
    parent_agent_id TEXT,

    FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX idx_agents_worktree ON agents(worktree_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_active ON agents(worktree_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_deleted ON agents(worktree_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_agents_order ON agents(worktree_id, display_order);
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT | UUID (ag_xxxx format) |
| worktree_id | TEXT | FK to worktrees |
| name | TEXT | User-assigned name |
| status | TEXT | running/waiting/error/finished |
| context_level | INTEGER | 0-100 percentage |
| mode | TEXT | auto/plan/regular |
| permissions | TEXT | JSON array of permissions |
| display_order | INTEGER | Position in UI |
| pid | INTEGER | Process ID (when running) |
| session_id | TEXT | Claude CLI session ID |
| created_at | TEXT | When agent was created |
| updated_at | TEXT | Last modification |
| started_at | TEXT | When process started |
| stopped_at | TEXT | When process stopped |
| deleted_at | TEXT | Soft delete timestamp |
| parent_agent_id | TEXT | FK for forked agents |

### 4. messages

Stores conversation history for each agent.

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,

    -- Token tracking
    token_count INTEGER,

    -- Tool calls (if role='tool')
    tool_name TEXT,
    tool_input TEXT, -- JSON
    tool_output TEXT, -- JSON

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Streaming state
    is_complete INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_agent ON messages(agent_id);
CREATE INDEX idx_messages_agent_time ON messages(agent_id, created_at);
CREATE INDEX idx_messages_role ON messages(agent_id, role);
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT | UUID (msg_xxxx format) |
| agent_id | TEXT | FK to agents |
| role | TEXT | user/assistant/system/tool |
| content | TEXT | Message text |
| token_count | INTEGER | Tokens used (if known) |
| tool_name | TEXT | Tool name for tool calls |
| tool_input | TEXT | JSON tool input |
| tool_output | TEXT | JSON tool output |
| created_at | TEXT | ISO 8601 timestamp |
| is_complete | INTEGER | 0 if streaming |

### 5. usage_stats

Tracks API usage statistics.

```sql
CREATE TABLE usage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, -- YYYY-MM-DD format
    period TEXT NOT NULL CHECK(period IN ('daily', 'weekly', 'monthly')),

    -- Token counts
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,

    -- Request counts
    request_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,

    -- Model breakdown (JSON)
    model_usage TEXT, -- {"claude-3-opus": 10000, "claude-3-sonnet": 5000}

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(date, period)
);

CREATE INDEX idx_usage_date ON usage_stats(date DESC);
CREATE INDEX idx_usage_period ON usage_stats(period, date DESC);
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| date | TEXT | Date in YYYY-MM-DD format |
| period | TEXT | daily/weekly/monthly |
| input_tokens | INTEGER | Input tokens used |
| output_tokens | INTEGER | Output tokens used |
| total_tokens | INTEGER | Total tokens |
| request_count | INTEGER | API requests made |
| error_count | INTEGER | Failed requests |
| model_usage | TEXT | JSON breakdown by model |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

### 6. settings

Stores application settings (key-value store).

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default settings
INSERT INTO settings (key, value, type, description) VALUES
    ('theme', 'system', 'string', 'UI theme preference'),
    ('auto_save', 'true', 'boolean', 'Auto-save workspace state'),
    ('notifications', 'true', 'boolean', 'Enable desktop notifications'),
    ('default_mode', 'regular', 'string', 'Default agent mode'),
    ('confirm_delete', 'true', 'boolean', 'Confirm before deleting agents'),
    ('max_context_warning', '80', 'number', 'Context level warning threshold');
```

### 7. agent_sessions

Stores Claude CLI session information for resumption.

```sql
CREATE TABLE agent_sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_data TEXT NOT NULL, -- JSON blob from Claude CLI
    context_snapshot TEXT, -- Conversation state
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_agent ON agent_sessions(agent_id);
```

## Entity Relationship Diagram

```
┌─────────────────┐
│   workspaces    │
├─────────────────┤
│ id (PK)         │
│ name            │
│ path            │
│ worktree_count  │
│ agent_count     │
│ created_at      │
│ updated_at      │
└────────┬────────┘
         │ 1
         │
         │ *
┌────────┴────────┐
│    worktrees    │
├─────────────────┤
│ id (PK)         │
│ workspace_id(FK)│◀──────────────────────┐
│ name            │                        │
│ branch          │                        │
│ path            │                        │
│ sort_mode       │                        │
│ display_order   │                        │
│ is_main         │                        │
│ created_at      │                        │
│ updated_at      │                        │
└────────┬────────┘                        │
         │ 1                               │
         │                                 │
         │ *                               │
┌────────┴────────┐      ┌─────────────────┴───────┐
│     agents      │      │    agent_sessions       │
├─────────────────┤      ├─────────────────────────┤
│ id (PK)         │◀─────│ agent_id (FK)           │
│ worktree_id(FK) │      │ id (PK)                 │
│ name            │      │ session_data            │
│ status          │      │ context_snapshot        │
│ context_level   │      │ created_at              │
│ mode            │      │ updated_at              │
│ permissions     │      └─────────────────────────┘
│ display_order   │
│ pid             │
│ session_id      │
│ parent_agent_id │──┐ (self-reference)
│ created_at      │◀─┘
│ updated_at      │
│ started_at      │
│ stopped_at      │
│ deleted_at      │
└────────┬────────┘
         │ 1
         │
         │ *
┌────────┴────────┐
│    messages     │
├─────────────────┤
│ id (PK)         │
│ agent_id (FK)   │
│ role            │
│ content         │
│ token_count     │
│ tool_name       │
│ tool_input      │
│ tool_output     │
│ created_at      │
│ is_complete     │
└─────────────────┘

┌─────────────────┐      ┌─────────────────┐
│  usage_stats    │      │    settings     │
├─────────────────┤      ├─────────────────┤
│ id (PK)         │      │ key (PK)        │
│ date            │      │ value           │
│ period          │      │ type            │
│ input_tokens    │      │ description     │
│ output_tokens   │      │ updated_at      │
│ total_tokens    │      └─────────────────┘
│ request_count   │
│ error_count     │
│ model_usage     │
│ created_at      │
│ updated_at      │
└─────────────────┘
```

## Migration Files

### Migration 001: Initial Schema

```typescript
// server/src/db/migrations/001_initial_schema.ts

import { Database } from 'better-sqlite3'

export const version = 1
export const name = 'initial_schema'

export function up(db: Database): void {
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

export function down(db: Database): void {
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
```

## TypeScript Types

```typescript
// shared/types.ts

// Database row types (snake_case, matches DB)
export interface WorkspaceRow {
  id: string
  name: string
  path: string
  created_at: string
  updated_at: string
  worktree_count: number
  agent_count: number
}

export interface WorktreeRow {
  id: string
  workspace_id: string
  name: string
  branch: string
  path: string
  sort_mode: 'free' | 'status' | 'name'
  display_order: number
  is_main: number // SQLite boolean
  created_at: string
  updated_at: string
}

export interface AgentRow {
  id: string
  worktree_id: string
  name: string
  status: 'running' | 'waiting' | 'error' | 'finished'
  context_level: number
  mode: 'auto' | 'plan' | 'regular'
  permissions: string // JSON array
  display_order: number
  pid: number | null
  session_id: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  stopped_at: string | null
  deleted_at: string | null
  parent_agent_id: string | null
}

export interface MessageRow {
  id: string
  agent_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  token_count: number | null
  tool_name: string | null
  tool_input: string | null
  tool_output: string | null
  created_at: string
  is_complete: number
}

export interface UsageStatsRow {
  id: number
  date: string
  period: 'daily' | 'weekly' | 'monthly'
  input_tokens: number
  output_tokens: number
  total_tokens: number
  request_count: number
  error_count: number
  model_usage: string | null
  created_at: string
  updated_at: string
}

export interface SettingRow {
  key: string
  value: string
  type: 'string' | 'number' | 'boolean' | 'json'
  description: string | null
  updated_at: string
}

export interface AgentSessionRow {
  id: string
  agent_id: string
  session_data: string
  context_snapshot: string | null
  created_at: string
  updated_at: string
}
```

## Repository Implementation Example

```typescript
// server/src/db/repositories/agent.repository.ts

import Database from 'better-sqlite3'
import { AgentRow } from '@shared/types'
import { generateId } from '../utils'

export interface CreateAgentDto {
  worktreeId: string
  name: string
  mode: 'auto' | 'plan' | 'regular'
  permissions: string[]
}

export interface UpdateAgentDto {
  name?: string
  status?: 'running' | 'waiting' | 'error' | 'finished'
  contextLevel?: number
  mode?: 'auto' | 'plan' | 'regular'
  permissions?: string[]
  pid?: number | null
  sessionId?: string | null
}

export class AgentRepository {
  constructor(private db: Database.Database) {}

  findById(id: string): AgentRow | null {
    return this.db
      .prepare('SELECT * FROM agents WHERE id = ?')
      .get(id) as AgentRow | null
  }

  findByWorktreeId(worktreeId: string, includeDeleted = false): AgentRow[] {
    const query = includeDeleted
      ? 'SELECT * FROM agents WHERE worktree_id = ? ORDER BY display_order'
      : 'SELECT * FROM agents WHERE worktree_id = ? AND deleted_at IS NULL ORDER BY display_order'

    return this.db.prepare(query).all(worktreeId) as AgentRow[]
  }

  findActive(): AgentRow[] {
    return this.db
      .prepare("SELECT * FROM agents WHERE status = 'running' AND deleted_at IS NULL")
      .all() as AgentRow[]
  }

  create(dto: CreateAgentDto): AgentRow {
    const id = generateId('ag')
    const now = new Date().toISOString()

    // Get next display order
    const maxOrder = this.db
      .prepare('SELECT MAX(display_order) as max FROM agents WHERE worktree_id = ?')
      .get(dto.worktreeId) as { max: number | null }

    const displayOrder = (maxOrder.max ?? -1) + 1

    this.db.prepare(`
      INSERT INTO agents (id, worktree_id, name, mode, permissions, display_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, dto.worktreeId, dto.name, dto.mode, JSON.stringify(dto.permissions), displayOrder, now, now)

    return this.findById(id)!
  }

  update(id: string, dto: UpdateAgentDto): AgentRow {
    const updates: string[] = []
    const params: any[] = []

    if (dto.name !== undefined) {
      updates.push('name = ?')
      params.push(dto.name)
    }
    if (dto.status !== undefined) {
      updates.push('status = ?')
      params.push(dto.status)
    }
    if (dto.contextLevel !== undefined) {
      updates.push('context_level = ?')
      params.push(dto.contextLevel)
    }
    if (dto.mode !== undefined) {
      updates.push('mode = ?')
      params.push(dto.mode)
    }
    if (dto.permissions !== undefined) {
      updates.push('permissions = ?')
      params.push(JSON.stringify(dto.permissions))
    }
    if (dto.pid !== undefined) {
      updates.push('pid = ?')
      params.push(dto.pid)
    }
    if (dto.sessionId !== undefined) {
      updates.push('session_id = ?')
      params.push(dto.sessionId)
    }

    updates.push('updated_at = ?')
    params.push(new Date().toISOString())
    params.push(id)

    this.db.prepare(`
      UPDATE agents SET ${updates.join(', ')} WHERE id = ?
    `).run(...params)

    return this.findById(id)!
  }

  softDelete(id: string): void {
    this.db.prepare(`
      UPDATE agents SET deleted_at = ?, status = 'finished', pid = NULL
      WHERE id = ?
    `).run(new Date().toISOString(), id)
  }

  hardDelete(id: string): void {
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(id)
  }

  restore(id: string): AgentRow {
    this.db.prepare(`
      UPDATE agents SET deleted_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id)

    return this.findById(id)!
  }

  reorder(worktreeId: string, agentIds: string[]): void {
    const stmt = this.db.prepare(
      'UPDATE agents SET display_order = ? WHERE id = ? AND worktree_id = ?'
    )

    const transaction = this.db.transaction(() => {
      agentIds.forEach((id, index) => {
        stmt.run(index, id, worktreeId)
      })
    })

    transaction()
  }
}
```

## Backup & Recovery

### Automatic Backups

```typescript
// server/src/db/backup.ts

import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

export function createBackup(db: Database.Database, backupDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `data.db.bak.${timestamp}`)

  db.backup(backupPath)

  // Clean old backups (keep last 10)
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('data.db.bak.'))
    .sort()
    .reverse()

  for (const old of backups.slice(10)) {
    fs.unlinkSync(path.join(backupDir, old))
  }

  return backupPath
}
```

### Recovery

```bash
# Stop the server
# Copy backup over current database
cp ~/.claude-manager/backups/data.db.bak.{timestamp} ~/.claude-manager/data.db
# Restart the server
```

## Performance Considerations

1. **Indexes**: All frequently queried columns are indexed
2. **Partial Indexes**: Used for active/deleted agent queries
3. **JSON Storage**: Permissions stored as JSON for flexibility
4. **Denormalized Counts**: Workspace counts cached for quick dashboard loads
5. **WAL Mode**: SQLite WAL mode for better concurrent read performance

```typescript
// Enable WAL mode on connection
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('cache_size = -64000') // 64MB cache
db.pragma('foreign_keys = ON')
```
