# Claude Manager

A GUI application for managing Claude Code CLI agents across git worktrees.

## Project Overview

Claude Manager provides a visual interface to:

- Manage git workspaces with multiple worktrees
- Spawn, monitor, and interact with Claude Code CLI agents
- Track agent status (running/waiting/error/finished) and context usage
- Configure agent modes (auto-approve/plan/regular) and permissions
- View API usage statistics

**Current State**: Frontend prototype with mock data. Backend implementation documented in `docs/`.

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
- **State**: React hooks + React Query (installed, integration pending)
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React

### Backend (Planned)

- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify 4.x
- **Database**: SQLite (better-sqlite3)
- **Real-time**: @fastify/websocket
- **Git**: simple-git
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
│   │   ├── Toolbar.tsx            # Top navigation bar
│   │   ├── WorktreeRow.tsx        # Worktree container with agents
│   │   ├── AgentBox.tsx           # Individual agent card
│   │   ├── AgentModal.tsx         # Agent interaction dialog
│   │   ├── AddWorktreeDialog.tsx
│   │   ├── SettingsDialog.tsx
│   │   ├── UsageBar.tsx           # API usage display
│   │   └── ui/                    # shadcn/ui components (40+)
│   ├── hooks/
│   │   ├── useWorkspace.ts        # Workspace/agent state (mock data)
│   │   └── useTheme.ts            # Light/dark theme toggle
│   ├── types/
│   │   └── agent.ts               # TypeScript interfaces
│   └── lib/
│       └── utils.ts               # Tailwind merge utilities
│
├── server/                        # Backend (to be implemented)
│   └── (see docs/01-architecture-overview.md)
│
└── shared/                        # Shared types (to be created)
    └── types.ts
```

## Key Frontend Files

| File                             | Purpose                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `src/hooks/useWorkspace.ts`      | State management for workspace, worktrees, agents (currently mock data) |
| `src/types/agent.ts`             | Core type definitions: Agent, Worktree, Workspace, UsageStats           |
| `src/components/AgentBox.tsx`    | Agent card with status, context level, mode/permission controls         |
| `src/components/WorktreeRow.tsx` | Worktree container with drag-drop, sorting, agent management            |
| `src/pages/Index.tsx`            | Main page orchestrating all components                                  |

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

| Component                      | Status         | Documentation                                        |
| ------------------------------ | -------------- | ---------------------------------------------------- |
| Frontend UI                    | ✅ Complete    | -                                                    |
| Frontend State (mock)          | ✅ Complete    | -                                                    |
| Backend API (Phase 0-1)        | ✅ Complete    | [API Spec](docs/02-api-specification.md)             |
| Database                       | ✅ Complete    | [Schema](docs/03-database-schema.md)                 |
| Process Management (Phase 2)   | ✅ Complete    | [Implementation](docs/04-backend-implementation.md)  |
| WebSocket (Phase 3)            | ✅ Complete    | [API Spec](docs/02-api-specification.md)             |
| Frontend Integration (Phase 4) | ⏳ Planned     | [Integration Guide](docs/08-frontend-integration.md) |
| CI/CD                          | ✅ Complete    | [Pipeline](docs/06-ci-cd-pipeline.md)                |
| Testing                        | ✅ In Progress | [Strategy](docs/05-testing-strategy.md)              |

**Backend Test Coverage:** 175 tests passing (unit + integration)

## Component Hierarchy

```
App (QueryClient, Router, Tooltips)
└── Index (useWorkspace, useTheme)
    ├── Toolbar (theme toggle, workspace selector)
    ├── WorktreeRow[] (per worktree)
    │   └── AgentBox[] (draggable agent cards)
    ├── UsageBar (API usage stats)
    ├── AgentModal (agent chat interface)
    ├── AddWorktreeDialog
    └── SettingsDialog
```

## Agent Status Colors

- **Running** (green): Agent actively processing
- **Waiting** (yellow/orange): Awaiting user input
- **Error** (red): Agent encountered an error
- **Finished** (gray): Agent completed
