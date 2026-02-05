# Rust Backend + Tauri Migration Plan

## Migration Status

| Phase | Description                 | Status                   |
| ----- | --------------------------- | ------------------------ |
| 1     | Project Setup & Foundation  | ✅ **Complete**          |
| 2     | Core Types & Database Layer | ✅ Complete (in Phase 1) |
| 3     | Service Layer               | ✅ Complete (in Phase 1) |
| 4     | WebSocket Server            | ✅ Complete (in Phase 1) |
| 5     | Tauri Commands (IPC)        | ✅ Complete (in Phase 1) |
| 6     | Frontend Integration        | ⬜ Not Started           |
| 7     | Build & Distribution        | ⬜ Not Started           |
| 8     | Migration & Testing         | ⬜ Not Started           |

**Phase 1 delivered all core scaffolding in a single implementation pass.**

## Executive Summary

This document outlines the complete migration plan for Claude Manager from its current Node.js/TypeScript backend to a Rust-based backend, packaged as a native desktop application using Tauri. This migration will provide:

- **Better Performance**: Rust's zero-cost abstractions and native code compilation
- **Lower Memory Footprint**: No V8 runtime overhead
- **Native Desktop Experience**: Tauri provides native window management, system tray, notifications
- **Single Binary Distribution**: Users install one application instead of managing Node.js + frontend separately
- **Enhanced Security**: Rust's memory safety guarantees and Tauri's security model

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Current Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    HTTP/WS    ┌─────────────────────────────┐ │
│  │   Frontend  │ ◄───────────► │    Node.js Backend          │ │
│  │  (Vite Dev) │               │    (Fastify + SQLite)       │ │
│  │  Port 8080  │               │    Port 3001                │ │
│  └─────────────┘               └─────────────────────────────┘ │
│                                         │                       │
│                                         ▼                       │
│                                ┌─────────────────────────────┐ │
│                                │  Claude Code CLI (spawned)  │ │
│                                └─────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Target Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                     Tauri Application                      │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │              WebView (Frontend)                      │  │ │
│  │  │         React + TypeScript + Tailwind               │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │                          │                                 │ │
│  │                    Tauri Commands (IPC)                    │ │
│  │                          │                                 │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │               Rust Backend Core                      │  │ │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │  │ │
│  │  │  │   Services  │ │   SQLite    │ │  WebSocket  │   │  │ │
│  │  │  │   (Axum)    │ │  (rusqlite) │ │  (tokio-ws) │   │  │ │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘   │  │ │
│  │  │                        │                             │  │ │
│  │  │  ┌─────────────────────────────────────────────┐   │  │ │
│  │  │  │     Process Manager (tokio::process)         │   │  │ │
│  │  │  └─────────────────────────────────────────────┘   │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                │                                │
│                                ▼                                │
│                       ┌─────────────────┐                       │
│                       │ Claude Code CLI │                       │
│                       └─────────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Project Setup & Foundation

### 1.1 Initialize Tauri Project

**Duration**: 1-2 days

**Tasks**:

1. Install Tauri CLI and prerequisites

   ```bash
   cargo install create-tauri-app
   cargo install tauri-cli
   ```

2. Initialize Tauri in existing project

   ```bash
   cd claude-manager
   cargo tauri init
   ```

3. Configure `tauri.conf.json`:

   ```json
   {
     "build": {
       "beforeDevCommand": "pnpm dev",
       "beforeBuildCommand": "pnpm build",
       "devPath": "http://localhost:8080",
       "distDir": "../dist"
     },
     "package": {
       "productName": "Claude Manager",
       "version": "1.0.0"
     },
     "tauri": {
       "allowlist": {
         "all": false,
         "shell": {
           "all": false,
           "open": true
         },
         "fs": {
           "all": true,
           "scope": ["$HOME/**", "$APP/**"]
         },
         "path": {
           "all": true
         },
         "process": {
           "all": true
         },
         "window": {
           "all": true
         }
       },
       "bundle": {
         "active": true,
         "identifier": "com.claude-manager.app",
         "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"]
       },
       "windows": [
         {
           "title": "Claude Manager",
           "width": 1400,
           "height": 900,
           "minWidth": 800,
           "minHeight": 600,
           "resizable": true,
           "fullscreen": false
         }
       ]
     }
   }
   ```

4. Create Rust workspace structure:
   ```
   claude-manager/
   ├── src-tauri/
   │   ├── Cargo.toml
   │   ├── src/
   │   │   ├── main.rs
   │   │   ├── lib.rs
   │   │   ├── commands/        # Tauri IPC commands
   │   │   ├── services/        # Business logic
   │   │   ├── db/              # Database layer
   │   │   ├── process/         # Process management
   │   │   ├── websocket/       # WebSocket server
   │   │   ├── types/           # Rust types
   │   │   └── error.rs         # Error handling
   │   ├── tauri.conf.json
   │   └── icons/
   ├── src/                     # Frontend (unchanged)
   └── ...
   ```

### 1.2 Rust Dependencies (Cargo.toml)

```toml
[package]
name = "claude-manager"
version = "1.0.0"
edition = "2021"
rust-version = "1.75"

[lib]
name = "claude_manager_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
# Tauri
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-shell = "2"
tauri-plugin-fs = "2"
tauri-plugin-process = "2"
tauri-plugin-notification = "2"
tauri-plugin-dialog = "2"

# Async Runtime
tokio = { version = "1", features = ["full"] }

# Web Framework (for WebSocket + optional HTTP API)
axum = { version = "0.7", features = ["ws", "macros"] }
tower = "0.4"
tower-http = { version = "0.5", features = ["cors", "trace"] }

# Database
rusqlite = { version = "0.32", features = ["bundled"] }
r2d2 = "0.8"
r2d2_sqlite = "0.25"

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Git Operations
git2 = "0.19"

# Process Management
portable-pty = "0.8"

# Utilities
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
thiserror = "1"
anyhow = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
once_cell = "1"
parking_lot = "0.12"
futures = "0.3"
async-trait = "0.1"

# Validation
validator = { version = "0.18", features = ["derive"] }

[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-single-instance = "2"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

---

## Phase 2: Core Types & Database Layer

### 2.1 Rust Type Definitions

**Duration**: 2-3 days

Create strongly-typed Rust equivalents for all TypeScript types.

**File: `src-tauri/src/types/mod.rs`**

```rust
pub mod agent;
pub mod workspace;
pub mod worktree;
pub mod message;
pub mod usage;
pub mod websocket;

pub use agent::*;
pub use workspace::*;
pub use worktree::*;
pub use message::*;
pub use usage::*;
pub use websocket::*;
```

**File: `src-tauri/src/types/agent.rs`**

```rust
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Running,
    Waiting,
    Error,
    Finished,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentMode {
    Auto,
    Plan,
    Regular,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    Read,
    Write,
    Execute,
}

/// Database row representation (snake_case)
#[derive(Debug, Clone)]
pub struct AgentRow {
    pub id: String,
    pub worktree_id: String,
    pub name: String,
    pub status: String,
    pub context_level: i32,
    pub mode: String,
    pub permissions: String,  // JSON array
    pub display_order: i32,
    pub pid: Option<i32>,
    pub session_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub stopped_at: Option<String>,
    pub deleted_at: Option<String>,
    pub parent_agent_id: Option<String>,
}

/// API representation (camelCase via serde)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub worktree_id: String,
    pub name: String,
    pub status: AgentStatus,
    pub context_level: i32,
    pub mode: AgentMode,
    pub permissions: Vec<Permission>,
    pub display_order: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stopped_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_agent_id: Option<String>,
}

impl From<AgentRow> for Agent {
    fn from(row: AgentRow) -> Self {
        Agent {
            id: row.id,
            worktree_id: row.worktree_id,
            name: row.name,
            status: serde_json::from_str(&format!("\"{}\"", row.status))
                .unwrap_or(AgentStatus::Finished),
            context_level: row.context_level,
            mode: serde_json::from_str(&format!("\"{}\"", row.mode))
                .unwrap_or(AgentMode::Regular),
            permissions: serde_json::from_str(&row.permissions).unwrap_or_default(),
            display_order: row.display_order,
            pid: row.pid,
            session_id: row.session_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            started_at: row.started_at,
            stopped_at: row.stopped_at,
            deleted_at: row.deleted_at,
            parent_agent_id: row.parent_agent_id,
        }
    }
}
```

**Additional type files to create:**

- `workspace.rs` - Workspace, WorkspaceRow, WorkspaceWithDetails
- `worktree.rs` - Worktree, WorktreeRow, SortMode, WorktreeWithAgents
- `message.rs` - Message, MessageRow, MessageRole
- `usage.rs` - UsageStats, UsageStatsRow, UsagePeriod
- `websocket.rs` - All WebSocket message types

### 2.2 Database Layer

**Duration**: 2-3 days

**File: `src-tauri/src/db/mod.rs`**

```rust
pub mod connection;
pub mod migrations;
pub mod repositories;

pub use connection::*;
pub use repositories::*;
```

**File: `src-tauri/src/db/connection.rs`**

```rust
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("Database error: {0}")]
    Rusqlite(#[from] rusqlite::Error),
    #[error("Pool error: {0}")]
    Pool(#[from] r2d2::Error),
    #[error("Migration error: {0}")]
    Migration(String),
}

pub type DbPool = Pool<SqliteConnectionManager>;
pub type DbResult<T> = Result<T, DbError>;

pub fn init_database(data_dir: PathBuf) -> DbResult<DbPool> {
    let db_path = data_dir.join("claude-manager.db");

    // Ensure directory exists
    std::fs::create_dir_all(&data_dir).ok();

    let manager = SqliteConnectionManager::file(&db_path)
        .with_init(|conn| {
            // Enable WAL mode and foreign keys
            conn.execute_batch(r#"
                PRAGMA journal_mode = WAL;
                PRAGMA foreign_keys = ON;
                PRAGMA cache_size = -64000;
                PRAGMA synchronous = NORMAL;
            "#)?;
            Ok(())
        });

    let pool = Pool::builder()
        .max_size(10)
        .build(manager)?;

    // Run migrations
    let conn = pool.get()?;
    super::migrations::run_migrations(&conn)?;

    Ok(pool)
}
```

**File: `src-tauri/src/db/migrations.rs`**

```rust
use rusqlite::Connection;
use super::DbResult;

pub fn run_migrations(conn: &Connection) -> DbResult<()> {
    // Create migrations table
    conn.execute(r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now')),
            checksum TEXT
        )
    "#, [])?;

    let migrations = vec![
        (1, "initial_schema", include_str!("migrations/001_initial_schema.sql")),
    ];

    for (version, name, sql) in migrations {
        let applied: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM schema_migrations WHERE version = ?",
            [version],
            |row| row.get(0)
        ).unwrap_or(false);

        if !applied {
            conn.execute_batch(sql)?;
            conn.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                rusqlite::params![version, name]
            )?;
            tracing::info!("Applied migration {}: {}", version, name);
        }
    }

    Ok(())
}
```

**File: `src-tauri/src/db/migrations/001_initial_schema.sql`**

```sql
-- Workspaces table
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
CREATE INDEX idx_workspaces_updated_at ON workspaces(updated_at DESC);

-- Worktrees table
CREATE TABLE worktrees (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    branch TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    sort_mode TEXT NOT NULL DEFAULT 'free' CHECK (sort_mode IN ('free', 'status', 'name')),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_main INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_worktrees_workspace_id ON worktrees(workspace_id);
CREATE INDEX idx_worktrees_path ON worktrees(path);
CREATE INDEX idx_worktrees_order ON worktrees(workspace_id, display_order);

-- Agents table
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    worktree_id TEXT NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'finished' CHECK (status IN ('running', 'waiting', 'error', 'finished')),
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
    parent_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX idx_agents_worktree_id ON agents(worktree_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_active ON agents(worktree_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_deleted ON agents(worktree_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_agents_order ON agents(worktree_id, display_order);

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    token_count INTEGER,
    tool_name TEXT,
    tool_input TEXT,
    tool_output TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_complete INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_messages_agent_id ON messages(agent_id);
CREATE INDEX idx_messages_agent_created ON messages(agent_id, created_at DESC);
CREATE INDEX idx_messages_agent_role ON messages(agent_id, role);

-- Usage stats table
CREATE TABLE usage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    model_usage TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (date, period)
);

CREATE INDEX idx_usage_stats_date ON usage_stats(date DESC);
CREATE INDEX idx_usage_stats_period_date ON usage_stats(period, date DESC);

-- Settings table
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value, type, description) VALUES
    ('theme', 'system', 'string', 'UI theme preference'),
    ('auto_save', 'true', 'boolean', 'Auto-save workspace state'),
    ('notifications', 'true', 'boolean', 'Enable desktop notifications'),
    ('default_mode', 'regular', 'string', 'Default agent mode'),
    ('confirm_delete', 'true', 'boolean', 'Confirm before deleting agents'),
    ('max_context_warning', '80', 'number', 'Context level warning threshold');

-- Agent sessions table
CREATE TABLE agent_sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    session_data TEXT NOT NULL,
    context_snapshot TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_agent_sessions_agent_id ON agent_sessions(agent_id);
```

### 2.3 Repository Pattern Implementation

**File: `src-tauri/src/db/repositories/mod.rs`**

```rust
pub mod agent_repository;
pub mod workspace_repository;
pub mod worktree_repository;
pub mod message_repository;
pub mod usage_repository;

pub use agent_repository::AgentRepository;
pub use workspace_repository::WorkspaceRepository;
pub use worktree_repository::WorktreeRepository;
pub use message_repository::MessageRepository;
pub use usage_repository::UsageRepository;
```

**File: `src-tauri/src/db/repositories/agent_repository.rs`**

```rust
use crate::db::{DbPool, DbResult};
use crate::types::{Agent, AgentRow, AgentStatus, AgentMode};
use rusqlite::params;

pub struct AgentRepository {
    pool: DbPool,
}

impl AgentRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn find_by_id(&self, id: &str) -> DbResult<Option<Agent>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(r#"
            SELECT id, worktree_id, name, status, context_level, mode, permissions,
                   display_order, pid, session_id, created_at, updated_at,
                   started_at, stopped_at, deleted_at, parent_agent_id
            FROM agents WHERE id = ?
        "#)?;

        let row = stmt.query_row([id], |row| {
            Ok(AgentRow {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                name: row.get(2)?,
                status: row.get(3)?,
                context_level: row.get(4)?,
                mode: row.get(5)?,
                permissions: row.get(6)?,
                display_order: row.get(7)?,
                pid: row.get(8)?,
                session_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                started_at: row.get(12)?,
                stopped_at: row.get(13)?,
                deleted_at: row.get(14)?,
                parent_agent_id: row.get(15)?,
            })
        }).optional()?;

        Ok(row.map(Agent::from))
    }

    pub fn find_by_worktree_id(&self, worktree_id: &str, include_deleted: bool) -> DbResult<Vec<Agent>> {
        let conn = self.pool.get()?;
        let sql = if include_deleted {
            r#"SELECT * FROM agents WHERE worktree_id = ? ORDER BY display_order"#
        } else {
            r#"SELECT * FROM agents WHERE worktree_id = ? AND deleted_at IS NULL ORDER BY display_order"#
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([worktree_id], |row| {
            Ok(AgentRow {
                id: row.get("id")?,
                worktree_id: row.get("worktree_id")?,
                name: row.get("name")?,
                status: row.get("status")?,
                context_level: row.get("context_level")?,
                mode: row.get("mode")?,
                permissions: row.get("permissions")?,
                display_order: row.get("display_order")?,
                pid: row.get("pid")?,
                session_id: row.get("session_id")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
                started_at: row.get("started_at")?,
                stopped_at: row.get("stopped_at")?,
                deleted_at: row.get("deleted_at")?,
                parent_agent_id: row.get("parent_agent_id")?,
            })
        })?;

        let agents: Vec<Agent> = rows
            .filter_map(|r| r.ok())
            .map(Agent::from)
            .collect();

        Ok(agents)
    }

    pub fn create(&self, agent: &Agent) -> DbResult<Agent> {
        let conn = self.pool.get()?;
        let permissions_json = serde_json::to_string(&agent.permissions).unwrap_or_default();

        conn.execute(r#"
            INSERT INTO agents (id, worktree_id, name, status, context_level, mode,
                               permissions, display_order, pid, session_id, parent_agent_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#, params![
            agent.id,
            agent.worktree_id,
            agent.name,
            serde_json::to_string(&agent.status).unwrap().trim_matches('"'),
            agent.context_level,
            serde_json::to_string(&agent.mode).unwrap().trim_matches('"'),
            permissions_json,
            agent.display_order,
            agent.pid,
            agent.session_id,
            agent.parent_agent_id,
        ])?;

        self.find_by_id(&agent.id)?.ok_or_else(|| {
            rusqlite::Error::QueryReturnedNoRows.into()
        })
    }

    pub fn update_status(&self, id: &str, status: AgentStatus, pid: Option<i32>) -> DbResult<()> {
        let conn = self.pool.get()?;
        let status_str = serde_json::to_string(&status).unwrap().trim_matches('"').to_string();

        conn.execute(r#"
            UPDATE agents
            SET status = ?, pid = ?, updated_at = datetime('now')
            WHERE id = ?
        "#, params![status_str, pid, id])?;

        Ok(())
    }

    pub fn soft_delete(&self, id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute(r#"
            UPDATE agents
            SET deleted_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
        "#, [id])?;
        Ok(())
    }

    pub fn hard_delete(&self, id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM agents WHERE id = ?", [id])?;
        Ok(())
    }

    pub fn restore(&self, id: &str) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute(r#"
            UPDATE agents
            SET deleted_at = NULL, updated_at = datetime('now')
            WHERE id = ?
        "#, [id])?;
        Ok(())
    }

    pub fn clear_running_pids(&self) -> DbResult<()> {
        let conn = self.pool.get()?;
        conn.execute(r#"
            UPDATE agents
            SET pid = NULL, status = 'finished', updated_at = datetime('now')
            WHERE pid IS NOT NULL
        "#, [])?;
        Ok(())
    }
}
```

---

## Phase 3: Service Layer

### 3.1 Service Architecture

**Duration**: 4-5 days

**File: `src-tauri/src/services/mod.rs`**

```rust
pub mod agent_service;
pub mod workspace_service;
pub mod worktree_service;
pub mod git_service;
pub mod process_service;
pub mod usage_service;

pub use agent_service::AgentService;
pub use workspace_service::WorkspaceService;
pub use worktree_service::WorktreeService;
pub use git_service::GitService;
pub use process_service::ProcessManager;
pub use usage_service::UsageService;
```

### 3.2 Process Manager (Critical Component)

**File: `src-tauri/src/services/process_service.rs`**

```rust
use crate::types::{Agent, AgentStatus, AgentMode, Permission};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use parking_lot::RwLock;
use tokio::sync::broadcast;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ProcessError {
    #[error("Agent {0} not found")]
    AgentNotFound(String),
    #[error("Agent {0} is already running")]
    AlreadyRunning(String),
    #[error("Failed to spawn process: {0}")]
    SpawnFailed(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub enum ProcessEvent {
    Output { agent_id: String, content: String, is_complete: bool },
    Status { agent_id: String, status: AgentStatus, reason: Option<String> },
    Context { agent_id: String, level: i32 },
    Error { agent_id: String, message: String },
    Exit { agent_id: String, code: Option<i32>, signal: Option<String> },
}

pub struct AgentProcess {
    pub pid: u32,
    child: Child,
    output_buffer: String,
}

pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<String, AgentProcess>>>,
    event_tx: broadcast::Sender<ProcessEvent>,
    claude_cli_path: String,
}

impl ProcessManager {
    pub fn new(claude_cli_path: String) -> Self {
        let (event_tx, _) = broadcast::channel(1000);
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
            claude_cli_path,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ProcessEvent> {
        self.event_tx.subscribe()
    }

    pub fn spawn_agent(
        &self,
        agent_id: &str,
        worktree_path: &str,
        mode: AgentMode,
        permissions: &[Permission],
        initial_prompt: Option<&str>,
        session_id: Option<&str>,
    ) -> Result<u32, ProcessError> {
        // Check if already running
        if self.processes.read().contains_key(agent_id) {
            return Err(ProcessError::AlreadyRunning(agent_id.to_string()));
        }

        // Build command arguments
        let mut args = vec!["--verbose".to_string()];

        // Mode-specific flags
        match mode {
            AgentMode::Auto => {
                args.push("--dangerously-skip-permissions".to_string());
            }
            AgentMode::Plan => {
                args.push("--plan".to_string());
            }
            AgentMode::Regular => {}
        }

        // Permission flags
        if permissions.contains(&Permission::Write) {
            args.push("--allowedTools".to_string());
            args.push("Write,Edit".to_string());
        }
        if permissions.contains(&Permission::Execute) {
            args.push("--allowedTools".to_string());
            args.push("Bash".to_string());
        }

        // Session resumption
        if let Some(sid) = session_id {
            args.push("--resume".to_string());
            args.push(sid.to_string());
        }

        // Initial prompt
        if let Some(prompt) = initial_prompt {
            args.push("--print".to_string());
            args.push(prompt.to_string());
        }

        // Spawn process
        let child = Command::new(&self.claude_cli_path)
            .args(&args)
            .current_dir(worktree_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("FORCE_COLOR", "0")
            .env("NO_COLOR", "1")
            .spawn()
            .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;

        let pid = child.id();

        let process = AgentProcess {
            pid,
            child,
            output_buffer: String::new(),
        };

        self.processes.write().insert(agent_id.to_string(), process);

        // Start output monitoring in background
        self.start_output_monitor(agent_id.to_string());

        // Emit running status
        let _ = self.event_tx.send(ProcessEvent::Status {
            agent_id: agent_id.to_string(),
            status: AgentStatus::Running,
            reason: None,
        });

        Ok(pid)
    }

    pub fn send_message(&self, agent_id: &str, content: &str) -> Result<(), ProcessError> {
        let mut processes = self.processes.write();
        let process = processes.get_mut(agent_id)
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;

        use std::io::Write;
        if let Some(stdin) = process.child.stdin.as_mut() {
            writeln!(stdin, "{}", content)?;
        }

        Ok(())
    }

    pub fn stop_agent(&self, agent_id: &str, force: bool) -> Result<(), ProcessError> {
        let mut processes = self.processes.write();
        let process = processes.get_mut(agent_id)
            .ok_or_else(|| ProcessError::AgentNotFound(agent_id.to_string()))?;

        if force {
            process.child.kill()?;
        } else {
            // Graceful termination
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                unsafe {
                    libc::kill(process.pid as i32, libc::SIGTERM);
                }
            }
            #[cfg(windows)]
            {
                process.child.kill()?;
            }
        }

        Ok(())
    }

    pub fn is_running(&self, agent_id: &str) -> bool {
        self.processes.read().contains_key(agent_id)
    }

    pub fn get_running_count(&self) -> usize {
        self.processes.read().len()
    }

    pub fn stop_all(&self) {
        let mut processes = self.processes.write();
        for (agent_id, mut process) in processes.drain() {
            let _ = process.child.kill();
            let _ = self.event_tx.send(ProcessEvent::Exit {
                agent_id,
                code: None,
                signal: Some("SIGKILL".to_string()),
            });
        }
    }

    fn start_output_monitor(&self, agent_id: String) {
        let processes = self.processes.clone();
        let event_tx = self.event_tx.clone();

        tokio::spawn(async move {
            // Monitor stdout/stderr in background
            // Parse context levels from stderr
            // Detect waiting/error states
            // Emit events appropriately
            // This is a simplified placeholder - full implementation needed

            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                let should_exit = {
                    let mut procs = processes.write();
                    if let Some(process) = procs.get_mut(&agent_id) {
                        match process.child.try_wait() {
                            Ok(Some(status)) => {
                                let _ = event_tx.send(ProcessEvent::Exit {
                                    agent_id: agent_id.clone(),
                                    code: status.code(),
                                    signal: None,
                                });
                                procs.remove(&agent_id);
                                true
                            }
                            Ok(None) => false,
                            Err(_) => true,
                        }
                    } else {
                        true
                    }
                };

                if should_exit {
                    break;
                }
            }
        });
    }
}
```

### 3.3 Git Service

**File: `src-tauri/src/services/git_service.rs`**

```rust
use git2::{Repository, BranchType, StatusOptions};
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum GitError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),
    #[error("Not a git repository: {0}")]
    NotARepo(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub is_main: bool,
}

#[derive(Debug, Clone)]
pub struct BranchInfo {
    pub local: Vec<String>,
    pub remote: Vec<String>,
    pub current: String,
}

#[derive(Debug, Clone)]
pub struct GitStatus {
    pub is_clean: bool,
    pub ahead: i32,
    pub behind: i32,
    pub modified: Vec<String>,
    pub staged: Vec<String>,
    pub untracked: Vec<String>,
}

pub struct GitService;

impl GitService {
    pub fn is_valid_repository(path: &str) -> bool {
        Repository::open(path).is_ok()
    }

    pub fn get_current_branch(path: &str) -> Result<String, GitError> {
        let repo = Repository::open(path)?;
        let head = repo.head()?;
        Ok(head.shorthand().unwrap_or("HEAD").to_string())
    }

    pub fn list_worktrees(path: &str) -> Result<Vec<WorktreeInfo>, GitError> {
        let repo = Repository::open(path)?;
        let mut worktrees = Vec::new();

        // Main worktree
        let main_path = repo.workdir()
            .ok_or_else(|| GitError::NotARepo("No workdir".to_string()))?
            .to_string_lossy()
            .to_string();

        worktrees.push(WorktreeInfo {
            path: main_path.trim_end_matches('/').to_string(),
            branch: Self::get_current_branch(path)?,
            is_main: true,
        });

        // Additional worktrees
        for name in repo.worktrees()?.iter().flatten() {
            if let Ok(wt) = repo.find_worktree(name) {
                if let Some(wt_path) = wt.path().to_str() {
                    let branch = Self::get_current_branch(wt_path).unwrap_or_default();
                    worktrees.push(WorktreeInfo {
                        path: wt_path.to_string(),
                        branch,
                        is_main: false,
                    });
                }
            }
        }

        Ok(worktrees)
    }

    pub fn add_worktree(
        repo_path: &str,
        worktree_path: &str,
        branch: &str,
        create_branch: bool,
    ) -> Result<WorktreeInfo, GitError> {
        let repo = Repository::open(repo_path)?;

        if create_branch {
            // Create branch from HEAD
            let head = repo.head()?.peel_to_commit()?;
            repo.branch(branch, &head, false)?;
        }

        // Find the branch reference
        let branch_ref = repo.find_branch(branch, BranchType::Local)?;
        let reference = branch_ref.into_reference();

        // Add worktree
        repo.worktree(
            Path::new(worktree_path).file_name().unwrap().to_str().unwrap(),
            Path::new(worktree_path),
            Some(&mut git2::WorktreeAddOptions::new().reference(Some(&reference)))
        )?;

        Ok(WorktreeInfo {
            path: worktree_path.to_string(),
            branch: branch.to_string(),
            is_main: false,
        })
    }

    pub fn remove_worktree(repo_path: &str, worktree_path: &str) -> Result<(), GitError> {
        let repo = Repository::open(repo_path)?;

        // Find worktree by path
        for name in repo.worktrees()?.iter().flatten() {
            if let Ok(wt) = repo.find_worktree(name) {
                if wt.path().to_str() == Some(worktree_path) {
                    wt.prune(Some(&mut git2::WorktreePruneOptions::new().working_tree(true)))?;
                    return Ok(());
                }
            }
        }

        Err(GitError::NotARepo(format!("Worktree not found: {}", worktree_path)))
    }

    pub fn checkout_branch(worktree_path: &str, branch: &str, create: bool) -> Result<(), GitError> {
        let repo = Repository::open(worktree_path)?;

        if create {
            let head = repo.head()?.peel_to_commit()?;
            repo.branch(branch, &head, false)?;
        }

        let obj = repo.revparse_single(&format!("refs/heads/{}", branch))?;
        repo.checkout_tree(&obj, None)?;
        repo.set_head(&format!("refs/heads/{}", branch))?;

        Ok(())
    }

    pub fn list_branches(path: &str) -> Result<BranchInfo, GitError> {
        let repo = Repository::open(path)?;
        let mut local = Vec::new();
        let mut remote = Vec::new();

        for branch in repo.branches(None)? {
            let (branch, branch_type) = branch?;
            if let Some(name) = branch.name()? {
                match branch_type {
                    BranchType::Local => local.push(name.to_string()),
                    BranchType::Remote => {
                        // Strip "origin/" prefix
                        let stripped = name.strip_prefix("origin/").unwrap_or(name);
                        remote.push(stripped.to_string());
                    }
                }
            }
        }

        let current = Self::get_current_branch(path)?;

        Ok(BranchInfo { local, remote, current })
    }

    pub fn get_status(path: &str) -> Result<GitStatus, GitError> {
        let repo = Repository::open(path)?;
        let mut opts = StatusOptions::new();
        opts.include_untracked(true);

        let statuses = repo.statuses(Some(&mut opts))?;

        let mut modified = Vec::new();
        let mut staged = Vec::new();
        let mut untracked = Vec::new();

        for entry in statuses.iter() {
            let status = entry.status();
            let path = entry.path().unwrap_or_default().to_string();

            if status.is_wt_modified() || status.is_wt_deleted() {
                modified.push(path.clone());
            }
            if status.is_index_new() || status.is_index_modified() || status.is_index_deleted() {
                staged.push(path.clone());
            }
            if status.is_wt_new() {
                untracked.push(path);
            }
        }

        let is_clean = modified.is_empty() && staged.is_empty() && untracked.is_empty();

        // TODO: Calculate ahead/behind from upstream
        Ok(GitStatus {
            is_clean,
            ahead: 0,
            behind: 0,
            modified,
            staged,
            untracked,
        })
    }
}
```

### 3.4 Agent Service

**File: `src-tauri/src/services/agent_service.rs`**

```rust
use crate::db::{DbPool, AgentRepository, MessageRepository, WorkspaceRepository};
use crate::services::{ProcessManager, ProcessEvent};
use crate::types::{Agent, AgentStatus, AgentMode, Permission, Message};
use std::sync::Arc;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum AgentError {
    #[error("Agent not found: {0}")]
    NotFound(String),
    #[error("Database error: {0}")]
    Database(String),
    #[error("Process error: {0}")]
    Process(String),
    #[error("Validation error: {0}")]
    Validation(String),
}

pub struct AgentService {
    agent_repo: AgentRepository,
    message_repo: MessageRepository,
    workspace_repo: WorkspaceRepository,
    process_manager: Arc<ProcessManager>,
}

impl AgentService {
    pub fn new(pool: DbPool, process_manager: Arc<ProcessManager>) -> Self {
        Self {
            agent_repo: AgentRepository::new(pool.clone()),
            message_repo: MessageRepository::new(pool.clone()),
            workspace_repo: WorkspaceRepository::new(pool),
            process_manager,
        }
    }

    pub fn create_agent(
        &self,
        worktree_id: &str,
        name: Option<String>,
        mode: AgentMode,
        permissions: Vec<Permission>,
    ) -> Result<Agent, AgentError> {
        let agent_name = name.unwrap_or_else(|| {
            format!("Agent {}", chrono::Utc::now().format("%H:%M"))
        });

        let agent = Agent {
            id: format!("ag_{}{}",
                chrono::Utc::now().timestamp_millis().to_string(),
                &Uuid::new_v4().to_string()[..8]
            ),
            worktree_id: worktree_id.to_string(),
            name: agent_name,
            status: AgentStatus::Finished,
            context_level: 0,
            mode,
            permissions,
            display_order: 0, // Will be set by repo
            pid: None,
            session_id: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            started_at: None,
            stopped_at: None,
            deleted_at: None,
            parent_agent_id: None,
        };

        self.agent_repo.create(&agent)
            .map_err(|e| AgentError::Database(e.to_string()))
    }

    pub fn get_agent(&self, id: &str) -> Result<Agent, AgentError> {
        self.agent_repo.find_by_id(id)
            .map_err(|e| AgentError::Database(e.to_string()))?
            .ok_or_else(|| AgentError::NotFound(id.to_string()))
    }

    pub fn list_agents(&self, worktree_id: &str, include_deleted: bool) -> Result<Vec<Agent>, AgentError> {
        self.agent_repo.find_by_worktree_id(worktree_id, include_deleted)
            .map_err(|e| AgentError::Database(e.to_string()))
    }

    pub fn start_agent(
        &self,
        id: &str,
        worktree_path: &str,
        initial_prompt: Option<&str>,
    ) -> Result<Agent, AgentError> {
        let agent = self.get_agent(id)?;

        let pid = self.process_manager.spawn_agent(
            id,
            worktree_path,
            agent.mode,
            &agent.permissions,
            initial_prompt,
            agent.session_id.as_deref(),
        ).map_err(|e| AgentError::Process(e.to_string()))?;

        self.agent_repo.update_status(id, AgentStatus::Running, Some(pid as i32))
            .map_err(|e| AgentError::Database(e.to_string()))?;

        self.get_agent(id)
    }

    pub fn stop_agent(&self, id: &str, force: bool) -> Result<Agent, AgentError> {
        self.process_manager.stop_agent(id, force)
            .map_err(|e| AgentError::Process(e.to_string()))?;

        self.agent_repo.update_status(id, AgentStatus::Finished, None)
            .map_err(|e| AgentError::Database(e.to_string()))?;

        self.get_agent(id)
    }

    pub fn send_message(&self, id: &str, content: &str) -> Result<Message, AgentError> {
        // Create message record
        let message = Message {
            id: format!("msg_{}{}",
                chrono::Utc::now().timestamp_millis(),
                &Uuid::new_v4().to_string()[..8]
            ),
            agent_id: id.to_string(),
            role: crate::types::MessageRole::User,
            content: content.to_string(),
            token_count: None,
            tool_name: None,
            tool_input: None,
            tool_output: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            is_complete: true,
        };

        self.message_repo.create(&message)
            .map_err(|e| AgentError::Database(e.to_string()))?;

        // Send to process
        self.process_manager.send_message(id, content)
            .map_err(|e| AgentError::Process(e.to_string()))?;

        Ok(message)
    }

    pub fn delete_agent(&self, id: &str, archive: bool) -> Result<(), AgentError> {
        // Stop if running
        if self.process_manager.is_running(id) {
            self.process_manager.stop_agent(id, true)
                .map_err(|e| AgentError::Process(e.to_string()))?;
        }

        if archive {
            self.agent_repo.soft_delete(id)
        } else {
            self.agent_repo.hard_delete(id)
        }.map_err(|e| AgentError::Database(e.to_string()))
    }

    pub fn get_messages(
        &self,
        agent_id: &str,
        limit: usize,
        before: Option<&str>,
    ) -> Result<(Vec<Message>, bool, Option<String>), AgentError> {
        self.message_repo.get_paginated(agent_id, limit, before)
            .map_err(|e| AgentError::Database(e.to_string()))
    }

    pub fn fork_agent(&self, id: &str, name: Option<String>) -> Result<Agent, AgentError> {
        let parent = self.get_agent(id)?;

        let forked = Agent {
            id: format!("ag_{}{}",
                chrono::Utc::now().timestamp_millis(),
                &Uuid::new_v4().to_string()[..8]
            ),
            name: name.unwrap_or_else(|| format!("{} (fork)", parent.name)),
            parent_agent_id: Some(parent.id.clone()),
            status: AgentStatus::Finished,
            pid: None,
            session_id: parent.session_id.clone(), // Copy session for resumption
            ..parent
        };

        self.agent_repo.create(&forked)
            .map_err(|e| AgentError::Database(e.to_string()))
    }
}
```

---

## Phase 4: WebSocket Server

### 4.1 WebSocket Implementation

**Duration**: 2-3 days

**File: `src-tauri/src/websocket/mod.rs`**

```rust
pub mod server;
pub mod client_manager;
pub mod message_handler;
pub mod event_broadcaster;

pub use server::WebSocketServer;
pub use client_manager::ClientManager;
```

**File: `src-tauri/src/websocket/server.rs`**

```rust
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use std::sync::Arc;
use tokio::sync::broadcast;
use futures::{SinkExt, StreamExt};

use super::client_manager::ClientManager;
use crate::services::ProcessEvent;

pub struct WebSocketServer {
    client_manager: Arc<ClientManager>,
    process_event_rx: broadcast::Receiver<ProcessEvent>,
}

impl WebSocketServer {
    pub fn new(process_event_rx: broadcast::Receiver<ProcessEvent>) -> Self {
        Self {
            client_manager: Arc::new(ClientManager::new()),
            process_event_rx,
        }
    }

    pub fn router(self: Arc<Self>) -> Router {
        Router::new()
            .route("/ws", get(ws_handler))
            .with_state(self)
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(server): State<Arc<WebSocketServer>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, server))
}

async fn handle_socket(socket: WebSocket, server: Arc<WebSocketServer>) {
    let (mut sender, mut receiver) = socket.split();
    let client_id = uuid::Uuid::new_v4().to_string();

    server.client_manager.add_client(&client_id);

    // Handle incoming messages
    let client_manager = server.client_manager.clone();
    let client_id_clone = client_id.clone();

    let recv_task = tokio::spawn(async move {
        while let Some(msg) = receiver.next().await {
            if let Ok(Message::Text(text)) = msg {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                    handle_client_message(&client_id_clone, &parsed, &client_manager).await;
                }
            }
        }
    });

    // Handle outgoing messages from process events
    // This is a simplified version - full implementation would pipe events to subscribed clients

    recv_task.await.ok();

    server.client_manager.remove_client(&client_id);
}

async fn handle_client_message(
    client_id: &str,
    message: &serde_json::Value,
    client_manager: &ClientManager,
) {
    let msg_type = message.get("type").and_then(|t| t.as_str()).unwrap_or("");

    match msg_type {
        "subscribe:agent" => {
            if let Some(agent_id) = message.get("payload").and_then(|p| p.get("agentId")).and_then(|a| a.as_str()) {
                client_manager.subscribe_to_agent(client_id, agent_id);
            }
        }
        "unsubscribe:agent" => {
            if let Some(agent_id) = message.get("payload").and_then(|p| p.get("agentId")).and_then(|a| a.as_str()) {
                client_manager.unsubscribe_from_agent(client_id, agent_id);
            }
        }
        "subscribe:workspace" => {
            if let Some(ws_id) = message.get("payload").and_then(|p| p.get("workspaceId")).and_then(|w| w.as_str()) {
                client_manager.subscribe_to_workspace(client_id, ws_id);
            }
        }
        "ping" => {
            client_manager.update_ping(client_id);
        }
        _ => {}
    }
}
```

**File: `src-tauri/src/websocket/client_manager.rs`**

```rust
use std::collections::{HashMap, HashSet};
use parking_lot::RwLock;
use chrono::{DateTime, Utc};

pub struct ConnectedClient {
    pub id: String,
    pub subscribed_agents: HashSet<String>,
    pub subscribed_workspaces: HashSet<String>,
    pub last_ping: DateTime<Utc>,
}

pub struct ClientManager {
    clients: RwLock<HashMap<String, ConnectedClient>>,
}

impl ClientManager {
    pub fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
        }
    }

    pub fn add_client(&self, client_id: &str) {
        let client = ConnectedClient {
            id: client_id.to_string(),
            subscribed_agents: HashSet::new(),
            subscribed_workspaces: HashSet::new(),
            last_ping: Utc::now(),
        };
        self.clients.write().insert(client_id.to_string(), client);
    }

    pub fn remove_client(&self, client_id: &str) {
        self.clients.write().remove(client_id);
    }

    pub fn subscribe_to_agent(&self, client_id: &str, agent_id: &str) {
        if let Some(client) = self.clients.write().get_mut(client_id) {
            client.subscribed_agents.insert(agent_id.to_string());
        }
    }

    pub fn unsubscribe_from_agent(&self, client_id: &str, agent_id: &str) {
        if let Some(client) = self.clients.write().get_mut(client_id) {
            client.subscribed_agents.remove(agent_id);
        }
    }

    pub fn subscribe_to_workspace(&self, client_id: &str, workspace_id: &str) {
        if let Some(client) = self.clients.write().get_mut(client_id) {
            client.subscribed_workspaces.insert(workspace_id.to_string());
        }
    }

    pub fn unsubscribe_from_workspace(&self, client_id: &str, workspace_id: &str) {
        if let Some(client) = self.clients.write().get_mut(client_id) {
            client.subscribed_workspaces.remove(workspace_id);
        }
    }

    pub fn get_clients_for_agent(&self, agent_id: &str) -> Vec<String> {
        self.clients.read()
            .iter()
            .filter(|(_, c)| c.subscribed_agents.contains(agent_id))
            .map(|(id, _)| id.clone())
            .collect()
    }

    pub fn get_clients_for_workspace(&self, workspace_id: &str) -> Vec<String> {
        self.clients.read()
            .iter()
            .filter(|(_, c)| c.subscribed_workspaces.contains(workspace_id))
            .map(|(id, _)| id.clone())
            .collect()
    }

    pub fn update_ping(&self, client_id: &str) {
        if let Some(client) = self.clients.write().get_mut(client_id) {
            client.last_ping = Utc::now();
        }
    }

    pub fn get_client_count(&self) -> usize {
        self.clients.read().len()
    }
}
```

---

## Phase 5: Tauri Commands (IPC)

### 5.1 Tauri Command Layer

**Duration**: 2-3 days

**File: `src-tauri/src/commands/mod.rs`**

```rust
pub mod workspace_commands;
pub mod worktree_commands;
pub mod agent_commands;
pub mod usage_commands;

pub use workspace_commands::*;
pub use worktree_commands::*;
pub use agent_commands::*;
pub use usage_commands::*;
```

**File: `src-tauri/src/commands/agent_commands.rs`**

```rust
use crate::services::AgentService;
use crate::types::{Agent, AgentMode, Permission, Message};
use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentInput {
    pub worktree_id: String,
    pub name: Option<String>,
    pub mode: Option<AgentMode>,
    pub permissions: Option<Vec<Permission>>,
    pub initial_prompt: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListResponse {
    pub agents: Vec<Agent>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageListResponse {
    pub messages: Vec<Message>,
    pub has_more: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResponse {
    pub message_id: String,
    pub status: String,
    pub running: bool,
}

#[tauri::command]
pub async fn list_agents(
    worktree_id: String,
    include_deleted: Option<bool>,
    agent_service: State<'_, Arc<AgentService>>,
) -> Result<AgentListResponse, String> {
    let agents = agent_service
        .list_agents(&worktree_id, include_deleted.unwrap_or(false))
        .map_err(|e| e.to_string())?;

    Ok(AgentListResponse { agents })
}

#[tauri::command]
pub async fn get_agent(
    id: String,
    agent_service: State<'_, Arc<AgentService>>,
) -> Result<Agent, String> {
    agent_service.get_agent(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_agent(
    input: CreateAgentInput,
    agent_service: State<'_, Arc<AgentService>>,
) -> Result<Agent, String> {
    agent_service.create_agent(
        &input.worktree_id,
        input.name,
        input.mode.unwrap_or(AgentMode::Regular),
        input.permissions.unwrap_or_else(|| vec![Permission::Read]),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_agent(
    id: String,
    worktree_path: String,
    initial_prompt: Option<String>,
    agent_service: State<'_, Arc<AgentService>>,
) -> Result<Agent, String> {
    agent_service.start_agent(
        &id,
        &worktree_path,
        initial_prompt.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_agent(
    id: String,
    force: Option<bool>,
    agent_service: State<'_, Arc<AgentService>>,
) -> Result<Agent, String> {
    agent_service.stop_agent(&id, force.unwrap_or(false))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_message_to_agent(
    id: String,
    input: SendMessageInput,
    agent_service: State<'_, Arc<AgentService>>,
) -> Result<SendMessageResponse, String> {
    let message = agent_service.send_message(&id, &input.content)
        .map_err(|e| e.to_string())?;

    Ok(SendMessageResponse {
        message_id: message.id,
        status: "sent".to_string(),
        running: true,
    })
}

#[tauri::command]
pub async fn delete_agent(
    id: String,
    archive: Option<bool>,
    agent_service: State<'_, Arc<AgentService>>,
) -> Result<(), String> {
    agent_service.delete_agent(&id, archive.unwrap_or(true))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_agent_messages(
    id: String,
    limit: Option<usize>,
    before: Option<String>,
    agent_service: State<'_, Arc<AgentService>>,
) -> Result<MessageListResponse, String> {
    let (messages, has_more, next_cursor) = agent_service
        .get_messages(&id, limit.unwrap_or(100), before.as_deref())
        .map_err(|e| e.to_string())?;

    Ok(MessageListResponse {
        messages,
        has_more,
        next_cursor,
    })
}

#[tauri::command]
pub async fn fork_agent(
    id: String,
    name: Option<String>,
    agent_service: State<'_, Arc<AgentService>>,
) -> Result<Agent, String> {
    agent_service.fork_agent(&id, name)
        .map_err(|e| e.to_string())
}
```

### 5.2 Main Application Entry

**File: `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod error;
mod services;
mod types;
mod websocket;

use std::sync::Arc;
use tauri::Manager;

use crate::db::init_database;
use crate::services::{AgentService, WorkspaceService, WorktreeService, ProcessManager, UsageService};
use crate::websocket::WebSocketServer;

fn main() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Get data directory
            let data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");

            // Initialize database
            let pool = init_database(data_dir)
                .expect("Failed to initialize database");

            // Clear any orphaned process PIDs from previous run
            let agent_repo = db::AgentRepository::new(pool.clone());
            agent_repo.clear_running_pids().ok();

            // Initialize process manager
            let claude_cli_path = std::env::var("CLAUDE_CLI_PATH")
                .unwrap_or_else(|_| "claude".to_string());
            let process_manager = Arc::new(ProcessManager::new(claude_cli_path));

            // Initialize services
            let agent_service = Arc::new(AgentService::new(pool.clone(), process_manager.clone()));
            let workspace_service = Arc::new(WorkspaceService::new(pool.clone()));
            let worktree_service = Arc::new(WorktreeService::new(pool.clone()));
            let usage_service = Arc::new(UsageService::new(pool.clone()));

            // Store in app state
            app.manage(agent_service);
            app.manage(workspace_service);
            app.manage(worktree_service);
            app.manage(usage_service);
            app.manage(process_manager.clone());

            // Start WebSocket server in background
            let ws_server = Arc::new(WebSocketServer::new(process_manager.subscribe()));
            let ws_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let router = ws_server.router();
                let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
                    .await
                    .expect("Failed to bind WebSocket server");

                tracing::info!("WebSocket server listening on ws://127.0.0.1:3001/ws");

                axum::serve(listener, router).await.ok();
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Workspace commands
            commands::list_workspaces,
            commands::get_workspace,
            commands::create_workspace,
            commands::delete_workspace,
            commands::refresh_workspace,
            // Worktree commands
            commands::list_worktrees,
            commands::get_worktree,
            commands::create_worktree,
            commands::update_worktree,
            commands::delete_worktree,
            commands::checkout_branch,
            commands::reorder_worktrees,
            commands::get_git_status,
            commands::list_branches,
            // Agent commands
            commands::list_agents,
            commands::get_agent,
            commands::create_agent,
            commands::update_agent,
            commands::delete_agent,
            commands::start_agent,
            commands::stop_agent,
            commands::send_message_to_agent,
            commands::get_agent_messages,
            commands::fork_agent,
            commands::restore_agent,
            commands::reorder_agents,
            // Usage commands
            commands::get_usage,
            commands::get_usage_history,
            commands::get_usage_today,
            commands::get_usage_limits,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Graceful shutdown: stop all agents
                if let Some(pm) = window.try_state::<Arc<ProcessManager>>() {
                    pm.stop_all();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}
```

---

## Phase 6: Frontend Integration

### 6.1 Update API Client for Tauri

**Duration**: 2-3 days

**File: `src/lib/api.ts` (Modified)**

```typescript
import { invoke } from '@tauri-apps/api/core'

// Check if running in Tauri
const isTauri = '__TAURI__' in window

// Fallback to HTTP for development without Tauri
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return invoke<T>(command, args)
  }
  // Fallback to HTTP API for non-Tauri development
  throw new Error('Tauri not available')
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new ApiError(
      error.error?.code || 'UNKNOWN_ERROR',
      error.error?.message || 'An error occurred',
      response.status,
      error.error?.details
    )
  }

  return response.json()
}

// Agent API - Uses Tauri commands when available
export const agents = {
  list: async (params?: { worktreeId?: string; status?: string; includeDeleted?: boolean }) => {
    if (isTauri) {
      return tauriInvoke<{ agents: Agent[] }>('list_agents', {
        worktreeId: params?.worktreeId,
        includeDeleted: params?.includeDeleted,
      })
    }
    const query = new URLSearchParams()
    if (params?.worktreeId) query.set('worktreeId', params.worktreeId)
    if (params?.status) query.set('status', params.status)
    if (params?.includeDeleted) query.set('includeDeleted', 'true')
    return request<{ agents: Agent[] }>('GET', `/agents?${query}`)
  },

  get: async (id: string) => {
    if (isTauri) {
      return tauriInvoke<Agent>('get_agent', { id })
    }
    return request<Agent>('GET', `/agents/${id}`)
  },

  create: async (data: CreateAgentInput) => {
    if (isTauri) {
      return tauriInvoke<Agent>('create_agent', { input: data })
    }
    return request<Agent>('POST', '/agents', data)
  },

  start: async (id: string, worktreePath: string, initialPrompt?: string) => {
    if (isTauri) {
      return tauriInvoke<Agent>('start_agent', { id, worktreePath, initialPrompt })
    }
    return request<Agent>('POST', `/agents/${id}/start`, { initialPrompt })
  },

  stop: async (id: string, force?: boolean) => {
    if (isTauri) {
      return tauriInvoke<Agent>('stop_agent', { id, force })
    }
    return request<Agent>('POST', `/agents/${id}/stop?force=${force || false}`)
  },

  sendMessage: async (id: string, content: string) => {
    if (isTauri) {
      return tauriInvoke<SendMessageResponse>('send_message_to_agent', {
        id,
        input: { content },
      })
    }
    return request<SendMessageResponse>('POST', `/agents/${id}/message`, { content })
  },

  getMessages: async (id: string, params?: { limit?: number; before?: string }) => {
    if (isTauri) {
      return tauriInvoke<MessageListResponse>('get_agent_messages', {
        id,
        limit: params?.limit,
        before: params?.before,
      })
    }
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.before) query.set('before', params.before)
    return request<MessageListResponse>('GET', `/agents/${id}/messages?${query}`)
  },

  delete: async (id: string, archive?: boolean) => {
    if (isTauri) {
      return tauriInvoke<void>('delete_agent', { id, archive })
    }
    return request<void>('DELETE', `/agents/${id}?archive=${archive ?? true}`)
  },

  fork: async (id: string, name?: string) => {
    if (isTauri) {
      return tauriInvoke<Agent>('fork_agent', { id, name })
    }
    return request<Agent>('POST', `/agents/${id}/fork`, { name })
  },
}

// Similar patterns for workspaces, worktrees, usage...
```

### 6.2 WebSocket Client Update

**File: `src/lib/websocket.ts` (Modified)**

```typescript
// WebSocket URL - same for both Tauri and browser
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'

// The WebSocket client remains largely the same since the
// Rust backend exposes the same WebSocket protocol
export class WebSocketClient {
  // ... existing implementation works with Rust backend
}
```

---

## Phase 7: Build & Distribution

### 7.1 Build Configuration

**Duration**: 1-2 days

**File: `src-tauri/tauri.conf.json` (Complete)**

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/schema.json",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devPath": "http://localhost:8080",
    "distDir": "../dist"
  },
  "package": {
    "productName": "Claude Manager",
    "version": "1.0.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true,
        "execute": false,
        "sidecar": false,
        "scope": []
      },
      "fs": {
        "all": true,
        "readFile": true,
        "writeFile": true,
        "readDir": true,
        "copyFile": true,
        "createDir": true,
        "removeDir": true,
        "removeFile": true,
        "renameFile": true,
        "exists": true,
        "scope": ["$HOME/**", "$APP/**", "$RESOURCE/**"]
      },
      "path": {
        "all": true
      },
      "process": {
        "all": true,
        "relaunch": true,
        "relaunchDangerousAllowSymlinkMacos": false
      },
      "window": {
        "all": true,
        "create": true,
        "center": true,
        "requestUserAttention": true,
        "setResizable": true,
        "setTitle": true,
        "maximize": true,
        "unmaximize": true,
        "minimize": true,
        "unminimize": true,
        "show": true,
        "hide": true,
        "close": true,
        "setDecorations": true,
        "setAlwaysOnTop": true,
        "setSize": true,
        "setMinSize": true,
        "setMaxSize": true,
        "setPosition": true,
        "setFullscreen": true,
        "setFocus": true,
        "setIcon": true,
        "setSkipTaskbar": true,
        "setCursorGrab": true,
        "setCursorVisible": true,
        "setCursorIcon": true,
        "setCursorPosition": true,
        "startDragging": true,
        "print": true
      },
      "dialog": {
        "all": true,
        "ask": true,
        "confirm": true,
        "message": true,
        "open": true,
        "save": true
      },
      "notification": {
        "all": true
      }
    },
    "bundle": {
      "active": true,
      "category": "DeveloperTool",
      "copyright": "Copyright 2025",
      "deb": {
        "depends": []
      },
      "externalBin": [],
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "identifier": "com.claude-manager.app",
      "longDescription": "A GUI application for managing Claude Code CLI agents across git worktrees",
      "macOS": {
        "entitlements": null,
        "exceptionDomain": "",
        "frameworks": [],
        "providerShortName": null,
        "signingIdentity": null
      },
      "resources": [],
      "shortDescription": "Claude Code Agent Manager",
      "targets": "all",
      "windows": {
        "certificateThumbprint": null,
        "digestAlgorithm": "sha256",
        "timestampUrl": ""
      }
    },
    "security": {
      "csp": "default-src 'self'; connect-src 'self' ws://localhost:3001 http://localhost:3001; style-src 'self' 'unsafe-inline'"
    },
    "updater": {
      "active": false
    },
    "windows": [
      {
        "title": "Claude Manager",
        "width": 1400,
        "height": 900,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false,
        "focus": true,
        "transparent": false,
        "maximized": false,
        "visible": true,
        "decorations": true,
        "alwaysOnTop": false,
        "fileDropEnabled": true
      }
    ]
  }
}
```

### 7.2 Build Scripts

**File: `package.json` (Updated scripts)**

```json
{
  "scripts": {
    "dev": "vite",
    "dev:tauri": "tauri dev",
    "build": "vite build",
    "build:tauri": "tauri build",
    "build:tauri:debug": "tauri build --debug",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

### 7.3 CI/CD Pipeline

**File: `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'
            args: '--target aarch64-apple-darwin'
          - platform: 'macos-latest'
            args: '--target x86_64-apple-darwin'
          - platform: 'ubuntu-22.04'
            args: ''
          - platform: 'windows-latest'
            args: ''

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies (Ubuntu)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install Rust stable
        uses: dtolnay/rust-action@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install frontend dependencies
        run: pnpm install

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: v__VERSION__
          releaseName: 'Claude Manager v__VERSION__'
          releaseBody: 'See the assets to download this version and install.'
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

---

## Phase 8: Migration & Testing

### 8.1 Migration Steps

**Duration**: 2-3 days

1. **Database Migration**
   - Export existing SQLite data from Node.js backend
   - Import into Rust backend's SQLite (same schema)
   - Verify data integrity

2. **API Contract Testing**
   - Run existing frontend against Rust backend
   - Verify all endpoints return identical response shapes
   - Test WebSocket message formats

3. **Feature Parity Checklist**
   - [ ] Workspace CRUD operations
   - [ ] Worktree management (git operations)
   - [ ] Agent lifecycle (create, start, stop, delete)
   - [ ] Message sending and retrieval
   - [ ] Real-time output streaming via WebSocket
   - [ ] Status updates (running/waiting/error/finished)
   - [ ] Context level tracking
   - [ ] Usage statistics
   - [ ] Agent forking
   - [ ] Agent restoration

### 8.2 Testing Strategy

**Rust Unit Tests**

```rust
// src-tauri/src/services/agent_service.rs
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn setup_test_db() -> DbPool {
        let dir = tempdir().unwrap();
        init_database(dir.path().to_path_buf()).unwrap()
    }

    #[test]
    fn test_create_agent() {
        let pool = setup_test_db();
        let pm = Arc::new(ProcessManager::new("claude".to_string()));
        let service = AgentService::new(pool, pm);

        let agent = service.create_agent(
            "wt_test",
            Some("Test Agent".to_string()),
            AgentMode::Regular,
            vec![Permission::Read],
        ).unwrap();

        assert_eq!(agent.name, "Test Agent");
        assert_eq!(agent.status, AgentStatus::Finished);
    }
}
```

**Integration Tests**

```rust
// src-tauri/tests/integration_tests.rs
#[tokio::test]
async fn test_full_agent_lifecycle() {
    // Setup test environment
    // Create agent
    // Start agent
    // Send message
    // Verify output streaming
    // Stop agent
    // Verify status updates
}
```

---

## Phase 9: Comprehensive Testing Strategy

This phase details the complete testing approach for the Rust backend, ensuring feature parity with the existing 175+ Node.js tests.

### 9.1 Rust Testing Stack

| Crate            | Purpose                        | Version |
| ---------------- | ------------------------------ | ------- |
| `tokio-test`     | Async test utilities           | 0.4     |
| `mockall`        | Trait mocking                  | 0.12    |
| `tempfile`       | Temporary test directories     | 3.x     |
| `wiremock`       | HTTP mocking for external APIs | 0.6     |
| `fake`           | Test data generation           | 2.x     |
| `test-log`       | Logging in tests               | 0.2     |
| `rstest`         | Parameterized testing          | 0.18    |
| `assert_matches` | Pattern matching assertions    | 1.5     |
| `criterion`      | Benchmarking                   | 0.5     |

**Add to `Cargo.toml`:**

```toml
[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
tempfile = "3"
wiremock = "0.6"
fake = { version = "2", features = ["derive", "chrono"] }
test-log = { version = "0.2", features = ["trace"] }
rstest = "0.18"
assert_matches = "1.5"
criterion = { version = "0.5", features = ["async_tokio"] }
serial_test = "3"

[[bench]]
name = "agent_benchmarks"
harness = false
```

### 9.2 Test Directory Structure

```
src-tauri/
├── src/
│   ├── db/
│   │   ├── repositories/
│   │   │   └── agent_repository.rs      # Contains #[cfg(test)] mod tests
│   │   └── mod.rs
│   ├── services/
│   │   ├── agent_service.rs             # Contains #[cfg(test)] mod tests
│   │   ├── process_service.rs
│   │   └── mod.rs
│   └── ...
├── tests/                                # Integration tests
│   ├── common/
│   │   ├── mod.rs                        # Shared test utilities
│   │   ├── fixtures.rs                   # Test data factories
│   │   └── mocks.rs                      # Mock implementations
│   ├── api/
│   │   ├── agent_commands_test.rs
│   │   ├── workspace_commands_test.rs
│   │   └── worktree_commands_test.rs
│   ├── websocket/
│   │   └── streaming_test.rs
│   ├── database/
│   │   └── migrations_test.rs
│   └── e2e/
│       ├── agent_lifecycle_test.rs
│       └── full_workflow_test.rs
└── benches/
    └── agent_benchmarks.rs
```

### 9.3 Coverage Requirements

| Category          | Minimum | Target | Critical Paths |
| ----------------- | ------- | ------ | -------------- |
| Unit Tests        | 80%     | 90%    | 95%+           |
| Integration Tests | 70%     | 80%    | 90%+           |
| Overall           | 75%     | 85%    | -              |

**Critical Paths (Must Have 95%+ Coverage):**

1. Agent spawning and lifecycle management
2. Message send/receive flow
3. Git worktree operations
4. Database migrations
5. WebSocket connection handling
6. Error handling and recovery
7. Process manager (spawn, stop, signal handling)

### 9.4 Test Setup Infrastructure

**File: `tests/common/mod.rs`**

```rust
use rusqlite::Connection;
use std::sync::Arc;
use tempfile::{tempdir, TempDir};
use tokio::sync::RwLock;

use claude_manager_lib::db::{init_database, DbPool};
use claude_manager_lib::services::ProcessManager;

pub mod fixtures;
pub mod mocks;

/// Test context that holds all resources needed for testing
pub struct TestContext {
    pub pool: DbPool,
    pub process_manager: Arc<ProcessManager>,
    pub temp_dir: TempDir,
    pub workspace_id: String,
    pub worktree_id: String,
}

impl TestContext {
    /// Create a new test context with fresh database
    pub fn new() -> Self {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let pool = init_database(temp_dir.path().to_path_buf())
            .expect("Failed to init test database");

        let process_manager = Arc::new(ProcessManager::new("echo".to_string())); // Mock CLI

        // Create default workspace and worktree
        let conn = pool.get().expect("Failed to get connection");
        conn.execute(
            "INSERT INTO workspaces (id, name, path) VALUES (?1, ?2, ?3)",
            ["ws_test", "Test Workspace", temp_dir.path().to_str().unwrap()],
        ).expect("Failed to create test workspace");

        conn.execute(
            "INSERT INTO worktrees (id, workspace_id, name, branch, path) VALUES (?1, ?2, ?3, ?4, ?5)",
            ["wt_test", "ws_test", "main", "main", temp_dir.path().to_str().unwrap()],
        ).expect("Failed to create test worktree");

        Self {
            pool,
            process_manager,
            temp_dir,
            workspace_id: "ws_test".to_string(),
            worktree_id: "wt_test".to_string(),
        }
    }

    /// Clear all data from tables (for test isolation)
    pub fn clear_tables(&self) {
        let conn = self.pool.get().expect("Failed to get connection");
        conn.execute_batch(r#"
            DELETE FROM messages;
            DELETE FROM agent_sessions;
            DELETE FROM agents;
            DELETE FROM worktrees;
            DELETE FROM workspaces;
        "#).expect("Failed to clear tables");
    }

    /// Re-insert default workspace/worktree after clearing
    pub fn reset(&self) {
        self.clear_tables();
        let conn = self.pool.get().expect("Failed to get connection");
        conn.execute(
            "INSERT INTO workspaces (id, name, path) VALUES (?1, ?2, ?3)",
            ["ws_test", "Test Workspace", self.temp_dir.path().to_str().unwrap()],
        ).expect("Failed to create test workspace");

        conn.execute(
            "INSERT INTO worktrees (id, workspace_id, name, branch, path) VALUES (?1, ?2, ?3, ?4, ?5)",
            ["wt_test", "ws_test", "main", "main", self.temp_dir.path().to_str().unwrap()],
        ).expect("Failed to create test worktree");
    }
}

/// Initialize test logging (call once per test module)
pub fn init_test_logging() {
    let _ = tracing_subscriber::fmt()
        .with_test_writer()
        .with_max_level(tracing::Level::DEBUG)
        .try_init();
}
```

**File: `tests/common/fixtures.rs`**

```rust
use chrono::Utc;
use fake::{Fake, Faker};
use uuid::Uuid;

use claude_manager_lib::types::{
    Agent, AgentMode, AgentStatus, Permission, Message, MessageRole,
    Workspace, Worktree, SortMode,
};

/// Factory for creating test agents
pub struct AgentFactory;

impl AgentFactory {
    pub fn create() -> AgentBuilder {
        AgentBuilder::default()
    }

    pub fn running() -> AgentBuilder {
        AgentBuilder::default()
            .status(AgentStatus::Running)
            .pid(Some(12345))
    }

    pub fn waiting() -> AgentBuilder {
        AgentBuilder::default()
            .status(AgentStatus::Waiting)
    }

    pub fn with_context(level: i32) -> AgentBuilder {
        AgentBuilder::default()
            .context_level(level)
    }
}

#[derive(Default)]
pub struct AgentBuilder {
    id: Option<String>,
    worktree_id: Option<String>,
    name: Option<String>,
    status: Option<AgentStatus>,
    context_level: Option<i32>,
    mode: Option<AgentMode>,
    permissions: Option<Vec<Permission>>,
    pid: Option<i32>,
}

impl AgentBuilder {
    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    pub fn worktree_id(mut self, id: impl Into<String>) -> Self {
        self.worktree_id = Some(id.into());
        self
    }

    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    pub fn status(mut self, status: AgentStatus) -> Self {
        self.status = Some(status);
        self
    }

    pub fn context_level(mut self, level: i32) -> Self {
        self.context_level = Some(level);
        self
    }

    pub fn mode(mut self, mode: AgentMode) -> Self {
        self.mode = Some(mode);
        self
    }

    pub fn permissions(mut self, perms: Vec<Permission>) -> Self {
        self.permissions = Some(perms);
        self
    }

    pub fn pid(mut self, pid: Option<i32>) -> Self {
        self.pid = pid;
        self
    }

    pub fn build(self) -> Agent {
        let now = Utc::now().to_rfc3339();
        Agent {
            id: self.id.unwrap_or_else(|| format!("ag_{}", &Uuid::new_v4().to_string()[..8])),
            worktree_id: self.worktree_id.unwrap_or_else(|| "wt_test".to_string()),
            name: self.name.unwrap_or_else(|| format!("Agent {}", Faker.fake::<u16>())),
            status: self.status.unwrap_or(AgentStatus::Finished),
            context_level: self.context_level.unwrap_or(0),
            mode: self.mode.unwrap_or(AgentMode::Regular),
            permissions: self.permissions.unwrap_or_else(|| vec![Permission::Read]),
            display_order: 0,
            pid: self.pid,
            session_id: None,
            created_at: now.clone(),
            updated_at: now,
            started_at: None,
            stopped_at: None,
            deleted_at: None,
            parent_agent_id: None,
        }
    }
}

/// Factory for creating test messages
pub struct MessageFactory;

impl MessageFactory {
    pub fn user_message(agent_id: &str, content: &str) -> Message {
        Message {
            id: format!("msg_{}", &Uuid::new_v4().to_string()[..8]),
            agent_id: agent_id.to_string(),
            role: MessageRole::User,
            content: content.to_string(),
            token_count: None,
            tool_name: None,
            tool_input: None,
            tool_output: None,
            created_at: Utc::now().to_rfc3339(),
            is_complete: true,
        }
    }

    pub fn assistant_message(agent_id: &str, content: &str) -> Message {
        Message {
            id: format!("msg_{}", &Uuid::new_v4().to_string()[..8]),
            agent_id: agent_id.to_string(),
            role: MessageRole::Assistant,
            content: content.to_string(),
            token_count: Some(content.len() as i32 / 4), // Rough estimate
            tool_name: None,
            tool_input: None,
            tool_output: None,
            created_at: Utc::now().to_rfc3339(),
            is_complete: true,
        }
    }

    pub fn tool_message(agent_id: &str, tool_name: &str, output: &str) -> Message {
        Message {
            id: format!("msg_{}", &Uuid::new_v4().to_string()[..8]),
            agent_id: agent_id.to_string(),
            role: MessageRole::Tool,
            content: output.to_string(),
            token_count: None,
            tool_name: Some(tool_name.to_string()),
            tool_input: Some("{}".to_string()),
            tool_output: Some(output.to_string()),
            created_at: Utc::now().to_rfc3339(),
            is_complete: true,
        }
    }
}
```

**File: `tests/common/mocks.rs`**

```rust
use async_trait::async_trait;
use mockall::mock;
use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;
use tokio::sync::broadcast;

use claude_manager_lib::services::{ProcessError, ProcessEvent};
use claude_manager_lib::types::{AgentMode, Permission, AgentStatus};

/// Mock process manager for testing without spawning real processes
pub struct MockProcessManager {
    running: Arc<RwLock<HashMap<String, u32>>>,
    event_tx: broadcast::Sender<ProcessEvent>,
}

impl MockProcessManager {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(100);
        Self {
            running: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ProcessEvent> {
        self.event_tx.subscribe()
    }

    pub fn spawn_agent(
        &self,
        agent_id: &str,
        _worktree_path: &str,
        _mode: AgentMode,
        _permissions: &[Permission],
        _initial_prompt: Option<&str>,
        _session_id: Option<&str>,
    ) -> Result<u32, ProcessError> {
        let pid = rand::random::<u32>() % 65536;
        self.running.write().insert(agent_id.to_string(), pid);

        let _ = self.event_tx.send(ProcessEvent::Status {
            agent_id: agent_id.to_string(),
            status: AgentStatus::Running,
            reason: None,
        });

        Ok(pid)
    }

    pub fn stop_agent(&self, agent_id: &str, _force: bool) -> Result<(), ProcessError> {
        self.running.write().remove(agent_id);

        let _ = self.event_tx.send(ProcessEvent::Exit {
            agent_id: agent_id.to_string(),
            code: Some(0),
            signal: None,
        });

        Ok(())
    }

    pub fn is_running(&self, agent_id: &str) -> bool {
        self.running.read().contains_key(agent_id)
    }

    pub fn send_message(&self, agent_id: &str, content: &str) -> Result<(), ProcessError> {
        if !self.is_running(agent_id) {
            return Err(ProcessError::AgentNotFound(agent_id.to_string()));
        }

        // Simulate immediate echo response
        let _ = self.event_tx.send(ProcessEvent::Output {
            agent_id: agent_id.to_string(),
            content: format!("Received: {}", content),
            is_complete: false,
        });

        Ok(())
    }

    /// Simulate agent output for testing
    pub fn simulate_output(&self, agent_id: &str, content: &str) {
        let _ = self.event_tx.send(ProcessEvent::Output {
            agent_id: agent_id.to_string(),
            content: content.to_string(),
            is_complete: false,
        });
    }

    /// Simulate status change for testing
    pub fn simulate_status(&self, agent_id: &str, status: AgentStatus) {
        let _ = self.event_tx.send(ProcessEvent::Status {
            agent_id: agent_id.to_string(),
            status,
            reason: None,
        });
    }

    /// Simulate context level update
    pub fn simulate_context_update(&self, agent_id: &str, level: i32) {
        let _ = self.event_tx.send(ProcessEvent::Context {
            agent_id: agent_id.to_string(),
            level,
        });
    }
}

/// Mock Git repository for testing without real git operations
pub struct MockGitRepo {
    pub path: String,
    pub branches: Vec<String>,
    pub current_branch: String,
    pub worktrees: Vec<(String, String)>, // (path, branch)
}

impl MockGitRepo {
    pub fn new(path: &str) -> Self {
        Self {
            path: path.to_string(),
            branches: vec!["main".to_string()],
            current_branch: "main".to_string(),
            worktrees: vec![(path.to_string(), "main".to_string())],
        }
    }

    pub fn with_branches(mut self, branches: Vec<&str>) -> Self {
        self.branches = branches.into_iter().map(|s| s.to_string()).collect();
        self
    }

    pub fn is_valid(&self) -> bool {
        true
    }

    pub fn get_current_branch(&self) -> String {
        self.current_branch.clone()
    }

    pub fn list_worktrees(&self) -> Vec<(String, String, bool)> {
        self.worktrees
            .iter()
            .enumerate()
            .map(|(i, (path, branch))| (path.clone(), branch.clone(), i == 0))
            .collect()
    }
}
```

### 9.5 Unit Tests

**File: `src-tauri/src/db/repositories/agent_repository.rs` (test module)**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use crate::db::init_database;

    fn setup() -> (DbPool, String) {
        let dir = tempdir().unwrap();
        let pool = init_database(dir.path().to_path_buf()).unwrap();

        // Create test worktree
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, name, path) VALUES ('ws_test', 'Test', '/tmp/test')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO worktrees (id, workspace_id, name, branch, path) VALUES ('wt_test', 'ws_test', 'main', 'main', '/tmp/test')",
            [],
        ).unwrap();

        (pool, dir.path().to_string_lossy().to_string())
    }

    mod create {
        use super::*;

        #[test]
        fn creates_agent_with_generated_id() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let agent = Agent {
                id: "".to_string(), // Will be overwritten
                worktree_id: "wt_test".to_string(),
                name: "Test Agent".to_string(),
                status: AgentStatus::Finished,
                context_level: 0,
                mode: AgentMode::Regular,
                permissions: vec![Permission::Read],
                display_order: 0,
                pid: None,
                session_id: None,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                started_at: None,
                stopped_at: None,
                deleted_at: None,
                parent_agent_id: None,
            };

            let created = repo.create(&agent).unwrap();
            assert!(created.id.starts_with("ag_"));
            assert_eq!(created.name, "Test Agent");
        }

        #[test]
        fn auto_increments_display_order() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let agent1 = repo.create(&Agent {
                id: "".to_string(),
                worktree_id: "wt_test".to_string(),
                name: "Agent 1".to_string(),
                status: AgentStatus::Finished,
                ..Default::default()
            }).unwrap();

            let agent2 = repo.create(&Agent {
                id: "".to_string(),
                worktree_id: "wt_test".to_string(),
                name: "Agent 2".to_string(),
                status: AgentStatus::Finished,
                ..Default::default()
            }).unwrap();

            assert_eq!(agent1.display_order, 0);
            assert_eq!(agent2.display_order, 1);
        }
    }

    mod find_by_id {
        use super::*;

        #[test]
        fn returns_none_for_nonexistent() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let result = repo.find_by_id("ag_nonexistent").unwrap();
            assert!(result.is_none());
        }

        #[test]
        fn returns_agent_by_id() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let created = repo.create(&Agent {
                id: "".to_string(),
                worktree_id: "wt_test".to_string(),
                name: "Find Me".to_string(),
                status: AgentStatus::Finished,
                ..Default::default()
            }).unwrap();

            let found = repo.find_by_id(&created.id).unwrap().unwrap();
            assert_eq!(found.name, "Find Me");
        }
    }

    mod find_by_worktree_id {
        use super::*;

        #[test]
        fn returns_empty_for_no_agents() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let agents = repo.find_by_worktree_id("wt_test", false).unwrap();
            assert!(agents.is_empty());
        }

        #[test]
        fn excludes_soft_deleted_by_default() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let agent = repo.create(&Agent {
                id: "".to_string(),
                worktree_id: "wt_test".to_string(),
                name: "To Delete".to_string(),
                status: AgentStatus::Finished,
                ..Default::default()
            }).unwrap();

            repo.soft_delete(&agent.id).unwrap();

            let agents = repo.find_by_worktree_id("wt_test", false).unwrap();
            assert!(agents.is_empty());
        }

        #[test]
        fn includes_soft_deleted_when_requested() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let agent = repo.create(&Agent {
                id: "".to_string(),
                worktree_id: "wt_test".to_string(),
                name: "Deleted".to_string(),
                status: AgentStatus::Finished,
                ..Default::default()
            }).unwrap();

            repo.soft_delete(&agent.id).unwrap();

            let agents = repo.find_by_worktree_id("wt_test", true).unwrap();
            assert_eq!(agents.len(), 1);
            assert!(agents[0].deleted_at.is_some());
        }

        #[test]
        fn returns_ordered_by_display_order() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            for name in &["C", "A", "B"] {
                repo.create(&Agent {
                    id: "".to_string(),
                    worktree_id: "wt_test".to_string(),
                    name: name.to_string(),
                    status: AgentStatus::Finished,
                    ..Default::default()
                }).unwrap();
            }

            let agents = repo.find_by_worktree_id("wt_test", false).unwrap();
            assert_eq!(agents[0].name, "C"); // First created
            assert_eq!(agents[1].name, "A");
            assert_eq!(agents[2].name, "B");
        }
    }

    mod update_status {
        use super::*;

        #[test]
        fn updates_status_and_pid() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let agent = repo.create(&Agent {
                id: "".to_string(),
                worktree_id: "wt_test".to_string(),
                name: "Test".to_string(),
                status: AgentStatus::Finished,
                ..Default::default()
            }).unwrap();

            repo.update_status(&agent.id, AgentStatus::Running, Some(12345)).unwrap();

            let updated = repo.find_by_id(&agent.id).unwrap().unwrap();
            assert_eq!(updated.status, AgentStatus::Running);
            assert_eq!(updated.pid, Some(12345));
        }
    }

    mod soft_delete {
        use super::*;

        #[test]
        fn sets_deleted_at_timestamp() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let agent = repo.create(&Agent {
                id: "".to_string(),
                worktree_id: "wt_test".to_string(),
                name: "Test".to_string(),
                status: AgentStatus::Running,
                pid: Some(12345),
                ..Default::default()
            }).unwrap();

            repo.soft_delete(&agent.id).unwrap();

            let deleted = repo.find_by_id(&agent.id).unwrap().unwrap();
            assert!(deleted.deleted_at.is_some());
            assert_eq!(deleted.status, AgentStatus::Finished);
            assert!(deleted.pid.is_none());
        }
    }

    mod reorder {
        use super::*;

        #[test]
        fn updates_display_order_based_on_array_position() {
            let (pool, _) = setup();
            let repo = AgentRepository::new(pool);

            let a1 = repo.create(&Agent {
                worktree_id: "wt_test".to_string(),
                name: "A".to_string(),
                ..Default::default()
            }).unwrap();
            let a2 = repo.create(&Agent {
                worktree_id: "wt_test".to_string(),
                name: "B".to_string(),
                ..Default::default()
            }).unwrap();
            let a3 = repo.create(&Agent {
                worktree_id: "wt_test".to_string(),
                name: "C".to_string(),
                ..Default::default()
            }).unwrap();

            // Reorder: C, A, B
            repo.reorder("wt_test", &[a3.id.clone(), a1.id.clone(), a2.id.clone()]).unwrap();

            let agents = repo.find_by_worktree_id("wt_test", false).unwrap();
            assert_eq!(agents[0].name, "C");
            assert_eq!(agents[1].name, "A");
            assert_eq!(agents[2].name, "B");
        }
    }
}
```

**File: `src-tauri/src/services/agent_service.rs` (test module)**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::common::{TestContext, fixtures::AgentFactory};
    use std::sync::Arc;

    fn setup() -> (AgentService, TestContext) {
        let ctx = TestContext::new();
        let service = AgentService::new(ctx.pool.clone(), ctx.process_manager.clone());
        (service, ctx)
    }

    mod create_agent {
        use super::*;

        #[test]
        fn creates_with_defaults() {
            let (service, ctx) = setup();

            let agent = service.create_agent(
                &ctx.worktree_id,
                Some("Test Agent".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            ).unwrap();

            assert!(agent.id.starts_with("ag_"));
            assert_eq!(agent.name, "Test Agent");
            assert_eq!(agent.status, AgentStatus::Finished);
            assert_eq!(agent.context_level, 0);
        }

        #[test]
        fn auto_generates_name_when_not_provided() {
            let (service, ctx) = setup();

            let agent = service.create_agent(
                &ctx.worktree_id,
                None,
                AgentMode::Regular,
                vec![Permission::Read],
            ).unwrap();

            assert!(agent.name.starts_with("Agent "));
        }

        #[test]
        fn fails_for_invalid_worktree() {
            let (service, _) = setup();

            let result = service.create_agent(
                "wt_nonexistent",
                Some("Test".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            );

            assert!(matches!(result, Err(AgentError::NotFound(_))));
        }
    }

    mod start_agent {
        use super::*;

        #[tokio::test]
        async fn starts_agent_and_updates_status() {
            let (service, ctx) = setup();

            let agent = service.create_agent(
                &ctx.worktree_id,
                Some("Test".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            ).unwrap();

            let started = service.start_agent(
                &agent.id,
                ctx.temp_dir.path().to_str().unwrap(),
                None,
            ).unwrap();

            assert_eq!(started.status, AgentStatus::Running);
            assert!(started.pid.is_some());
        }

        #[tokio::test]
        async fn fails_for_already_running() {
            let (service, ctx) = setup();

            let agent = service.create_agent(
                &ctx.worktree_id,
                Some("Test".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            ).unwrap();

            service.start_agent(
                &agent.id,
                ctx.temp_dir.path().to_str().unwrap(),
                None,
            ).unwrap();

            let result = service.start_agent(
                &agent.id,
                ctx.temp_dir.path().to_str().unwrap(),
                None,
            );

            assert!(matches!(result, Err(AgentError::Process(_))));
        }
    }

    mod stop_agent {
        use super::*;

        #[tokio::test]
        async fn stops_running_agent() {
            let (service, ctx) = setup();

            let agent = service.create_agent(
                &ctx.worktree_id,
                Some("Test".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            ).unwrap();

            service.start_agent(
                &agent.id,
                ctx.temp_dir.path().to_str().unwrap(),
                None,
            ).unwrap();

            let stopped = service.stop_agent(&agent.id, false).unwrap();

            assert_eq!(stopped.status, AgentStatus::Finished);
            assert!(stopped.pid.is_none());
        }
    }

    mod fork_agent {
        use super::*;

        #[test]
        fn creates_copy_with_same_settings() {
            let (service, ctx) = setup();

            let original = service.create_agent(
                &ctx.worktree_id,
                Some("Original".to_string()),
                AgentMode::Auto,
                vec![Permission::Read, Permission::Write],
            ).unwrap();

            let forked = service.fork_agent(&original.id, None).unwrap();

            assert_ne!(forked.id, original.id);
            assert_eq!(forked.name, "Original (fork)");
            assert_eq!(forked.mode, AgentMode::Auto);
            assert_eq!(forked.permissions, vec![Permission::Read, Permission::Write]);
            assert_eq!(forked.parent_agent_id, Some(original.id));
        }

        #[test]
        fn allows_custom_name() {
            let (service, ctx) = setup();

            let original = service.create_agent(
                &ctx.worktree_id,
                Some("Original".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            ).unwrap();

            let forked = service.fork_agent(&original.id, Some("Custom Fork".to_string())).unwrap();

            assert_eq!(forked.name, "Custom Fork");
        }
    }

    mod delete_agent {
        use super::*;

        #[test]
        fn soft_deletes_by_default() {
            let (service, ctx) = setup();

            let agent = service.create_agent(
                &ctx.worktree_id,
                Some("Test".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            ).unwrap();

            service.delete_agent(&agent.id, true).unwrap();

            // Should still be retrievable
            let found = service.get_agent(&agent.id).unwrap();
            assert!(found.deleted_at.is_some());
        }

        #[test]
        fn hard_deletes_when_archive_false() {
            let (service, ctx) = setup();

            let agent = service.create_agent(
                &ctx.worktree_id,
                Some("Test".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            ).unwrap();

            service.delete_agent(&agent.id, false).unwrap();

            let result = service.get_agent(&agent.id);
            assert!(matches!(result, Err(AgentError::NotFound(_))));
        }

        #[tokio::test]
        async fn stops_running_agent_before_delete() {
            let (service, ctx) = setup();

            let agent = service.create_agent(
                &ctx.worktree_id,
                Some("Test".to_string()),
                AgentMode::Regular,
                vec![Permission::Read],
            ).unwrap();

            service.start_agent(
                &agent.id,
                ctx.temp_dir.path().to_str().unwrap(),
                None,
            ).unwrap();

            service.delete_agent(&agent.id, true).unwrap();

            assert!(!ctx.process_manager.is_running(&agent.id));
        }
    }
}
```

### 9.6 Integration Tests

**File: `tests/api/agent_commands_test.rs`**

```rust
use serial_test::serial;
use tauri::test::{mock_builder, MockRuntime};
use claude_manager_lib::commands::*;

mod common;
use common::{TestContext, fixtures::AgentFactory};

fn setup_app() -> tauri::App<MockRuntime> {
    mock_builder()
        .invoke_handler(tauri::generate_handler![
            list_agents,
            get_agent,
            create_agent,
            start_agent,
            stop_agent,
            delete_agent,
            send_message_to_agent,
            get_agent_messages,
            fork_agent,
        ])
        .build()
        .unwrap()
}

#[tokio::test]
#[serial]
async fn test_create_agent_command() {
    let ctx = TestContext::new();
    let app = setup_app();

    let input = CreateAgentInput {
        worktree_id: ctx.worktree_id.clone(),
        name: Some("Test Agent".to_string()),
        mode: Some(AgentMode::Regular),
        permissions: Some(vec![Permission::Read]),
        initial_prompt: None,
    };

    let result: Agent = tauri::test::invoke_command(&app, "create_agent", input).await.unwrap();

    assert!(result.id.starts_with("ag_"));
    assert_eq!(result.name, "Test Agent");
}

#[tokio::test]
#[serial]
async fn test_list_agents_command() {
    let ctx = TestContext::new();
    let app = setup_app();

    // Create some agents first
    for name in ["Agent 1", "Agent 2", "Agent 3"] {
        let input = CreateAgentInput {
            worktree_id: ctx.worktree_id.clone(),
            name: Some(name.to_string()),
            mode: None,
            permissions: None,
            initial_prompt: None,
        };
        let _: Agent = tauri::test::invoke_command(&app, "create_agent", input).await.unwrap();
    }

    let result: AgentListResponse = tauri::test::invoke_command(
        &app,
        "list_agents",
        serde_json::json!({
            "worktreeId": ctx.worktree_id,
            "includeDeleted": false
        }),
    ).await.unwrap();

    assert_eq!(result.agents.len(), 3);
}

#[tokio::test]
#[serial]
async fn test_agent_lifecycle_command() {
    let ctx = TestContext::new();
    let app = setup_app();

    // Create
    let input = CreateAgentInput {
        worktree_id: ctx.worktree_id.clone(),
        name: Some("Lifecycle Test".to_string()),
        mode: Some(AgentMode::Regular),
        permissions: Some(vec![Permission::Read]),
        initial_prompt: None,
    };
    let created: Agent = tauri::test::invoke_command(&app, "create_agent", input).await.unwrap();
    assert_eq!(created.status, AgentStatus::Finished);

    // Start
    let started: Agent = tauri::test::invoke_command(
        &app,
        "start_agent",
        serde_json::json!({
            "id": created.id,
            "worktreePath": ctx.temp_dir.path().to_str().unwrap(),
        }),
    ).await.unwrap();
    assert_eq!(started.status, AgentStatus::Running);

    // Stop
    let stopped: Agent = tauri::test::invoke_command(
        &app,
        "stop_agent",
        serde_json::json!({
            "id": created.id,
            "force": false,
        }),
    ).await.unwrap();
    assert_eq!(stopped.status, AgentStatus::Finished);

    // Delete
    let _: () = tauri::test::invoke_command(
        &app,
        "delete_agent",
        serde_json::json!({
            "id": created.id,
            "archive": true,
        }),
    ).await.unwrap();

    // Verify deleted
    let list: AgentListResponse = tauri::test::invoke_command(
        &app,
        "list_agents",
        serde_json::json!({
            "worktreeId": ctx.worktree_id,
            "includeDeleted": false,
        }),
    ).await.unwrap();
    assert!(list.agents.is_empty());
}
```

**File: `tests/websocket/streaming_test.rs`**

```rust
use axum::Router;
use tokio::net::TcpListener;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures::{SinkExt, StreamExt};
use std::time::Duration;

mod common;
use common::TestContext;

async fn spawn_test_server() -> String {
    let ctx = TestContext::new();
    let ws_server = Arc::new(WebSocketServer::new(ctx.process_manager.subscribe()));
    let router = ws_server.router();

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, router).await.ok();
    });

    format!("ws://127.0.0.1:{}/ws", addr.port())
}

#[tokio::test]
async fn test_websocket_ping_pong() {
    let url = spawn_test_server().await;
    let (mut ws, _) = connect_async(&url).await.unwrap();

    // Send ping
    ws.send(Message::Text(r#"{"type":"ping"}"#.to_string())).await.unwrap();

    // Receive pong
    let msg = tokio::time::timeout(Duration::from_secs(5), ws.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();

    let response: serde_json::Value = serde_json::from_str(&msg.to_string()).unwrap();
    assert_eq!(response["type"], "pong");
    assert!(response["timestamp"].is_string());
}

#[tokio::test]
async fn test_websocket_agent_subscription() {
    let ctx = TestContext::new();
    let url = spawn_test_server().await;
    let (mut ws, _) = connect_async(&url).await.unwrap();

    // Subscribe to agent
    ws.send(Message::Text(r#"{"type":"subscribe:agent","payload":{"agentId":"ag_test123"}}"#.to_string()))
        .await
        .unwrap();

    // Simulate agent output
    ctx.process_manager.simulate_output("ag_test123", "Hello from agent");

    // Should receive output event
    let msg = tokio::time::timeout(Duration::from_secs(5), ws.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();

    let response: serde_json::Value = serde_json::from_str(&msg.to_string()).unwrap();
    assert_eq!(response["type"], "agent:output");
    assert_eq!(response["payload"]["content"], "Hello from agent");
}

#[tokio::test]
async fn test_websocket_status_updates() {
    let ctx = TestContext::new();
    let url = spawn_test_server().await;
    let (mut ws, _) = connect_async(&url).await.unwrap();

    // Subscribe
    ws.send(Message::Text(r#"{"type":"subscribe:agent","payload":{"agentId":"ag_status"}}"#.to_string()))
        .await
        .unwrap();

    // Simulate status change
    ctx.process_manager.simulate_status("ag_status", AgentStatus::Waiting);

    let msg = tokio::time::timeout(Duration::from_secs(5), ws.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();

    let response: serde_json::Value = serde_json::from_str(&msg.to_string()).unwrap();
    assert_eq!(response["type"], "agent:status");
    assert_eq!(response["payload"]["status"], "waiting");
}

#[tokio::test]
async fn test_websocket_context_updates() {
    let ctx = TestContext::new();
    let url = spawn_test_server().await;
    let (mut ws, _) = connect_async(&url).await.unwrap();

    // Subscribe
    ws.send(Message::Text(r#"{"type":"subscribe:agent","payload":{"agentId":"ag_context"}}"#.to_string()))
        .await
        .unwrap();

    // Simulate context update
    ctx.process_manager.simulate_context_update("ag_context", 75);

    let msg = tokio::time::timeout(Duration::from_secs(5), ws.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();

    let response: serde_json::Value = serde_json::from_str(&msg.to_string()).unwrap();
    assert_eq!(response["type"], "agent:context");
    assert_eq!(response["payload"]["level"], 75);
}
```

**File: `tests/database/migrations_test.rs`**

```rust
use tempfile::tempdir;
use rusqlite::Connection;
use claude_manager_lib::db::{init_database, migrations::run_migrations};

#[test]
fn test_migrations_run_idempotently() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    // Run migrations twice
    {
        let conn = Connection::open(&db_path).unwrap();
        run_migrations(&conn).unwrap();
    }
    {
        let conn = Connection::open(&db_path).unwrap();
        run_migrations(&conn).unwrap(); // Should not fail
    }

    // Verify schema
    let conn = Connection::open(&db_path).unwrap();
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert!(tables.contains(&"agents".to_string()));
    assert!(tables.contains(&"workspaces".to_string()));
    assert!(tables.contains(&"worktrees".to_string()));
    assert!(tables.contains(&"messages".to_string()));
    assert!(tables.contains(&"schema_migrations".to_string()));
}

#[test]
fn test_foreign_keys_enabled() {
    let dir = tempdir().unwrap();
    let pool = init_database(dir.path().to_path_buf()).unwrap();
    let conn = pool.get().unwrap();

    let fk_enabled: i32 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .unwrap();

    assert_eq!(fk_enabled, 1);
}

#[test]
fn test_wal_mode_enabled() {
    let dir = tempdir().unwrap();
    let pool = init_database(dir.path().to_path_buf()).unwrap();
    let conn = pool.get().unwrap();

    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .unwrap();

    assert_eq!(journal_mode.to_lowercase(), "wal");
}

#[test]
fn test_cascade_delete_agents_on_worktree_delete() {
    let dir = tempdir().unwrap();
    let pool = init_database(dir.path().to_path_buf()).unwrap();
    let conn = pool.get().unwrap();

    // Create workspace, worktree, and agents
    conn.execute(
        "INSERT INTO workspaces (id, name, path) VALUES ('ws1', 'Test', '/tmp/test')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO worktrees (id, workspace_id, name, branch, path) VALUES ('wt1', 'ws1', 'main', 'main', '/tmp/test')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO agents (id, worktree_id, name, status, mode, permissions) VALUES ('ag1', 'wt1', 'Agent', 'finished', 'regular', '[\"read\"]')",
        [],
    ).unwrap();

    // Delete worktree
    conn.execute("DELETE FROM worktrees WHERE id = 'wt1'", []).unwrap();

    // Agent should be cascade deleted
    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM agents WHERE id = 'ag1'", [], |row| row.get(0))
        .unwrap();

    assert_eq!(count, 0);
}
```

### 9.7 End-to-End Tests

**File: `tests/e2e/agent_lifecycle_test.rs`**

```rust
//! End-to-end tests that test the full application stack
//! These tests require a real Claude CLI or mock CLI to be available

use std::process::Command;
use std::time::Duration;
use tokio::time::sleep;

mod common;
use common::TestContext;

/// Skip E2E tests if Claude CLI is not available
fn skip_if_no_cli() -> bool {
    Command::new("claude")
        .arg("--version")
        .output()
        .is_err()
}

#[tokio::test]
#[ignore = "Requires Claude CLI"]
async fn test_full_agent_lifecycle() {
    if skip_if_no_cli() {
        eprintln!("Skipping: Claude CLI not available");
        return;
    }

    let ctx = TestContext::new();

    // Create agent
    let agent = ctx.agent_service.create_agent(
        &ctx.worktree_id,
        Some("E2E Test Agent".to_string()),
        AgentMode::Regular,
        vec![Permission::Read],
    ).unwrap();

    // Start agent
    let started = ctx.agent_service.start_agent(
        &agent.id,
        ctx.temp_dir.path().to_str().unwrap(),
        Some("echo 'Hello from test'"),
    ).unwrap();
    assert_eq!(started.status, AgentStatus::Running);

    // Wait for processing
    sleep(Duration::from_secs(2)).await;

    // Check for output
    let (messages, _, _) = ctx.agent_service.get_messages(&agent.id, 10, None).unwrap();
    assert!(!messages.is_empty());

    // Stop agent
    let stopped = ctx.agent_service.stop_agent(&agent.id, false).unwrap();
    assert_eq!(stopped.status, AgentStatus::Finished);
}

#[tokio::test]
async fn test_concurrent_agents() {
    let ctx = TestContext::new();

    // Create multiple agents
    let mut agents = Vec::new();
    for i in 0..5 {
        let agent = ctx.agent_service.create_agent(
            &ctx.worktree_id,
            Some(format!("Concurrent Agent {}", i)),
            AgentMode::Regular,
            vec![Permission::Read],
        ).unwrap();
        agents.push(agent);
    }

    // Start all agents concurrently
    let handles: Vec<_> = agents.iter().map(|agent| {
        let agent_id = agent.id.clone();
        let path = ctx.temp_dir.path().to_str().unwrap().to_string();
        let service = ctx.agent_service.clone();

        tokio::spawn(async move {
            service.start_agent(&agent_id, &path, None)
        })
    }).collect();

    // Wait for all to start
    for handle in handles {
        handle.await.unwrap().unwrap();
    }

    // Verify all running
    assert_eq!(ctx.process_manager.get_running_count(), 5);

    // Stop all
    for agent in &agents {
        ctx.agent_service.stop_agent(&agent.id, false).unwrap();
    }

    assert_eq!(ctx.process_manager.get_running_count(), 0);
}

#[tokio::test]
async fn test_agent_recovery_after_crash() {
    let ctx = TestContext::new();

    // Create and start agent
    let agent = ctx.agent_service.create_agent(
        &ctx.worktree_id,
        Some("Recovery Test".to_string()),
        AgentMode::Regular,
        vec![Permission::Read],
    ).unwrap();

    ctx.agent_service.start_agent(
        &agent.id,
        ctx.temp_dir.path().to_str().unwrap(),
        None,
    ).unwrap();

    // Simulate crash by force stopping
    ctx.agent_service.stop_agent(&agent.id, true).unwrap();

    // Verify agent is marked as finished
    let recovered = ctx.agent_service.get_agent(&agent.id).unwrap();
    assert_eq!(recovered.status, AgentStatus::Finished);
    assert!(recovered.pid.is_none());

    // Should be able to restart
    let restarted = ctx.agent_service.start_agent(
        &agent.id,
        ctx.temp_dir.path().to_str().unwrap(),
        None,
    ).unwrap();
    assert_eq!(restarted.status, AgentStatus::Running);
}
```

### 9.8 Benchmarks

**File: `benches/agent_benchmarks.rs`**

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use tempfile::tempdir;

use claude_manager_lib::db::{init_database, AgentRepository};
use claude_manager_lib::types::{Agent, AgentMode, AgentStatus, Permission};

fn setup_benchmark_db() -> (AgentRepository, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    let pool = init_database(dir.path().to_path_buf()).unwrap();

    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO workspaces (id, name, path) VALUES ('ws_bench', 'Bench', '/tmp/bench')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO worktrees (id, workspace_id, name, branch, path) VALUES ('wt_bench', 'ws_bench', 'main', 'main', '/tmp/bench')",
        [],
    ).unwrap();

    (AgentRepository::new(pool), dir)
}

fn create_test_agent() -> Agent {
    Agent {
        id: String::new(),
        worktree_id: "wt_bench".to_string(),
        name: "Benchmark Agent".to_string(),
        status: AgentStatus::Finished,
        context_level: 0,
        mode: AgentMode::Regular,
        permissions: vec![Permission::Read],
        display_order: 0,
        pid: None,
        session_id: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        started_at: None,
        stopped_at: None,
        deleted_at: None,
        parent_agent_id: None,
    }
}

fn benchmark_agent_creation(c: &mut Criterion) {
    let (repo, _dir) = setup_benchmark_db();

    c.bench_function("create_agent", |b| {
        b.iter(|| {
            repo.create(black_box(&create_test_agent())).unwrap()
        })
    });
}

fn benchmark_agent_lookup(c: &mut Criterion) {
    let (repo, _dir) = setup_benchmark_db();

    // Pre-create agents
    let mut agent_ids = Vec::new();
    for _ in 0..100 {
        let agent = repo.create(&create_test_agent()).unwrap();
        agent_ids.push(agent.id);
    }

    c.bench_function("find_agent_by_id", |b| {
        let mut idx = 0;
        b.iter(|| {
            let id = &agent_ids[idx % agent_ids.len()];
            idx += 1;
            repo.find_by_id(black_box(id)).unwrap()
        })
    });
}

fn benchmark_list_agents(c: &mut Criterion) {
    let mut group = c.benchmark_group("list_agents");

    for count in [10, 50, 100, 500].iter() {
        let (repo, _dir) = setup_benchmark_db();

        // Pre-create agents
        for _ in 0..*count {
            repo.create(&create_test_agent()).unwrap();
        }

        group.bench_with_input(
            BenchmarkId::from_parameter(count),
            count,
            |b, _| {
                b.iter(|| {
                    repo.find_by_worktree_id(black_box("wt_bench"), false).unwrap()
                })
            },
        );
    }

    group.finish();
}

fn benchmark_agent_reorder(c: &mut Criterion) {
    let (repo, _dir) = setup_benchmark_db();

    // Pre-create agents
    let mut agent_ids = Vec::new();
    for _ in 0..50 {
        let agent = repo.create(&create_test_agent()).unwrap();
        agent_ids.push(agent.id);
    }

    c.bench_function("reorder_50_agents", |b| {
        b.iter(|| {
            // Reverse order
            let reversed: Vec<_> = agent_ids.iter().rev().cloned().collect();
            repo.reorder(black_box("wt_bench"), black_box(&reversed)).unwrap()
        })
    });
}

criterion_group!(
    benches,
    benchmark_agent_creation,
    benchmark_agent_lookup,
    benchmark_list_agents,
    benchmark_agent_reorder,
);

criterion_main!(benches);
```

### 9.9 Running Tests

**Commands:**

```bash
# Run all unit tests
cargo test --lib

# Run all tests including integration
cargo test --all

# Run specific test module
cargo test services::agent_service::tests

# Run with logging output
RUST_LOG=debug cargo test -- --nocapture

# Run only integration tests
cargo test --test '*'

# Run benchmarks
cargo bench

# Generate coverage report (requires cargo-llvm-cov)
cargo llvm-cov --html

# Run tests in parallel with specific thread count
cargo test -- --test-threads=4

# Run ignored E2E tests (requires CLI)
cargo test -- --ignored
```

### 9.10 CI Test Configuration

**File: `.github/workflows/test.yml`**

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        rust: [stable]

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install Linux dependencies
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev

      - name: Run unit tests
        working-directory: src-tauri
        run: cargo test --lib --verbose

      - name: Run integration tests
        working-directory: src-tauri
        run: cargo test --test '*' --verbose

  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable
        with:
          components: llvm-tools-preview

      - name: Install cargo-llvm-cov
        uses: taiki-e/install-action@cargo-llvm-cov

      - name: Install Linux dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev

      - name: Generate coverage report
        working-directory: src-tauri
        run: cargo llvm-cov --all-features --lcov --output-path lcov.info

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: src-tauri/lcov.info
          fail_ci_if_error: true

  benchmarks:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install Linux dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev

      - name: Run benchmarks
        working-directory: src-tauri
        run: cargo bench -- --output-format bencher | tee benchmark-results.txt

      - name: Store benchmark results
        uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: 'cargo'
          output-file-path: src-tauri/benchmark-results.txt
          github-token: ${{ secrets.GITHUB_TOKEN }}
          auto-push: true
```

### 9.11 Test Migration Checklist

Port the existing 175+ Node.js tests to Rust:

| Node.js Test Category        | Rust Equivalent                                     | Status |
| ---------------------------- | --------------------------------------------------- | ------ |
| **Repository Tests**         |                                                     |        |
| agent.repository.test.ts     | `src/db/repositories/agent_repository.rs#tests`     | ⬜     |
| message.repository.test.ts   | `src/db/repositories/message_repository.rs#tests`   | ⬜     |
| worktree.repository.test.ts  | `src/db/repositories/worktree_repository.rs#tests`  | ⬜     |
| workspace.repository.test.ts | `src/db/repositories/workspace_repository.rs#tests` | ⬜     |
| **Service Tests**            |                                                     |        |
| agent.service.test.ts        | `src/services/agent_service.rs#tests`               | ⬜     |
| git.service.test.ts          | `src/services/git_service.rs#tests`                 | ⬜     |
| process.service.test.ts      | `src/services/process_service.rs#tests`             | ⬜     |
| workspace.service.test.ts    | `src/services/workspace_service.rs#tests`           | ⬜     |
| **API Integration Tests**    |                                                     |        |
| agents.test.ts               | `tests/api/agent_commands_test.rs`                  | ⬜     |
| worktrees.test.ts            | `tests/api/worktree_commands_test.rs`               | ⬜     |
| workspaces.test.ts           | `tests/api/workspace_commands_test.rs`              | ⬜     |
| **WebSocket Tests**          |                                                     |        |
| agent-streaming.test.ts      | `tests/websocket/streaming_test.rs`                 | ⬜     |
| **Database Tests**           |                                                     |        |
| migrations.test.ts           | `tests/database/migrations_test.rs`                 | ⬜     |
| **E2E Tests**                |                                                     |        |
| agent-lifecycle.spec.ts      | `tests/e2e/agent_lifecycle_test.rs`                 | ⬜     |
| workspace.spec.ts            | `tests/e2e/workspace_test.rs`                       | ⬜     |
| worktree-management.spec.ts  | `tests/e2e/worktree_test.rs`                        | ⬜     |

**Acceptance Criteria:**

- [ ] All unit tests pass on Linux, macOS, and Windows
- [ ] Integration tests pass with mock process manager
- [ ] Coverage meets minimum thresholds (80% unit, 70% integration)
- [ ] Critical paths have 95%+ coverage
- [ ] Benchmarks establish performance baseline
- [ ] E2E tests pass with mock CLI
- [ ] CI pipeline passes on all platforms

---

## Summary: Migration Timeline

| Phase | Description                 | Duration | Dependencies        |
| ----- | --------------------------- | -------- | ------------------- |
| 1     | Project Setup & Foundation  | 1-2 days | None                |
| 2     | Core Types & Database Layer | 2-3 days | Phase 1             |
| 3     | Service Layer               | 4-5 days | Phase 2             |
| 4     | WebSocket Server            | 2-3 days | Phase 3             |
| 5     | Tauri Commands (IPC)        | 2-3 days | Phase 3, 4          |
| 6     | Frontend Integration        | 2-3 days | Phase 5             |
| 7     | Build & Distribution        | 1-2 days | Phase 6             |
| 8     | Data Migration              | 1-2 days | Phase 7             |
| 9     | Comprehensive Testing       | 4-6 days | Phase 3+ (parallel) |

**Total Estimated Duration: 18-28 days**

**Note:** Phase 9 (Testing) can run in parallel with Phases 4-7. Unit tests should be written alongside each component (TDD approach recommended). Integration and E2E tests are written after the components are functional.

---

## Risk Mitigation

1. **Process Management Complexity**
   - Rust's `tokio::process` provides similar capabilities to Node.js `child_process`
   - Consider using `portable-pty` for full PTY support if needed
   - Test extensively on all target platforms

2. **WebSocket Compatibility**
   - Maintain exact same message format as current Node.js implementation
   - Frontend changes should be minimal (just IPC additions)

3. **Git Operations**
   - `git2` library is well-maintained and feature-complete
   - Falls back to shelling out to `git` CLI if needed

4. **Cross-Platform Build**
   - Tauri handles most cross-platform concerns
   - Test on Windows, macOS (Intel + ARM), and Linux

5. **Data Migration**
   - SQLite schema is identical - migration is straightforward
   - Create backup before migration
   - Implement rollback capability

---

## Post-Migration Benefits

1. **Single Application**
   - No separate backend process to manage
   - Single binary distribution

2. **Performance**
   - Native Rust code is faster than Node.js
   - Lower memory footprint

3. **Security**
   - Tauri's security model restricts IPC
   - Rust's memory safety prevents entire classes of bugs

4. **Distribution**
   - Auto-updater support via Tauri
   - Code signing for all platforms
   - Native installers (DMG, MSI, DEB, AppImage)

5. **Native Features**
   - System tray integration
   - Native notifications
   - Native file dialogs
   - Menu bar integration
