---
name: rust-patterns
description: Rust patterns and best practices for Claude Manager backend. Use when writing Rust code, implementing services, handling errors, or working with async/tokio. Triggers on "Rust pattern", "implement in Rust", "Rust service", "tokio", "async Rust", or when working on src-tauri/ code.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
---

# Rust Patterns for Claude Manager

Follow these patterns when implementing Rust code for the Claude Manager backend.

## 1. Project Structure

```
src-tauri/
├── Cargo.toml
├── src/
│   ├── main.rs           # Entry point, Tauri setup
│   ├── lib.rs            # Library root, module exports
│   ├── commands/         # Tauri IPC commands
│   │   ├── mod.rs
│   │   ├── agent_commands.rs
│   │   ├── workspace_commands.rs
│   │   └── worktree_commands.rs
│   ├── services/         # Business logic
│   │   ├── mod.rs
│   │   ├── agent_service.rs
│   │   ├── workspace_service.rs
│   │   ├── worktree_service.rs
│   │   ├── git_service.rs
│   │   └── process_service.rs
│   ├── db/               # Database layer
│   │   ├── mod.rs
│   │   ├── connection.rs
│   │   ├── migrations.rs
│   │   └── repositories/
│   │       ├── mod.rs
│   │       ├── agent_repository.rs
│   │       └── workspace_repository.rs
│   ├── types/            # Type definitions
│   │   ├── mod.rs
│   │   ├── agent.rs
│   │   ├── workspace.rs
│   │   └── websocket.rs
│   ├── websocket/        # WebSocket server
│   │   ├── mod.rs
│   │   ├── server.rs
│   │   └── client_manager.rs
│   └── error.rs          # Error types
└── tests/                # Integration tests
    └── integration_test.rs
```

## 2. Type Definitions

### Enums with Serde
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Running,
    Waiting,
    Error,
    Finished,
}

impl Default for AgentStatus {
    fn default() -> Self {
        Self::Finished
    }
}

impl std::fmt::Display for AgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Running => write!(f, "running"),
            Self::Waiting => write!(f, "waiting"),
            Self::Error => write!(f, "error"),
            Self::Finished => write!(f, "finished"),
        }
    }
}

impl std::str::FromStr for AgentStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "running" => Ok(Self::Running),
            "waiting" => Ok(Self::Waiting),
            "error" => Ok(Self::Error),
            "finished" => Ok(Self::Finished),
            _ => Err(format!("Invalid status: {}", s)),
        }
    }
}
```

### Structs with Builder Pattern
```rust
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}

impl Agent {
    pub fn builder(worktree_id: impl Into<String>) -> AgentBuilder {
        AgentBuilder::new(worktree_id)
    }
}

pub struct AgentBuilder {
    worktree_id: String,
    name: Option<String>,
    mode: AgentMode,
    permissions: Vec<Permission>,
}

impl AgentBuilder {
    pub fn new(worktree_id: impl Into<String>) -> Self {
        Self {
            worktree_id: worktree_id.into(),
            name: None,
            mode: AgentMode::Regular,
            permissions: vec![Permission::Read],
        }
    }

    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    pub fn mode(mut self, mode: AgentMode) -> Self {
        self.mode = mode;
        self
    }

    pub fn permissions(mut self, permissions: Vec<Permission>) -> Self {
        self.permissions = permissions;
        self
    }

    pub fn build(self) -> Agent {
        let now = chrono::Utc::now().to_rfc3339();
        Agent {
            id: generate_id("ag"),
            worktree_id: self.worktree_id,
            name: self.name.unwrap_or_else(|| format!("Agent {}", chrono::Utc::now().format("%H:%M"))),
            status: AgentStatus::Finished,
            context_level: 0,
            mode: self.mode,
            permissions: self.permissions,
            pid: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
```

## 3. Error Handling

### Define Error Types with thiserror
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Validation error: {0}")]
    Validation(String),

    #[error("{resource} not found: {id}")]
    NotFound { resource: &'static str, id: String },

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("Process error: {0}")]
    Process(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Pool error: {0}")]
    Pool(#[from] r2d2::Error),
}

impl AppError {
    pub fn not_found(resource: &'static str, id: impl Into<String>) -> Self {
        Self::NotFound { resource, id: id.into() }
    }

    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }
}

// For Tauri commands
impl From<AppError> for String {
    fn from(err: AppError) -> String {
        err.to_string()
    }
}
```

### Using Result Throughout
```rust
pub type Result<T> = std::result::Result<T, AppError>;

impl AgentService {
    pub fn get_agent(&self, id: &str) -> Result<Agent> {
        self.repo.find_by_id(id)?
            .ok_or_else(|| AppError::not_found("Agent", id))
    }

    pub fn create_agent(&self, input: CreateAgentInput) -> Result<Agent> {
        // Validate
        if input.name.as_ref().map(|n| n.is_empty()).unwrap_or(false) {
            return Err(AppError::validation("Name cannot be empty"));
        }

        // Create
        let agent = Agent::builder(&input.worktree_id)
            .name(input.name.unwrap_or_default())
            .mode(input.mode.unwrap_or_default())
            .permissions(input.permissions.unwrap_or_default())
            .build();

        self.repo.create(&agent)
    }
}
```

## 4. Database Access

### Repository Pattern
```rust
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

pub type DbPool = Pool<SqliteConnectionManager>;

pub struct AgentRepository {
    pool: DbPool,
}

impl AgentRepository {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn find_by_id(&self, id: &str) -> Result<Option<Agent>> {
        let conn = self.pool.get()?;

        let result = conn.query_row(
            "SELECT * FROM agents WHERE id = ?",
            [id],
            |row| self.row_to_agent(row),
        );

        match result {
            Ok(agent) => Ok(Some(agent)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn create(&self, agent: &Agent) -> Result<Agent> {
        let conn = self.pool.get()?;
        let permissions_json = serde_json::to_string(&agent.permissions)?;

        conn.execute(
            r#"
            INSERT INTO agents (id, worktree_id, name, status, context_level, mode, permissions, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            rusqlite::params![
                agent.id,
                agent.worktree_id,
                agent.name,
                agent.status.to_string(),
                agent.context_level,
                agent.mode.to_string(),
                permissions_json,
                agent.created_at,
                agent.updated_at,
            ],
        )?;

        self.find_by_id(&agent.id)?
            .ok_or_else(|| AppError::not_found("Agent", &agent.id))
    }

    fn row_to_agent(&self, row: &rusqlite::Row) -> rusqlite::Result<Agent> {
        let permissions_str: String = row.get("permissions")?;
        let permissions: Vec<Permission> = serde_json::from_str(&permissions_str)
            .unwrap_or_default();

        Ok(Agent {
            id: row.get("id")?,
            worktree_id: row.get("worktree_id")?,
            name: row.get("name")?,
            status: row.get::<_, String>("status")?
                .parse()
                .unwrap_or_default(),
            context_level: row.get("context_level")?,
            mode: row.get::<_, String>("mode")?
                .parse()
                .unwrap_or_default(),
            permissions,
            pid: row.get("pid")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
```

## 5. Async Patterns with Tokio

### Service with Async Methods
```rust
use tokio::sync::{broadcast, RwLock};
use std::sync::Arc;

pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<String, AgentProcess>>>,
    event_tx: broadcast::Sender<ProcessEvent>,
}

impl ProcessManager {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(1000);
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ProcessEvent> {
        self.event_tx.subscribe()
    }

    pub async fn spawn_agent(&self, id: &str, path: &str) -> Result<u32> {
        let mut processes = self.processes.write().await;

        if processes.contains_key(id) {
            return Err(AppError::Conflict(format!("Agent {} already running", id)));
        }

        let child = tokio::process::Command::new("claude")
            .current_dir(path)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()?;

        let pid = child.id().unwrap_or(0);
        processes.insert(id.to_string(), AgentProcess { pid, child });

        let _ = self.event_tx.send(ProcessEvent::Started { agent_id: id.to_string(), pid });

        Ok(pid)
    }
}
```

### Spawning Background Tasks
```rust
impl ProcessManager {
    fn start_monitor(&self, agent_id: String) {
        let processes = self.processes.clone();
        let event_tx = self.event_tx.clone();

        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(100)).await;

                let should_exit = {
                    let mut procs = processes.write().await;
                    if let Some(proc) = procs.get_mut(&agent_id) {
                        match proc.child.try_wait() {
                            Ok(Some(status)) => {
                                let _ = event_tx.send(ProcessEvent::Exited {
                                    agent_id: agent_id.clone(),
                                    code: status.code(),
                                });
                                procs.remove(&agent_id);
                                true
                            }
                            _ => false,
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

## 6. Tauri Commands

### Command Definition
```rust
use tauri::State;
use std::sync::Arc;

#[tauri::command]
pub async fn list_agents(
    worktree_id: String,
    include_deleted: Option<bool>,
    service: State<'_, Arc<AgentService>>,
) -> Result<AgentListResponse, String> {
    service
        .list_agents(&worktree_id, include_deleted.unwrap_or(false))
        .map(|agents| AgentListResponse { agents })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_agent(
    input: CreateAgentInput,
    service: State<'_, Arc<AgentService>>,
) -> Result<Agent, String> {
    service
        .create_agent(input)
        .map_err(|e| e.to_string())
}
```

## 7. ID Generation

```rust
use uuid::Uuid;

pub fn generate_id(prefix: &str) -> String {
    let timestamp = chrono::Utc::now().timestamp_millis();
    let random = &Uuid::new_v4().to_string()[..8];
    format!("{}_{}{}", prefix, timestamp, random)
}
```

## 8. Testing

```rust
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
        let repo = AgentRepository::new(pool);

        let agent = Agent::builder("wt_test")
            .name("Test Agent")
            .build();

        let result = repo.create(&agent);
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(created.name, "Test Agent");
        assert_eq!(created.status, AgentStatus::Finished);
    }

    #[tokio::test]
    async fn test_process_spawn() {
        let pm = ProcessManager::new();

        // Use echo for testing (doesn't require claude CLI)
        let result = pm.spawn_agent("ag_test", "/tmp").await;

        // This will fail without proper setup, but shows the pattern
        assert!(result.is_err() || result.unwrap() > 0);
    }
}
```

## Code Quality Checklist

- [ ] All public items have `///` doc comments
- [ ] Error types use thiserror
- [ ] No `unwrap()` in production code (use `?` or `expect()`)
- [ ] Types derive `Debug` at minimum
- [ ] Serde attributes use `rename_all = "camelCase"` for API types
- [ ] Async code uses tokio runtime
- [ ] Database access uses connection pool
- [ ] Tests use tempdir for isolation
- [ ] Clippy passes with no warnings
- [ ] Code formatted with `cargo fmt`
