# Claude Manager

A native desktop application for managing Claude Code CLI agents across git worktrees, built with Rust and Tauri.

## Project Overview

Claude Manager provides a visual interface to:

- Manage git workspaces with multiple worktrees
- Spawn, monitor, and interact with Claude Code CLI agents
- Track agent status (running/waiting/error/finished) and context usage
- Configure agent modes (auto-approve/plan/regular) and permissions
- View API usage statistics

## Tech Stack

### Frontend

- **Framework**: React 18.3 + TypeScript
- **Build Tool**: Vite 5.4
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (Radix primitives)
- **State**: React Query (TanStack Query) for server state
- **Real-time**: WebSocket client with auto-reconnect
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React

### Backend (Rust/Tauri)

- **Runtime**: Tauri 2.x + Tokio async runtime
- **Framework**: Axum (WebSocket server)
- **Database**: rusqlite + r2d2 connection pool
- **Git**: git2-rs
- **Process Management**: tokio::process + portable-pty
- **Serialization**: serde + serde_json
- **Testing**: 68 tests (30 unit + 38 integration)

## Project Structure

```
claude-manager/
├── src/                           # Frontend source (React)
│   ├── pages/
│   │   └── Index.tsx              # Main dashboard page
│   ├── components/
│   │   ├── Toolbar.tsx            # Top navigation bar
│   │   ├── WorktreeRow.tsx        # Worktree container with agents
│   │   ├── AgentBox.tsx           # Individual agent card
│   │   ├── AgentModal.tsx         # Agent interaction dialog
│   │   └── ui/                    # shadcn/ui components (40+)
│   ├── hooks/
│   │   ├── useWorkspace.ts        # Workspace state with React Query
│   │   ├── useAgents.ts           # Agent queries and mutations
│   │   └── useWebSocket.ts        # WebSocket connection hooks
│   ├── lib/
│   │   ├── api.ts                 # Typed API client (Tauri IPC)
│   │   ├── websocket.ts           # WebSocket client
│   │   └── queryClient.ts         # React Query configuration
│   └── types/
│       └── agent.ts               # Frontend type definitions
│
├── src-tauri/                     # Rust backend (Tauri)
│   ├── Cargo.toml                 # Rust dependencies
│   ├── src/
│   │   ├── main.rs                # Tauri application entry
│   │   ├── lib.rs                 # Library exports
│   │   ├── commands/              # Tauri IPC commands
│   │   │   ├── agent_commands.rs
│   │   │   ├── workspace_commands.rs
│   │   │   └── worktree_commands.rs
│   │   ├── services/              # Business logic
│   │   │   ├── agent_service.rs
│   │   │   ├── process_service.rs
│   │   │   └── git_service.rs
│   │   ├── db/                    # Database layer
│   │   │   ├── connection.rs
│   │   │   ├── migrations.rs
│   │   │   └── repositories/
│   │   ├── websocket/             # WebSocket server (Axum)
│   │   ├── types/                 # Rust type definitions
│   │   └── error.rs               # Error handling
│   ├── tests/                     # Integration tests (38 tests)
│   │   ├── common/                # Test utilities, fixtures, mocks
│   │   ├── api/                   # API integration tests
│   │   └── database/              # Database tests
│   └── benches/                   # Performance benchmarks (Criterion)
│
├── shared/                        # Shared types package
│   └── src/index.ts               # API types and converters
│
└── docs/                          # Technical documentation
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Start Tauri development mode (recommended)
pnpm tauri dev

# Build native application
pnpm tauri build

# Run Rust tests
cd src-tauri
cargo test                # All tests (68 tests)
cargo test --lib          # Unit tests only (30 tests)
cargo test --test '*'     # Integration tests only (38 tests)
cargo bench               # Performance benchmarks
cargo clippy              # Linting
cargo fmt                 # Formatting

# Frontend only
pnpm dev                  # Start Vite dev server (port 8080)
pnpm build                # Production build
pnpm test                 # Run frontend tests (Vitest)
pnpm lint                 # ESLint check
```

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                     Tauri Application                          │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              WebView (Frontend)                          │  │
│  │         React + TypeScript + Tailwind                   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                     │
│                    Tauri Commands (IPC)                        │
│                          │                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               Rust Backend Core                          │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │  │
│  │  │   Services  │ │   SQLite    │ │  WebSocket  │       │  │
│  │  │   (Axum)    │ │  (rusqlite) │ │  (tokio-ws) │       │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘       │  │
│  │                        │                                 │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │     Process Manager (tokio::process)             │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Claude Code CLI │
                       └─────────────────┘
```

## Key Types

### Rust Types (src-tauri/src/types/)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub worktree_id: String,
    pub name: String,
    pub status: AgentStatus,      // Running, Waiting, Error, Finished
    pub context_level: i32,       // 0-100 percentage
    pub mode: AgentMode,          // Auto, Plan, Regular
    pub permissions: Vec<Permission>, // Read, Write, Execute
    pub display_order: i32,
    pub pid: Option<i32>,
    pub session_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub branch: String,
    pub path: String,
    pub sort_mode: SortMode,      // Free, Status, Name
    pub display_order: i32,
    pub is_main: bool,
}
```

### TypeScript Types (src/types/)

```typescript
interface Agent {
  id: string
  name: string
  status: 'running' | 'waiting' | 'error' | 'finished'
  contextLevel: number
  mode: 'auto' | 'plan' | 'regular'
  permissions: ('read' | 'write' | 'execute')[]
  worktreeId: string
  createdAt: string
  order: number
}
```

## Testing

| Category          | Count | Location                               |
| ----------------- | ----- | -------------------------------------- |
| Unit Tests        | 30    | `src/**/*.rs` (`#[cfg(test)]` modules) |
| Integration Tests | 38    | `tests/` directory                     |
| Benchmarks        | 6     | `benches/` directory                   |

Test infrastructure includes:

- `TestContext` with database pool, process manager, temp directories
- Test fixtures and `AgentBuilder` pattern
- `MockProcessManager` for testing without real processes

## Agent Status Colors

- **Running** (green): Agent actively processing
- **Waiting** (yellow/orange): Awaiting user input
- **Error** (red): Agent encountered an error
- **Finished** (gray): Agent completed

## Documentation

| Document                                                             | Description                         |
| -------------------------------------------------------------------- | ----------------------------------- |
| [docs/README.md](docs/README.md)                                     | Documentation index and quick start |
| [docs/01-architecture-overview.md](docs/01-architecture-overview.md) | System architecture, tech stack     |
| [docs/02-api-specification.md](docs/02-api-specification.md)         | API & WebSocket specification       |
| [docs/03-database-schema.md](docs/03-database-schema.md)             | SQLite schema and migrations        |
| [docs/08-frontend-integration.md](docs/08-frontend-integration.md)   | React Query and Tauri IPC           |

## Contributing

1. Follow Rust idioms and conventions
2. Write tests alongside code (TDD recommended)
3. Use `cargo clippy` for linting
4. Use `cargo fmt` for formatting
5. Document public APIs with rustdoc comments
