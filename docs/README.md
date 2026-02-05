# Claude Manager - Technical Documentation

## Overview

Claude Manager is a native desktop application for managing Claude Code CLI agents across git worktrees. Built with Rust and Tauri, it provides a React frontend with a high-performance Rust backend.

## Document Index

| Document                                                     | Description                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| [01-architecture-overview.md](./01-architecture-overview.md) | System architecture, tech stack, directory structure, design patterns |
| [02-api-specification.md](./02-api-specification.md)         | Tauri IPC commands, WebSocket events, request/response schemas        |
| [03-database-schema.md](./03-database-schema.md)             | SQLite schema, migrations, entity relationships                       |
| [08-frontend-integration.md](./08-frontend-integration.md)   | React Query setup, Tauri IPC integration, component patterns          |

## Technology Stack

### Frontend

- React 18.3 + TypeScript 5.8
- Vite 5.4 (build tool)
- Tailwind CSS 3.4 + shadcn/ui
- React Query (TanStack Query)
- WebSocket client with auto-reconnect

### Backend (Rust/Tauri)

- Tauri 2.x + Tokio async runtime
- Axum (WebSocket server)
- rusqlite + r2d2 connection pool
- git2-rs (Git operations)
- tokio::process (process management)

### Testing

- 68 Rust tests (30 unit + 38 integration)
- Criterion benchmarks
- Vitest for frontend
- Playwright for E2E

## Key Features

### Agent Management

- Spawn/stop Claude Code CLI agents
- Real-time output streaming
- Context level monitoring
- Mode switching (auto/plan/regular)
- Permission management (read/write/execute)

### Worktree Management

- Create/delete git worktrees
- Branch checkout
- Agent assignment per worktree
- Drag-and-drop reordering

### Workspace Management

- Open existing git repositories
- Multiple worktrees per workspace
- Usage statistics tracking

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

## Getting Started

### Prerequisites

- Rust 1.75+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- pnpm 9+
- Git
- Platform dependencies (see [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites))
- Claude Code CLI (for agent features)

### Development

```bash
# Clone repository
git clone <repo-url>
cd claude-manager

# Install dependencies
pnpm install

# Start development mode
pnpm tauri dev
```

### Running Tests

```bash
# Rust tests
cd src-tauri
cargo test              # All tests (68 tests)
cargo bench             # Performance benchmarks

# Frontend tests
pnpm test               # Vitest
pnpm test:e2e           # Playwright
```

### Building

```bash
# Build native application
pnpm tauri build

# Output: src-tauri/target/release/bundle/
```

## Contributing

1. Read the relevant documentation for the area you're working on
2. Write tests alongside code (TDD encouraged)
3. Use `cargo clippy` for linting and `cargo fmt` for formatting
4. Ensure CI passes before merging
5. Update documentation as needed

## License

MIT
