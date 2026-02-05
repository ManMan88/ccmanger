# Claude Manager

A GUI application for managing Claude Code CLI agents across git worktrees.

## Project Overview

Claude Manager provides a visual interface to:

- Manage git workspaces with multiple worktrees
- Spawn, monitor, and interact with Claude Code CLI agents
- Track agent status (running/waiting/error/finished) and context usage
- Configure agent modes (auto-approve/plan/regular) and permissions
- View API usage statistics

**Current State**: Full-stack application with React Query, WebSocket real-time updates, and backend API integration complete (Phases 0-4). Backend running with 175+ tests passing.

## Documentation

Comprehensive technical documentation is available in the `docs/` directory:

| Document                                                               | Description                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| [docs/README.md](docs/README.md)                                       | Documentation index and quick start              |
| [docs/01-architecture-overview.md](docs/01-architecture-overview.md)   | System architecture, tech stack, design patterns |
| [docs/02-api-specification.md](docs/02-api-specification.md)           | REST API & WebSocket specification               |
| [docs/03-database-schema.md](docs/03-database-schema.md)               | SQLite schema and migrations                     |
| [docs/04-backend-implementation.md](docs/04-backend-implementation.md) | Service layer implementation guide               |
| [docs/05-testing-strategy.md](docs/05-testing-strategy.md)             | Unit, integration, and E2E testing               |
| [docs/06-ci-cd-pipeline.md](docs/06-ci-cd-pipeline.md)                 | GitHub Actions and Docker setup                  |
| [docs/07-implementation-phases.md](docs/07-implementation-phases.md)   | Phased delivery plan (7 phases)                  |
| [docs/08-frontend-integration.md](docs/08-frontend-integration.md)     | React Query and WebSocket integration            |

## Tech Stack

### Frontend (Implemented)

- **Framework**: React 18.3 + TypeScript
- **Build Tool**: Vite 5.4
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (Radix primitives)
- **State**: React Query (TanStack Query) for server state
- **Real-time**: WebSocket client with auto-reconnect
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React

### Backend (Implemented)

- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify 4.x
- **Database**: SQLite (better-sqlite3)
- **Real-time**: @fastify/websocket
- **Git**: simple-git
- **Process Management**: child_process for Claude CLI
- **Validation**: Zod

## Project Structure

```
claude-manager/
├── docs/                          # Technical documentation
│   ├── README.md                  # Documentation index
│   ├── 01-architecture-overview.md
│   ├── 02-api-specification.md
│   ├── 03-database-schema.md
│   ├── 04-backend-implementation.md
│   ├── 05-testing-strategy.md
│   ├── 06-ci-cd-pipeline.md
│   ├── 07-implementation-phases.md
│   └── 08-frontend-integration.md
│
├── src/                           # Frontend source
│   ├── pages/
│   │   └── Index.tsx              # Main dashboard page
│   ├── components/
│   │   ├── Toolbar.tsx            # Top navigation bar with connection status
│   │   ├── WorktreeRow.tsx        # Worktree container with agents
│   │   ├── AgentBox.tsx           # Individual agent card
│   │   ├── AgentModal.tsx         # Agent interaction dialog with real-time chat
│   │   ├── AddWorktreeDialog.tsx
│   │   ├── SettingsDialog.tsx
│   │   ├── UsageBar.tsx           # API usage display
│   │   └── ui/                    # shadcn/ui components (40+)
│   ├── hooks/
│   │   ├── useWorkspace.ts        # Workspace state with React Query
│   │   ├── useAgents.ts           # Agent queries and mutations
│   │   ├── useUsage.ts            # Usage statistics
│   │   ├── useWebSocket.ts        # WebSocket connection hooks
│   │   └── useTheme.ts            # Light/dark theme toggle
│   ├── lib/
│   │   ├── api.ts                 # Typed API client
│   │   ├── queryClient.ts         # React Query configuration
│   │   ├── queryKeys.ts           # Query key factory
│   │   ├── websocket.ts           # WebSocket client
│   │   └── utils.ts               # Tailwind merge utilities
│   └── types/
│       └── agent.ts               # Frontend-specific type aliases
│
├── server/                        # Backend (implemented)
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

## Key Frontend Files

| File                             | Purpose                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `src/lib/api.ts`                 | Typed API client for all REST endpoints                          |
| `src/lib/websocket.ts`           | WebSocket client with auto-reconnect and subscription management |
| `src/hooks/useWorkspace.ts`      | React Query hooks for workspace state management                 |
| `src/hooks/useAgents.ts`         | React Query hooks for agent CRUD and process control             |
| `src/hooks/useWebSocket.ts`      | Hooks for WebSocket connection and subscriptions                 |
| `src/components/AgentBox.tsx`    | Agent card with status, context level, mode/permission controls  |
| `src/components/AgentModal.tsx`  | Agent interaction dialog with real-time message streaming        |
| `src/components/WorktreeRow.tsx` | Worktree container with drag-drop, sorting, agent management     |
| `src/pages/Index.tsx`            | Main page with loading/error states and WebSocket integration    |

## Development Commands

```bash
# Frontend
npm install          # Install dependencies
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run test         # Run tests (Vitest)
npm run lint         # ESLint check

# Backend (after implementation)
cd server
npm run dev          # Start dev server (port 3001)
npm run test         # Run backend tests
npm run migrate      # Run database migrations
```

## Type Definitions

Core types in `src/types/agent.ts`:

```typescript
interface Agent {
  id: string
  name: string
  status: 'running' | 'waiting' | 'error' | 'finished'
  contextLevel: number // 0-100 percentage
  mode: 'auto' | 'plan' | 'regular'
  permissions: string[] // ['read', 'write', 'execute']
  worktreeId: string
  createdAt: Date
  order: number
}

interface Worktree {
  id: string
  name: string
  branch: string
  path: string
  agents: Agent[]
  previousAgents: Agent[] // Deleted agents for history
  sortMode: 'free' | 'status' | 'name'
  order: number
}
```

## Architecture Overview

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

See [docs/01-architecture-overview.md](docs/01-architecture-overview.md) for detailed architecture documentation.

## Implementation Status

| Component                      | Status      | Documentation                                        |
| ------------------------------ | ----------- | ---------------------------------------------------- |
| Frontend UI                    | ✅ Complete | -                                                    |
| Frontend Integration (Phase 4) | ✅ Complete | [Integration Guide](docs/08-frontend-integration.md) |
| Backend API (Phase 0-1)        | ✅ Complete | [API Spec](docs/02-api-specification.md)             |
| Database                       | ✅ Complete | [Schema](docs/03-database-schema.md)                 |
| Process Management (Phase 2)   | ✅ Complete | [Implementation](docs/04-backend-implementation.md)  |
| WebSocket (Phase 3)            | ✅ Complete | [API Spec](docs/02-api-specification.md)             |
| CI/CD                          | ✅ Complete | [Pipeline](docs/06-ci-cd-pipeline.md)                |
| Testing                        | ✅ Complete | [Strategy](docs/05-testing-strategy.md)              |

**Backend Test Coverage:** 175 tests passing (unit + integration)

### Phase 4 Integration Details

- **API Client**: Typed client with error handling in `src/lib/api.ts`
- **React Query**: Full integration with optimistic updates and cache invalidation
- **WebSocket**: Auto-reconnect, subscriptions, real-time cache updates
- **Components**: Loading states, error boundaries, data-testid attributes

## Component Hierarchy

```
App (QueryClient, Router, Tooltips)
└── Index (useWorkspace, useUsage, useWebSocket)
    ├── Toolbar (theme toggle, workspace selector, connection status)
    ├── WorktreeRow[] (per worktree)
    │   └── AgentBox[] (draggable agent cards with real-time status)
    ├── UsageBar (real-time API usage stats)
    ├── AgentModal (agent chat with message streaming)
    ├── AddWorktreeDialog
    └── SettingsDialog
```

## Agent Status Colors

- **Running** (green): Agent actively processing
- **Waiting** (yellow/orange): Awaiting user input
- **Error** (red): Agent encountered an error
- **Finished** (gray): Agent completed
