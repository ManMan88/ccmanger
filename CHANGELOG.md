# Changelog

All notable changes to Claude Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 6: Production deployment scripts and configuration
- PM2 ecosystem configuration for process management
- GitHub Actions release workflow
- Metrics endpoint with request counts and response times
- Error tracking integration
- OpenAPI/Swagger API documentation
- User guide and troubleshooting documentation

## [0.1.0] - 2024-XX-XX

### Added

#### Core Infrastructure (Phases 0-1)

- Monorepo structure with pnpm workspaces
- Fastify backend server with TypeScript
- SQLite database with better-sqlite3
- Database migration system
- Shared types package between frontend and backend
- GitHub Actions CI pipeline

#### REST API

- Workspace management endpoints (`/api/workspaces`)
- Worktree management endpoints (`/api/worktrees`)
- Agent CRUD endpoints (`/api/agents`)
- Usage statistics endpoints (`/api/usage`)
- Health check endpoints (`/api/health`)

#### Process Management (Phase 2)

- Claude Code CLI integration
- Agent process lifecycle management (spawn, stop, resume)
- Message sending to running agents
- Process output streaming
- Orphaned process cleanup on startup
- Graceful shutdown handling

#### Real-time Features (Phase 3)

- WebSocket server with @fastify/websocket
- Agent output streaming via WebSocket
- Status change notifications
- Context level updates
- Workspace state synchronization
- Client subscription management
- Heartbeat mechanism for connection health

#### Frontend Integration (Phase 4)

- React Query integration for data fetching
- WebSocket client with auto-reconnect
- Real-time cache updates from WebSocket events
- Optimistic updates for mutations
- Loading and error states
- Connection status indicator

#### Testing & Polish (Phase 5)

- E2E test suite with Playwright
- Accessibility tests with axe-core
- 175+ backend tests (unit + integration)
- Performance optimizations
- Database index improvements

### Technical Details

- **Frontend**: React 18.3 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js 20 + Fastify 4 + TypeScript
- **Database**: SQLite with better-sqlite3
- **Real-time**: WebSocket with @fastify/websocket
- **Testing**: Vitest + Playwright

---

[Unreleased]: https://github.com/your-org/claude-manager/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/claude-manager/releases/tag/v0.1.0
