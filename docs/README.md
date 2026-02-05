# Claude Manager - Technical Documentation

## Overview

This documentation provides a comprehensive plan for implementing the Claude Manager backend and integrating it with the existing React frontend. Claude Manager is a GUI application for managing Claude Code CLI agents across git worktrees.

> **Migration Complete**: The Rust + Tauri migration is complete with 68 tests passing. The project now supports native desktop builds with multi-platform CI/CD. See [09-rust-tauri-migration.md](./09-rust-tauri-migration.md) for the migration plan.

## Document Index

| Document                                                       | Description                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| [09-rust-tauri-migration.md](./09-rust-tauri-migration.md)     | **Rust + Tauri migration plan (START HERE)**                          |
| [01-architecture-overview.md](./01-architecture-overview.md)   | System architecture, tech stack, directory structure, design patterns |
| [02-api-specification.md](./02-api-specification.md)           | REST API endpoints, WebSocket events, request/response schemas        |
| [03-database-schema.md](./03-database-schema.md)               | SQLite schema, migrations, entity relationships, TypeScript types     |
| [04-backend-implementation.md](./04-backend-implementation.md) | Node.js service layer (legacy)                                        |
| [05-testing-strategy.md](./05-testing-strategy.md)             | Testing strategy (Node.js legacy + Rust)                              |
| [06-ci-cd-pipeline.md](./06-ci-cd-pipeline.md)                 | GitHub Actions workflows, multi-platform builds                       |
| [07-implementation-phases.md](./07-implementation-phases.md)   | Node.js phased delivery (legacy)                                      |
| [08-frontend-integration.md](./08-frontend-integration.md)     | API client, React Query, Tauri IPC integration                        |

## Quick Start

### Current State (Rust Migration Complete)

- **Frontend**: React 18 + TypeScript + Vite + React Query + Tauri IPC
- **Backend (Rust)**: Tauri 2.x + rusqlite + Axum WebSocket (68 tests passing)
- **Backend (Node.js)**: Fastify + SQLite + WebSocket (175+ tests, legacy)
- **CI/CD**: Multi-platform builds (macOS, Linux, Windows)
- **Testing**: Unit tests, integration tests, benchmarks, E2E with Playwright

### Migration Phases (All Complete)

| Phase | Description                | Status                 |
| ----- | -------------------------- | ---------------------- |
| 1     | Project Setup & Tauri Init | ✅ Complete            |
| 2-5   | Core Types, Services, IPC  | ✅ Complete            |
| 6     | Frontend Integration       | ✅ Complete            |
| 7     | Build & Distribution       | ✅ Complete            |
| 8     | Migration & Testing        | ✅ Complete            |
| 9     | Comprehensive Testing      | ✅ Complete (68 tests) |

## Technology Stack Summary

### Frontend

- React 18.3 + TypeScript 5.8
- Vite 5.4 (build tool)
- Tailwind CSS 3.4 + shadcn/ui
- React Query + Tauri IPC

### Backend - Rust/Tauri (Target)

- Tauri 2.x + Tokio async runtime
- Axum (WebSocket server)
- rusqlite + r2d2 connection pool
- git2-rs (Git operations)
- tokio::process (process management)

### Backend - Node.js (Legacy)

- Node.js 20 LTS + TypeScript
- Fastify 4.x (HTTP server)
- @fastify/websocket (real-time)
- better-sqlite3 (database)
- simple-git (git operations)

### DevOps

- GitHub Actions (multi-platform CI/CD)
- Tauri native builds (DMG, DEB, AppImage, MSI)
- Criterion benchmarks
- Vitest + cargo test

> **Note:** Native deployment - Claude Manager requires direct access to local git repositories, the Claude CLI, and file system.

## Rust Migration Deliverables

### Phase 7 (Build & Distribution)

- Multi-platform GitHub Actions workflows
- Native installers for macOS (DMG), Linux (DEB, AppImage), Windows (MSI)
- Rust linting (clippy) and testing in CI
- Benchmark infrastructure with Criterion

### Phase 8 (Migration & Testing)

- Data migration utility (`migration_tool.rs`) for Node.js → Rust
- 68 tests (30 unit + 38 integration)
- Test infrastructure: TestContext, fixtures, mocks
- Database backup and integrity verification

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

## Architecture Diagram

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
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                   External Systems                               │
│  Claude Code CLI | Git CLI | Anthropic API (optional)           │
└─────────────────────────────────────────────────────────────────┘
```

## Getting Started with Development

### Prerequisites

**For Tauri (Recommended):**

- Rust 1.75+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- pnpm 9+
- Git
- Platform dependencies (see [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites))
- Claude Code CLI (for agent features)

**For Node.js (Legacy):**

- Node.js 20+
- pnpm 9+
- Git
- Claude Code CLI (for agent features)

### Setup

```bash
# Clone repository
git clone <repo-url>
cd claude-manager

# Install dependencies
pnpm install

# Start Tauri development mode (recommended)
pnpm tauri dev

# OR start Node.js servers (legacy)
pnpm dev        # Frontend on :8080
pnpm dev:server # Backend on :3001
```

### Running Tests

```bash
# Rust tests
cd src-tauri
cargo test              # All Rust tests (68 tests)
cargo bench             # Performance benchmarks

# Frontend tests
pnpm test               # Frontend tests (Vitest)
pnpm test:e2e           # E2E tests (Playwright)

# Node.js backend tests (legacy)
pnpm --filter @claude-manager/server test
```

## Contributing

1. Read the relevant documentation for the area you're working on
2. Follow the implementation phases in order
3. Write tests alongside code (TDD encouraged)
4. Ensure CI passes before merging
5. Update documentation as needed

## License

[Add license information]
