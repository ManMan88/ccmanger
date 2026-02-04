# Claude Manager - Technical Documentation

## Overview

This documentation provides a comprehensive plan for implementing the Claude Manager backend and integrating it with the existing React frontend. Claude Manager is a GUI application for managing Claude Code CLI agents across git worktrees.

## Document Index

| Document | Description |
|----------|-------------|
| [01-architecture-overview.md](./01-architecture-overview.md) | System architecture, tech stack, directory structure, design patterns |
| [02-api-specification.md](./02-api-specification.md) | REST API endpoints, WebSocket events, request/response schemas |
| [03-database-schema.md](./03-database-schema.md) | SQLite schema, migrations, entity relationships, TypeScript types |
| [04-backend-implementation.md](./04-backend-implementation.md) | Service layer implementation, route handlers, process management |
| [05-testing-strategy.md](./05-testing-strategy.md) | Unit tests, integration tests, E2E tests, coverage requirements |
| [06-ci-cd-pipeline.md](./06-ci-cd-pipeline.md) | GitHub Actions workflows, Docker configuration, quality gates |
| [07-implementation-phases.md](./07-implementation-phases.md) | Phased delivery plan, tasks, acceptance criteria, timeline |
| [08-frontend-integration.md](./08-frontend-integration.md) | API client, React Query setup, WebSocket integration, component updates |

## Quick Start

### Current State
- **Frontend**: React 18 + TypeScript + Vite (fully functional UI with mock data)
- **Backend**: Not implemented (planned: Node.js + Fastify)
- **Data**: In-memory only (no persistence)

### Target State
- Full-stack application with real-time agent management
- Persistent storage with SQLite
- WebSocket-based live updates
- Claude Code CLI integration

## Technology Stack Summary

### Frontend (Existing)
- React 18.3 + TypeScript 5.8
- Vite 5.4 (build tool)
- Tailwind CSS 3.4 + shadcn/ui
- React Query (installed, not used yet)

### Backend (Planned)
- Node.js 20 LTS + TypeScript
- Fastify 4.x (HTTP server)
- @fastify/websocket (real-time)
- better-sqlite3 (database)
- simple-git (git operations)

### DevOps (Planned)
- GitHub Actions (CI/CD)
- Docker (containerization)
- Vitest (testing)

## Implementation Timeline

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 0: Setup | 1 week | Monorepo, CI foundation |
| Phase 1: Core Backend | 2-3 weeks | REST API, database |
| Phase 2: Process Mgmt | 2 weeks | Claude CLI integration |
| Phase 3: Real-time | 1-2 weeks | WebSocket streaming |
| Phase 4: Integration | 2 weeks | Frontend connection |
| Phase 5: Testing | 1-2 weeks | E2E tests, polish |
| Phase 6: Production | 1 week | Documentation, deployment |

**Total: 10-13 weeks**

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
- Node.js 20+
- pnpm 9+
- Git
- Claude Code CLI (for agent features)

### Setup (After Backend Implementation)
```bash
# Clone repository
git clone <repo-url>
cd claude-manager

# Install dependencies
pnpm install

# Start development servers
pnpm dev        # Frontend on :8080
pnpm dev:server # Backend on :3001
```

### Running Tests
```bash
pnpm test           # All tests
pnpm test:frontend  # Frontend tests
pnpm test:backend   # Backend tests
pnpm test:e2e       # E2E tests
```

## Contributing

1. Read the relevant documentation for the area you're working on
2. Follow the implementation phases in order
3. Write tests alongside code (TDD encouraged)
4. Ensure CI passes before merging
5. Update documentation as needed

## License

[Add license information]
