# Implementation Phases

## Overview

This document outlines the phased implementation plan for Claude Manager, breaking down the work into manageable milestones with clear deliverables and acceptance criteria.

## Phase Summary

| Phase | Name                 | Duration  | Key Deliverables                          |
| ----- | -------------------- | --------- | ----------------------------------------- |
| 0     | Project Setup        | 1 week    | Monorepo structure, CI/CD foundation      |
| 1     | Core Backend         | 2-3 weeks | Database, REST API, basic services        |
| 2     | Process Management   | 2 weeks   | Claude CLI integration, process lifecycle |
| 3     | Real-time Features   | 1-2 weeks | WebSocket, live updates                   |
| 4     | Frontend Integration | 2 weeks   | API connection, state management          |
| 5     | Testing & Polish     | 1-2 weeks | E2E tests, bug fixes, optimization        |
| 6     | Production Ready     | 1 week    | Documentation, deployment, monitoring     |

**Total Estimated Duration: 10-13 weeks**

---

## Phase 0: Project Setup

### Objectives

- Establish monorepo structure
- Set up development environment
- Configure CI/CD foundation

### Tasks

#### 0.1 Monorepo Structure

- [x] Initialize pnpm workspaces
- [x] Create shared types package (`shared/`)
- [x] Create server package (`server/`)
- [x] Configure TypeScript project references
- [x] Set up path aliases

**Deliverable:** Working monorepo with package resolution ✅

#### 0.2 Server Scaffolding

- [x] Initialize Fastify application
- [x] Configure environment variables with Zod
- [x] Set up logging with Pino
- [x] Create basic health check endpoint
- [x] Add graceful shutdown handling

**Deliverable:** Server that starts and responds to health checks ✅

#### 0.3 Database Setup

- [x] Install and configure better-sqlite3
- [x] Create database initialization logic
- [x] Implement migration system
- [x] Create initial migration (all tables)
- [x] Add database backup utility

**Deliverable:** Database that initializes with schema ✅

#### 0.4 Development Tooling

- [x] Configure ESLint for server
- [x] Configure Prettier
- [x] Set up Vitest for server tests
- [x] Create npm scripts for common tasks
- [x] Add pre-commit hooks with Husky

**Deliverable:** Consistent code style and test runner ✅

#### 0.5 CI/CD Foundation

- [x] Create GitHub Actions CI workflow
- [x] Add lint job
- [x] Add type check job
- [x] Add test job
- [ ] Configure branch protection rules

**Deliverable:** PRs require passing checks ✅ (branch protection is GitHub UI config)

### Acceptance Criteria

- [x] `pnpm install` works from root
- [x] `pnpm dev:server` starts backend
- [x] `GET /api/health` returns 200
- [x] Database file created on first run
- [x] CI runs on every PR

### Files to Create

```
server/
├── src/
│   ├── index.ts
│   ├── app.ts
│   ├── config/
│   │   ├── index.ts
│   │   └── env.ts
│   └── db/
│       ├── index.ts
│       └── migrations/
│           └── 001_initial_schema.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts

shared/
├── types.ts
└── package.json

.github/
└── workflows/
    └── ci.yml

pnpm-workspace.yaml (update)
```

---

## Phase 1: Core Backend

### Objectives

- Implement data access layer
- Create REST API endpoints
- Build service layer for business logic

### Tasks

#### 1.1 Repository Layer

- [ ] Create base repository interface
- [ ] Implement `WorkspaceRepository`
- [ ] Implement `WorktreeRepository`
- [ ] Implement `AgentRepository`
- [ ] Implement `MessageRepository`
- [ ] Implement `UsageStatsRepository`
- [ ] Write unit tests for all repositories

**Deliverable:** Data access layer with 80%+ coverage

#### 1.2 Validation Schemas

- [ ] Create Zod schemas for all DTOs
- [ ] Create request validation middleware
- [ ] Create response serialization helpers
- [ ] Add validation error formatting

**Deliverable:** Type-safe API validation

#### 1.3 Workspace Service & Routes

- [ ] Implement `WorkspaceService`
  - [ ] `createWorkspace(path)`
  - [ ] `getWorkspace(id)`
  - [ ] `listWorkspaces()`
  - [ ] `deleteWorkspace(id)`
- [ ] Create workspace routes
- [ ] Write integration tests

**Deliverable:** Working `/api/workspaces` endpoints

#### 1.4 Worktree Service & Routes

- [ ] Implement `GitService`
  - [ ] `isValidRepository()`
  - [ ] `listWorktrees()`
  - [ ] `addWorktree()`
  - [ ] `removeWorktree()`
  - [ ] `checkout()`
- [ ] Implement `WorktreeService`
- [ ] Create worktree routes
- [ ] Write integration tests

**Deliverable:** Working `/api/worktrees` endpoints with git operations

#### 1.5 Agent Service & Routes (Basic)

- [ ] Implement `AgentService` (without process management)
  - [ ] `createAgent()`
  - [ ] `getAgent()`
  - [ ] `updateAgent()`
  - [ ] `deleteAgent()`
  - [ ] `forkAgent()`
  - [ ] `reorderAgents()`
- [ ] Create agent routes
- [ ] Write integration tests

**Deliverable:** Working `/api/agents` CRUD endpoints

#### 1.6 Error Handling

- [ ] Create custom error classes
- [ ] Implement global error handler
- [ ] Add request logging middleware
- [ ] Create error response formatter

**Deliverable:** Consistent error responses across API

### Acceptance Criteria

- [ ] All CRUD operations work for workspaces, worktrees, agents
- [ ] Git operations create/delete worktrees correctly
- [ ] Validation errors return 400 with details
- [ ] Not found errors return 404
- [ ] All endpoints have integration tests
- [ ] Code coverage > 80%

### API Endpoints Delivered

```
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/:id
DELETE /api/workspaces/:id

GET    /api/workspaces/:id/worktrees
POST   /api/workspaces/:id/worktrees
PUT    /api/workspaces/:id/worktrees/:id
DELETE /api/workspaces/:id/worktrees/:id
POST   /api/workspaces/:id/worktrees/:id/checkout

GET    /api/agents
POST   /api/agents
GET    /api/agents/:id
PUT    /api/agents/:id
DELETE /api/agents/:id
POST   /api/agents/:id/fork
PUT    /api/agents/reorder
```

---

## Phase 2: Process Management

### Objectives

- Integrate with Claude Code CLI
- Manage agent process lifecycle
- Handle process I/O streams

### Tasks

#### 2.1 Process Manager Core

- [ ] Create `ProcessManager` class
- [ ] Implement process spawning with `child_process.spawn`
- [ ] Handle stdin/stdout/stderr streams
- [ ] Implement process termination (graceful + force)
- [ ] Add process event emitter

**Deliverable:** Can spawn and manage child processes

#### 2.2 Claude CLI Integration

- [ ] Parse Claude CLI arguments for different modes
- [ ] Handle Claude CLI output parsing
- [ ] Detect agent status changes from output
- [ ] Extract context level from status output
- [ ] Handle session resumption

**Deliverable:** Claude CLI spawns with correct arguments

#### 2.3 Agent Lifecycle Management

- [ ] Connect `ProcessManager` to `AgentService`
- [ ] Implement `spawnAgent()` - spawn + update DB
- [ ] Implement `stopAgent()` - terminate + update DB
- [ ] Implement `sendMessage()` - write to stdin
- [ ] Handle process crashes/exits
- [ ] Clean up orphaned processes on startup

**Deliverable:** Full agent lifecycle management

#### 2.4 Message Handling

- [ ] Save messages to database on send
- [ ] Parse and save assistant responses
- [ ] Track token counts (if available)
- [ ] Implement message history retrieval
- [ ] Add pagination for message history

**Deliverable:** Persistent message history

#### 2.5 Agent Routes (Process Integration)

- [ ] Add `POST /api/agents/:id/start` (spawn)
- [ ] Add `POST /api/agents/:id/stop`
- [ ] Add `POST /api/agents/:id/message`
- [ ] Add `GET /api/agents/:id/messages`
- [ ] Update agent creation to optionally auto-start

**Deliverable:** API can control agent processes

### Acceptance Criteria

- [ ] Creating agent with `initialPrompt` starts process
- [ ] Sending message writes to agent stdin
- [ ] Stopping agent terminates process gracefully
- [ ] Crashed agents marked as error status
- [ ] Message history persists across restarts
- [ ] Server startup cleans orphaned processes

### Testing

- [ ] Unit tests with mocked child_process
- [ ] Integration tests with real Claude CLI (optional, manual)
- [ ] Process lifecycle tests

---

## Phase 3: Real-time Features

### Objectives

- Implement WebSocket server
- Stream agent output in real-time
- Sync workspace state across clients

### Tasks

#### 3.1 WebSocket Server Setup

- [ ] Configure @fastify/websocket
- [ ] Create WebSocket connection handler
- [ ] Implement client tracking
- [ ] Add heartbeat/ping-pong mechanism
- [ ] Handle client disconnection cleanup

**Deliverable:** WebSocket server accepts connections

#### 3.2 Subscription System

- [ ] Implement subscription messages
  - [ ] `subscribe:agent`
  - [ ] `unsubscribe:agent`
  - [ ] `subscribe:workspace`
  - [ ] `unsubscribe:workspace`
- [ ] Track subscriptions per client
- [ ] Add subscription validation

**Deliverable:** Clients can subscribe to updates

#### 3.3 Event Broadcasting

- [ ] Connect `ProcessManager` events to WebSocket
- [ ] Broadcast `agent:output` events
- [ ] Broadcast `agent:status` events
- [ ] Broadcast `agent:context` events
- [ ] Broadcast `agent:error` events
- [ ] Broadcast `workspace:updated` events

**Deliverable:** Real-time events reach subscribed clients

#### 3.4 Message Streaming

- [ ] Buffer output for batching
- [ ] Implement streaming flag for incomplete messages
- [ ] Handle large output efficiently
- [ ] Add message deduplication

**Deliverable:** Efficient streaming of agent output

#### 3.5 Usage Stats Updates

- [ ] Create `UsageService`
- [ ] Track API usage in database
- [ ] Broadcast usage updates via WebSocket
- [ ] Implement usage endpoint `GET /api/usage`

**Deliverable:** Real-time usage tracking

### Acceptance Criteria

- [ ] WebSocket connects at `/ws`
- [ ] Subscribing to agent receives its output
- [ ] Status changes broadcast to subscribers
- [ ] Multiple clients receive same updates
- [ ] Disconnected clients cleaned up properly
- [ ] Heartbeat keeps connection alive

### WebSocket Events Delivered

```
Client → Server:
  subscribe:agent
  unsubscribe:agent
  subscribe:workspace
  unsubscribe:workspace
  ping

Server → Client:
  agent:output
  agent:status
  agent:context
  agent:error
  agent:terminated
  workspace:updated
  usage:updated
  pong
```

---

## Phase 4: Frontend Integration

### Objectives

- Connect frontend to backend API
- Implement state management with React Query
- Integrate WebSocket for real-time updates

### Tasks

#### 4.1 API Client

- [ ] Create typed API client
- [ ] Configure base URL from environment
- [ ] Add request/response interceptors
- [ ] Handle authentication (if needed)
- [ ] Add error transformation

**Deliverable:** Type-safe API client

#### 4.2 React Query Integration

- [ ] Configure React Query client
- [ ] Create workspace queries
- [ ] Create worktree queries/mutations
- [ ] Create agent queries/mutations
- [ ] Create usage queries
- [ ] Add optimistic updates for mutations

**Deliverable:** Data fetching with caching

#### 4.3 Replace Mock Data

- [ ] Update `useWorkspace` to use React Query
- [ ] Replace mock workspace data
- [ ] Replace mock agent data
- [ ] Replace mock usage stats
- [ ] Remove mock data files

**Deliverable:** Frontend uses real API data

#### 4.4 WebSocket Integration

- [ ] Create WebSocket client wrapper
- [ ] Implement auto-reconnect logic
- [ ] Create subscription hooks
- [ ] Integrate with React Query cache updates
- [ ] Add connection status indicator

**Deliverable:** Real-time updates in UI

#### 4.5 Agent Modal Integration

- [ ] Connect chat to message API
- [ ] Stream agent output via WebSocket
- [ ] Update agent status in real-time
- [ ] Update context level in real-time
- [ ] Handle connection errors gracefully

**Deliverable:** Live agent interaction

#### 4.6 Component Updates

- [ ] Add loading states to components
- [ ] Add error states/boundaries
- [ ] Update `AgentBox` for real status
- [ ] Update `WorktreeRow` for real data
- [ ] Update `UsageBar` for real stats
- [ ] Add data-testid attributes for E2E

**Deliverable:** Polished component states

### Acceptance Criteria

- [ ] App loads workspace from API
- [ ] Creating worktree/agent calls API
- [ ] Agent status updates in real-time
- [ ] Chat messages appear as streamed
- [ ] Losing connection shows indicator
- [ ] Reconnection restores subscriptions
- [ ] No mock data remains in codebase

### Files to Update

```
src/
├── lib/
│   ├── api.ts           (new - API client)
│   └── websocket.ts     (new - WS client)
├── hooks/
│   ├── useWorkspace.ts  (rewrite)
│   ├── useAgents.ts     (new)
│   ├── useWebSocket.ts  (new)
│   └── useUsage.ts      (new)
├── components/
│   ├── AgentBox.tsx     (update)
│   ├── AgentModal.tsx   (update)
│   ├── WorktreeRow.tsx  (update)
│   └── UsageBar.tsx     (update)
└── pages/
    └── Index.tsx        (update)
```

---

## Phase 5: Testing & Polish

### Objectives

- Achieve comprehensive test coverage
- Fix bugs and edge cases
- Optimize performance

### Tasks

#### 5.1 E2E Test Suite

- [ ] Set up Playwright
- [ ] Write workspace management tests
- [ ] Write agent lifecycle tests
- [ ] Write worktree management tests
- [ ] Write drag-and-drop tests
- [ ] Add visual regression tests (optional)

**Deliverable:** E2E test coverage for critical paths

#### 5.2 Integration Test Completion

- [ ] WebSocket integration tests
- [ ] Full API integration tests
- [ ] Database migration tests
- [ ] Git operation tests

**Deliverable:** Backend integration test coverage > 70%

#### 5.3 Bug Fixes

- [ ] Fix identified issues from testing
- [ ] Handle edge cases (empty states, errors)
- [ ] Fix race conditions
- [ ] Address memory leaks

**Deliverable:** Stable application

#### 5.4 Performance Optimization

- [ ] Profile and optimize slow queries
- [ ] Add database indexes where needed
- [ ] Implement message batching
- [ ] Optimize React re-renders
- [ ] Add request debouncing

**Deliverable:** Responsive application

#### 5.5 Accessibility

- [ ] Add ARIA labels
- [ ] Ensure keyboard navigation
- [ ] Test with screen reader
- [ ] Add focus management

**Deliverable:** Accessible UI

### Acceptance Criteria

- [ ] E2E tests pass in CI
- [ ] No critical bugs in issue tracker
- [ ] Page load < 2 seconds
- [ ] WebSocket reconnects reliably
- [ ] No memory leaks in 24h run

---

## Phase 6: Production Ready

### Objectives

- Prepare for production deployment
- Complete documentation
- Set up monitoring

### Tasks

#### 6.1 Production Configuration

- [ ] Create production Dockerfile
- [ ] Set up docker-compose for deployment
- [ ] Configure production environment variables
- [ ] Set up HTTPS/TLS (if applicable)
- [ ] Configure CORS for production

**Deliverable:** Deployable containers

#### 6.2 Documentation

- [ ] Update README with installation
- [ ] Write user guide
- [ ] Document API (OpenAPI/Swagger)
- [ ] Add inline code documentation
- [ ] Create troubleshooting guide

**Deliverable:** Complete documentation

#### 6.3 Monitoring & Logging

- [ ] Add structured logging
- [ ] Create health check endpoints
- [ ] Add metrics collection (optional)
- [ ] Set up error tracking (optional)
- [ ] Create runbook for common issues

**Deliverable:** Observable application

#### 6.4 Release Process

- [ ] Set up semantic versioning
- [ ] Configure release workflow
- [ ] Create changelog generation
- [ ] Test release pipeline
- [ ] Tag v1.0.0

**Deliverable:** First production release

### Acceptance Criteria

- [ ] Application runs in Docker
- [ ] README includes quick start
- [ ] API documentation available
- [ ] Health endpoint returns status
- [ ] Release creates GitHub release

---

## Task Tracking Template

### Per-Task Checklist

```markdown
## Task: [Task Name]

**Phase:** X.Y
**Assignee:** TBD
**Status:** [ ] Not Started / [ ] In Progress / [ ] Review / [ ] Done

### Description

[Brief description of what needs to be done]

### Subtasks

- [ ] Subtask 1
- [ ] Subtask 2
- [ ] Subtask 3

### Acceptance Criteria

- [ ] Criteria 1
- [ ] Criteria 2

### Files Changed

- `path/to/file.ts`

### Testing

- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing

### Notes

[Any additional context or decisions]
```

---

## Risk Mitigation

### Technical Risks

| Risk                          | Impact | Mitigation                             |
| ----------------------------- | ------ | -------------------------------------- |
| Claude CLI API changes        | High   | Abstract CLI interaction, version pin  |
| SQLite limitations            | Medium | Design for future PostgreSQL migration |
| WebSocket scaling             | Medium | Document single-user limitation        |
| Process management complexity | High   | Comprehensive error handling, logging  |

### Schedule Risks

| Risk               | Impact | Mitigation                            |
| ------------------ | ------ | ------------------------------------- |
| Scope creep        | High   | Strict phase boundaries, MVP focus    |
| Integration issues | Medium | Early integration testing             |
| Testing delays     | Medium | TDD approach, concurrent test writing |

---

## Success Metrics

### Phase Completion Criteria

| Phase | Key Metric                | Target |
| ----- | ------------------------- | ------ |
| 0     | CI pipeline green         | 100%   |
| 1     | API endpoints working     | 100%   |
| 2     | Agent can run commands    | Yes    |
| 3     | Real-time updates work    | Yes    |
| 4     | Frontend fully integrated | Yes    |
| 5     | Test coverage             | > 80%  |
| 6     | Deployed and documented   | Yes    |

### Quality Metrics

| Metric                     | Target |
| -------------------------- | ------ |
| Unit test coverage         | > 80%  |
| Integration test coverage  | > 70%  |
| E2E critical path coverage | 100%   |
| Zero critical bugs         | Yes    |
| Documentation complete     | Yes    |

---

## Appendix: Dependency Graph

```
Phase 0 ──────────────────────────────────────────┐
   │                                              │
   ▼                                              │
Phase 1 ──────────────────────────────────────────┤
   │                                              │
   ├─────────────────────┐                        │
   ▼                     ▼                        │
Phase 2              Phase 3                      │
   │                     │                        │
   └──────────┬──────────┘                        │
              ▼                                   │
           Phase 4 ◀──────────────────────────────┘
              │
              ▼
           Phase 5
              │
              ▼
           Phase 6
```

Phases 2 and 3 can be worked on in parallel after Phase 1 is complete.
