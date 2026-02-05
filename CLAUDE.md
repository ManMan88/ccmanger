# Claude Manager

A GUI application for managing Claude Code CLI agents across git worktrees.

## Project Overview

Claude Manager provides a visual interface to:

- Manage git workspaces with multiple worktrees
- Spawn, monitor, and interact with Claude Code CLI agents
- Track agent status (running/waiting/error/finished) and context usage
- Configure agent modes (auto-approve/plan/regular) and permissions
- View API usage statistics

**Current State**: Rust + Tauri backend Phase 6 (Frontend Integration) complete. The frontend API client now supports both Tauri IPC and HTTP fallback. 25 unit tests pass for repository and service layers. The Node.js implementation remains available as reference (175+ tests).

## 🚀 Migration Status: Node.js → Rust + Tauri

This project is transitioning from a Node.js/Fastify backend to a native Rust backend packaged with Tauri. See [docs/09-rust-tauri-migration.md](docs/09-rust-tauri-migration.md) for the complete migration plan.

### Why Migrate?

- **Single Binary**: No separate backend process; one native app
- **Performance**: Rust's zero-cost abstractions vs V8 overhead
- **Memory**: Lower footprint without Node.js runtime
- **Distribution**: Native installers (DMG, MSI, DEB, AppImage)
- **Security**: Rust's memory safety + Tauri's security model

### Migration Phases

| Phase | Description                 | Status                    |
| ----- | --------------------------- | ------------------------- |
| 1     | Project Setup & Tauri Init  | ✅ Complete               |
| 2     | Core Types & Database Layer | ✅ Complete (in Phase 1)  |
| 3     | Service Layer               | ✅ Complete (in Phase 1)  |
| 4     | WebSocket Server            | ✅ Complete (in Phase 1)  |
| 5     | Tauri Commands (IPC)        | ✅ Complete (in Phase 1)  |
| 6     | Frontend Integration        | ✅ Complete               |
| 7     | Build & Distribution        | ⬜ Not Started            |
| 8     | Data Migration              | ⬜ Not Started            |
| 9     | Comprehensive Testing       | 🟡 In Progress (25 tests) |

### Phase 1 Deliverables (Complete)

- **35 source files** created in `src-tauri/`
- Full project scaffold: types, commands, services, db, websocket
- SQLite database with migrations and repository pattern
- Tauri IPC commands for all API endpoints
- WebSocket server using Axum
- Git operations using git2-rs
- Process manager for Claude CLI agents
- Compiles successfully with `cargo check`

### Phase 6 Deliverables (Complete)

- **Frontend API client** updated to support Tauri IPC commands with HTTP fallback
- **WebSocket client** compatible with both Node.js and Rust backends
- **@tauri-apps/api** dependency added for frontend-backend IPC
- **25 unit tests** for repository and service layers
- Full release build compiles successfully

## Documentation

| Document                                                               | Description                           |
| ---------------------------------------------------------------------- | ------------------------------------- |
| [docs/README.md](docs/README.md)                                       | Documentation index and quick start   |
| [docs/09-rust-tauri-migration.md](docs/09-rust-tauri-migration.md)     | **Rust + Tauri migration plan**       |
| [docs/01-architecture-overview.md](docs/01-architecture-overview.md)   | System architecture, tech stack       |
| [docs/02-api-specification.md](docs/02-api-specification.md)           | REST API & WebSocket specification    |
| [docs/03-database-schema.md](docs/03-database-schema.md)               | SQLite schema and migrations          |
| [docs/04-backend-implementation.md](docs/04-backend-implementation.md) | Node.js service layer (legacy)        |
| [docs/05-testing-strategy.md](docs/05-testing-strategy.md)             | Node.js testing (legacy)              |
| [docs/06-ci-cd-pipeline.md](docs/06-ci-cd-pipeline.md)                 | GitHub Actions and Docker setup       |
| [docs/07-implementation-phases.md](docs/07-implementation-phases.md)   | Node.js phased delivery (legacy)      |
| [docs/08-frontend-integration.md](docs/08-frontend-integration.md)     | React Query and WebSocket integration |

## Tech Stack

### Frontend (Shared between Node.js and Tauri)

- **Framework**: React 18.3 + TypeScript
- **Build Tool**: Vite 5.4
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (Radix primitives)
- **State**: React Query (TanStack Query) for server state
- **Real-time**: WebSocket client with auto-reconnect
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React

### Backend - Rust/Tauri (Target)

- **Runtime**: Tauri 2.x + Tokio async runtime
- **Framework**: Axum (WebSocket server)
- **Database**: rusqlite + r2d2 connection pool
- **Git**: git2-rs
- **Process Management**: tokio::process + portable-pty
- **Serialization**: serde + serde_json

### Backend - Node.js (Legacy)

- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify 4.x
- **Database**: SQLite (better-sqlite3)
- **Real-time**: @fastify/websocket
- **Git**: simple-git
- **Process Management**: child_process
- **Validation**: Zod

## Project Structure

```
claude-manager/
├── docs/                          # Technical documentation
│   ├── 09-rust-tauri-migration.md # Migration plan (START HERE)
│   └── ...
│
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
│   │   ├── api.ts                 # Typed API client (HTTP + Tauri IPC)
│   │   ├── websocket.ts           # WebSocket client
│   │   └── queryClient.ts         # React Query configuration
│   └── types/
│       └── agent.ts               # Frontend type definitions
│
├── src-tauri/                     # Rust backend (Tauri) - IN PROGRESS
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
│   ├── tests/                     # Integration tests
│   └── benches/                   # Performance benchmarks
│
├── server/                        # Node.js backend (LEGACY)
│   ├── src/
│   │   ├── routes/                # REST API endpoints
│   │   ├── services/              # Business logic layer
│   │   ├── db/                    # Database and repositories
│   │   └── websocket/             # WebSocket handlers
│   └── tests/                     # Unit and integration tests
│
└── shared/                        # Shared types package
    └── src/index.ts               # API types and converters
```

## Development Commands

```bash
# Frontend development (works with both backends)
pnpm install              # Install dependencies
pnpm dev                  # Start Vite dev server (port 8080)
pnpm build                # Production build
pnpm test                 # Run frontend tests (Vitest)
pnpm lint                 # ESLint check

# Rust/Tauri development (TARGET)
cd src-tauri
cargo build               # Build Rust backend
cargo test                # Run Rust tests
cargo test --lib          # Unit tests only
cargo test --test '*'     # Integration tests only
cargo bench               # Run benchmarks
pnpm tauri dev            # Start Tauri dev mode (from root)
pnpm tauri build          # Build native application

# Node.js backend (LEGACY)
cd server
pnpm dev                  # Start dev server (port 3001)
pnpm test                 # Run backend tests
pnpm migrate              # Run database migrations
```

## Architecture Overview

### Target Architecture (Tauri)

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

### Legacy Architecture (Node.js)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  React + TypeScript + Tailwind + shadcn/ui + React Query        │
└─────────────────────────────────────────────────────────────────┘
                    │ REST API          │ WebSocket
                    ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                  │
│  Fastify + TypeScript + @fastify/websocket                      │
├─────────────────────────────────────────────────────────────────┤
│  Services: Workspace | Worktree | Agent | Git | Process | Usage │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                  │
│  SQLite (better-sqlite3) + File System (git repos, logs)        │
└─────────────────────────────────────────────────────────────────┘
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
    // ...
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
    // ...
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

## Testing Strategy

### Rust Tests (Target)

| Category          | Coverage Target      | Location                               |
| ----------------- | -------------------- | -------------------------------------- |
| Unit Tests        | 80-90%               | `src/**/*.rs` (`#[cfg(test)]` modules) |
| Integration Tests | 70-80%               | `tests/` directory                     |
| E2E Tests         | Critical paths       | `tests/e2e/`                           |
| Benchmarks        | Performance baseline | `benches/`                             |

**Critical paths requiring 95%+ coverage:**

- Agent spawning and lifecycle
- Message send/receive flow
- Git worktree operations
- WebSocket streaming
- Database migrations

### Node.js Tests (Legacy)

- **175+ tests passing** (unit + integration)
- Vitest for unit tests
- Supertest for API integration
- Playwright for E2E

## Agent Status Colors

- **Running** (green): Agent actively processing
- **Waiting** (yellow/orange): Awaiting user input
- **Error** (red): Agent encountered an error
- **Finished** (gray): Agent completed

## Implementation Status

| Component       | Node.js | Rust | Notes                |
| --------------- | ------- | ---- | -------------------- |
| Frontend UI     | ✅      | ✅   | Shared               |
| API Client      | ✅      | ✅   | Tauri IPC ready      |
| Database Layer  | ✅      | ✅   | rusqlite + r2d2      |
| Agent Service   | ✅      | ✅   | Scaffold complete    |
| Process Manager | ✅      | ✅   | tokio + portable-pty |
| Git Service     | ✅      | ✅   | git2-rs              |
| WebSocket       | ✅      | ✅   | Axum WebSocket       |
| Tauri Commands  | N/A     | ✅   | All endpoints        |
| Testing         | ✅ 175+ | ⬜   | Port tests           |
| CI/CD           | ✅      | ⬜   | Multi-platform       |

## Getting Started with Migration

1. **Read the migration plan**: [docs/09-rust-tauri-migration.md](docs/09-rust-tauri-migration.md)
2. **Install Rust toolchain**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. **Install Tauri CLI**: `cargo install tauri-cli`
4. **Start Tauri dev mode**: `pnpm tauri dev`

## Contributing

When contributing to the Rust migration:

1. Follow Rust idioms and conventions
2. Write tests alongside code (TDD recommended)
3. Use `cargo clippy` for linting
4. Use `cargo fmt` for formatting
5. Document public APIs with rustdoc comments
6. Keep parity with Node.js API contracts
