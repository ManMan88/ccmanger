# Rust Backend + Tauri Migration Plan

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
import { invoke } from '@tauri-apps/api/core';

// Check if running in Tauri
const isTauri = '__TAURI__' in window;

// Fallback to HTTP for development without Tauri
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return invoke<T>(command, args);
  }
  // Fallback to HTTP API for non-Tauri development
  throw new Error('Tauri not available');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(
      error.error?.code || 'UNKNOWN_ERROR',
      error.error?.message || 'An error occurred',
      response.status,
      error.error?.details
    );
  }

  return response.json();
}

// Agent API - Uses Tauri commands when available
export const agents = {
  list: async (params?: { worktreeId?: string; status?: string; includeDeleted?: boolean }) => {
    if (isTauri) {
      return tauriInvoke<{ agents: Agent[] }>('list_agents', {
        worktreeId: params?.worktreeId,
        includeDeleted: params?.includeDeleted,
      });
    }
    const query = new URLSearchParams();
    if (params?.worktreeId) query.set('worktreeId', params.worktreeId);
    if (params?.status) query.set('status', params.status);
    if (params?.includeDeleted) query.set('includeDeleted', 'true');
    return request<{ agents: Agent[] }>('GET', `/agents?${query}`);
  },

  get: async (id: string) => {
    if (isTauri) {
      return tauriInvoke<Agent>('get_agent', { id });
    }
    return request<Agent>('GET', `/agents/${id}`);
  },

  create: async (data: CreateAgentInput) => {
    if (isTauri) {
      return tauriInvoke<Agent>('create_agent', { input: data });
    }
    return request<Agent>('POST', '/agents', data);
  },

  start: async (id: string, worktreePath: string, initialPrompt?: string) => {
    if (isTauri) {
      return tauriInvoke<Agent>('start_agent', { id, worktreePath, initialPrompt });
    }
    return request<Agent>('POST', `/agents/${id}/start`, { initialPrompt });
  },

  stop: async (id: string, force?: boolean) => {
    if (isTauri) {
      return tauriInvoke<Agent>('stop_agent', { id, force });
    }
    return request<Agent>('POST', `/agents/${id}/stop?force=${force || false}`);
  },

  sendMessage: async (id: string, content: string) => {
    if (isTauri) {
      return tauriInvoke<SendMessageResponse>('send_message_to_agent', {
        id,
        input: { content }
      });
    }
    return request<SendMessageResponse>('POST', `/agents/${id}/message`, { content });
  },

  getMessages: async (id: string, params?: { limit?: number; before?: string }) => {
    if (isTauri) {
      return tauriInvoke<MessageListResponse>('get_agent_messages', {
        id,
        limit: params?.limit,
        before: params?.before,
      });
    }
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.before) query.set('before', params.before);
    return request<MessageListResponse>('GET', `/agents/${id}/messages?${query}`);
  },

  delete: async (id: string, archive?: boolean) => {
    if (isTauri) {
      return tauriInvoke<void>('delete_agent', { id, archive });
    }
    return request<void>('DELETE', `/agents/${id}?archive=${archive ?? true}`);
  },

  fork: async (id: string, name?: string) => {
    if (isTauri) {
      return tauriInvoke<Agent>('fork_agent', { id, name });
    }
    return request<Agent>('POST', `/agents/${id}/fork`, { name });
  },
};

// Similar patterns for workspaces, worktrees, usage...
```

### 6.2 WebSocket Client Update

**File: `src/lib/websocket.ts` (Modified)**

```typescript
// WebSocket URL - same for both Tauri and browser
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

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

## Summary: Migration Timeline

| Phase | Description | Duration | Dependencies |
|-------|-------------|----------|--------------|
| 1 | Project Setup & Foundation | 1-2 days | None |
| 2 | Core Types & Database Layer | 2-3 days | Phase 1 |
| 3 | Service Layer | 4-5 days | Phase 2 |
| 4 | WebSocket Server | 2-3 days | Phase 3 |
| 5 | Tauri Commands (IPC) | 2-3 days | Phase 3, 4 |
| 6 | Frontend Integration | 2-3 days | Phase 5 |
| 7 | Build & Distribution | 1-2 days | Phase 6 |
| 8 | Migration & Testing | 2-3 days | Phase 7 |

**Total Estimated Duration: 16-24 days**

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
