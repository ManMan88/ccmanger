# Architecture Overview

## Executive Summary

Claude Manager is a GUI application for managing Claude Code CLI agents across git worktrees. This document outlines the complete system architecture for the backend implementation that will power the currently frontend-only prototype.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  React 18 + TypeScript + Vite                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Toolbar   │  │ WorktreeRow │  │  AgentBox   │  │ AgentModal  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  State: React Query + WebSocket subscriptions                           │
└─────────────────────────────────────────────────────────────────────────┘
                            │ REST API          │ WebSocket
                            ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Fastify Server (Node.js + TypeScript)                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Routes: /api/workspace, /api/worktrees, /api/agents, /api/usage │   │
│  │ WebSocket: /ws/agents/:id, /ws/workspace/:id                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ Auth Middle  │  │ Rate Limiter │  │ CORS Handler │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SERVICE LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ WorkspaceService│  │ WorktreeService │  │  AgentService   │         │
│  │ - CRUD ops      │  │ - Git operations│  │ - Lifecycle     │         │
│  │ - Persistence   │  │ - Branch mgmt   │  │ - Process mgmt  │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  GitService     │  │ ProcessManager  │  │  UsageService   │         │
│  │ - simple-git    │  │ - spawn/kill    │  │ - Track API use │         │
│  │ - Worktree ops  │  │ - stdio streams │  │ - Rate limits   │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    SQLite (better-sqlite3)                       │   │
│  │  Tables: workspaces, worktrees, agents, messages, usage_stats   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    File System                                   │   │
│  │  - Git repositories                                              │   │
│  │  - Agent session logs                                            │   │
│  │  - Configuration files (~/.claude-manager/)                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SYSTEMS                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  Claude Code    │  │   Git CLI       │  │  Anthropic API  │         │
│  │  CLI Process    │  │   Operations    │  │  (optional)     │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Backend Core
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | Node.js | 20 LTS | JavaScript runtime |
| Language | TypeScript | 5.x | Type safety |
| Framework | Fastify | 4.x | HTTP server |
| WebSocket | @fastify/websocket | 8.x | Real-time communication |
| Validation | Zod | 3.x | Schema validation |

### Data & Storage
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Database | SQLite | 3.x | Persistent storage |
| DB Client | better-sqlite3 | 9.x | Synchronous SQLite |
| Migrations | Custom | - | Schema versioning |
| File Storage | Node fs | - | Logs, configs |

### Git & Process Management
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Git Operations | simple-git | 3.x | Git command wrapper |
| Process Management | Node child_process | - | Spawn Claude CLI |
| PTY Support | node-pty | 1.x | Terminal emulation |

### Claude Integration
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| CLI | claude-code | latest | Primary agent runner |
| API SDK | @anthropic-ai/sdk | 0.x | Direct API (optional) |

### Testing & Quality
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Test Runner | Vitest | 3.x | Unit & integration tests |
| HTTP Testing | Supertest | 6.x | API testing |
| Mocking | Vitest mocks | - | Dependency mocking |
| Coverage | c8 | 8.x | Code coverage |

### DevOps
| Component | Technology | Purpose |
|-----------|------------|---------|
| CI/CD | GitHub Actions | Automated testing/deployment |
| Linting | ESLint + Prettier | Code quality |
| Container | Docker | Deployment packaging |
| Process Manager | PM2 | Production process management |

## Directory Structure

```
claude-manager/
├── docs/                          # Documentation (this directory)
│   ├── 01-architecture-overview.md
│   ├── 02-api-specification.md
│   ├── 03-database-schema.md
│   ├── 04-backend-implementation.md
│   ├── 05-testing-strategy.md
│   ├── 06-ci-cd-pipeline.md
│   ├── 07-implementation-phases.md
│   └── 08-frontend-integration.md
│
├── src/                           # Frontend (existing)
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── types/
│   └── lib/
│
├── server/                        # Backend (new)
│   ├── src/
│   │   ├── index.ts              # Entry point
│   │   ├── app.ts                # Fastify app setup
│   │   ├── config/
│   │   │   ├── index.ts          # Config loader
│   │   │   └── env.ts            # Environment validation
│   │   ├── routes/
│   │   │   ├── index.ts          # Route registration
│   │   │   ├── workspace.ts      # Workspace endpoints
│   │   │   ├── worktree.ts       # Worktree endpoints
│   │   │   ├── agent.ts          # Agent endpoints
│   │   │   └── usage.ts          # Usage stats endpoints
│   │   ├── services/
│   │   │   ├── workspace.service.ts
│   │   │   ├── worktree.service.ts
│   │   │   ├── agent.service.ts
│   │   │   ├── git.service.ts
│   │   │   ├── process.service.ts
│   │   │   └── usage.service.ts
│   │   ├── websocket/
│   │   │   ├── index.ts          # WebSocket setup
│   │   │   ├── agent-stream.ts   # Agent output streaming
│   │   │   └── workspace-sync.ts # Workspace state sync
│   │   ├── db/
│   │   │   ├── index.ts          # Database connection
│   │   │   ├── schema.ts         # Table definitions
│   │   │   ├── migrations/       # Schema migrations
│   │   │   └── repositories/     # Data access layer
│   │   ├── types/
│   │   │   ├── index.ts          # Type exports
│   │   │   └── api.ts            # API-specific types
│   │   ├── utils/
│   │   │   ├── logger.ts         # Logging utility
│   │   │   ├── errors.ts         # Error classes
│   │   │   └── validation.ts     # Zod schemas
│   │   └── middleware/
│   │       ├── auth.ts           # Authentication (future)
│   │       ├── error-handler.ts  # Global error handling
│   │       └── request-logger.ts # Request logging
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── shared/                        # Shared types between frontend/backend
│   └── types.ts
│
├── .github/
│   └── workflows/
│       ├── ci.yml                # Continuous integration
│       ├── cd.yml                # Continuous deployment
│       └── test.yml              # Test workflow
│
├── docker/
│   ├── Dockerfile.server         # Backend container
│   ├── Dockerfile.frontend       # Frontend container
│   └── docker-compose.yml        # Full stack compose
│
└── scripts/
    ├── setup.sh                  # Development setup
    ├── migrate.ts                # Database migrations
    └── seed.ts                   # Test data seeding
```

## Core Design Patterns

### 1. Repository Pattern
Data access is abstracted through repository classes, isolating database operations from business logic.

```typescript
// server/src/db/repositories/agent.repository.ts
interface AgentRepository {
  findById(id: string): Agent | null
  findByWorktreeId(worktreeId: string): Agent[]
  create(agent: CreateAgentDto): Agent
  update(id: string, updates: UpdateAgentDto): Agent
  delete(id: string): void
}
```

### 2. Service Layer Pattern
Business logic resides in service classes, keeping routes thin and testable.

```typescript
// server/src/services/agent.service.ts
class AgentService {
  constructor(
    private agentRepo: AgentRepository,
    private processManager: ProcessManager,
    private eventEmitter: EventEmitter
  ) {}

  async spawnAgent(worktreeId: string, options: SpawnOptions): Promise<Agent>
  async stopAgent(agentId: string): Promise<void>
  async sendMessage(agentId: string, message: string): Promise<void>
}
```

### 3. Event-Driven Architecture
Process events are handled through an event emitter for loose coupling.

```typescript
// Events emitted by ProcessManager
agentManager.on('agent:output', (agentId, data) => {})
agentManager.on('agent:status-change', (agentId, status) => {})
agentManager.on('agent:error', (agentId, error) => {})
agentManager.on('agent:exit', (agentId, code) => {})
```

### 4. WebSocket Pub/Sub
Real-time updates use a pub/sub model for scalable client communication.

```typescript
// WebSocket channels
/ws/agents/:agentId      // Subscribe to agent output
/ws/workspace/:workspaceId  // Subscribe to workspace changes
```

## Data Flow Diagrams

### Agent Lifecycle

```
┌──────────┐     POST /agents      ┌──────────┐
│  Client  │ ──────────────────────▶│  Server  │
└──────────┘                        └──────────┘
     │                                    │
     │                                    ▼
     │                            ┌──────────────┐
     │                            │ AgentService │
     │                            └──────────────┘
     │                                    │
     │                                    ▼
     │                            ┌──────────────┐
     │                            │ProcessManager│
     │                            └──────────────┘
     │                                    │
     │                         spawn('claude', args)
     │                                    ▼
     │                            ┌──────────────┐
     │                            │ Claude CLI   │
     │                            │   Process    │
     │                            └──────────────┘
     │                                    │
     │◀──────────────────────────────────┘
     │        WebSocket: agent:output
     │
     │       PUT /agents/:id/message
     │────────────────────────────────────▶
     │                                    │
     │                            stdin.write(msg)
     │                                    │
     │◀──────────────────────────────────┘
     │        WebSocket: agent:output
```

### Git Operations

```
┌──────────┐  POST /worktrees/:id/checkout  ┌──────────┐
│  Client  │ ───────────────────────────────▶│  Server  │
└──────────┘                                 └──────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │WorktreeService│
                                          └──────────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  GitService  │
                                          └──────────────┘
                                                  │
                                    git.checkout(branch)
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  simple-git  │
                                          └──────────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │    Git CLI   │
                                          └──────────────┘
```

## Security Considerations

### 1. Process Isolation
- Each Claude CLI process runs with restricted permissions
- Agents cannot access files outside their worktree
- Process resource limits (memory, CPU time)

### 2. Input Validation
- All API inputs validated with Zod schemas
- Path traversal prevention for file operations
- Command injection prevention for git operations

### 3. Authentication (Future)
- Local-only by default (no auth required)
- Optional API key authentication for remote access
- Session-based auth for multi-user scenarios

### 4. Data Protection
- SQLite database file permissions (600)
- No sensitive data in logs
- Secure credential storage for API keys

## Performance Considerations

### 1. Database
- SQLite for simplicity and performance
- Synchronous operations (better-sqlite3)
- Indexed queries on frequently accessed fields
- Connection pooling not needed (single process)

### 2. Process Management
- Lazy process spawning (on-demand)
- Process pooling for frequent operations
- Output buffering to reduce WebSocket messages
- Memory-mapped I/O for large outputs

### 3. WebSocket
- Message batching for high-frequency updates
- Heartbeat/ping-pong for connection health
- Automatic reconnection handling
- Client-side message deduplication

## Scalability Notes

### Current Scope (Single User)
- Single process Node.js server
- SQLite database
- Local file system
- Local git repositories

### Future Expansion (Multi-User)
- PostgreSQL for multi-process support
- Redis for pub/sub and caching
- S3/MinIO for log storage
- Kubernetes for container orchestration

## Related Documents

- [02-api-specification.md](./02-api-specification.md) - REST API details
- [03-database-schema.md](./03-database-schema.md) - Database design
- [04-backend-implementation.md](./04-backend-implementation.md) - Implementation guide
- [05-testing-strategy.md](./05-testing-strategy.md) - Testing approach
- [06-ci-cd-pipeline.md](./06-ci-cd-pipeline.md) - CI/CD setup
- [07-implementation-phases.md](./07-implementation-phases.md) - Project phases
- [08-frontend-integration.md](./08-frontend-integration.md) - Frontend integration
