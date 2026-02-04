---
name: project-context
description: Load Claude Manager project context and documentation. Use when starting a new session, needing to understand the project, or refreshing knowledge about architecture and conventions. Triggers on "what is this project", "explain the architecture", "how does X work", or at the start of development sessions.
user-invocable: true
allowed-tools:
  - Read
  - Glob
---

# Claude Manager Project Context

Quick reference for understanding the Claude Manager project.

## Project Overview

Claude Manager is a GUI for managing Claude Code CLI agents across git worktrees.

**Current State:** Frontend complete with mock data. Backend documented, not yet implemented.

## Key Documentation

| Document | When to Read |
|----------|--------------|
| `CLAUDE.md` | Project overview, structure, commands |
| `docs/01-architecture-overview.md` | System design, tech stack |
| `docs/02-api-specification.md` | REST & WebSocket API contracts |
| `docs/03-database-schema.md` | SQLite schema, migrations |
| `docs/04-backend-implementation.md` | Service layer patterns |
| `docs/05-testing-strategy.md` | Test patterns, coverage |
| `docs/06-ci-cd-pipeline.md` | GitHub Actions, Docker |
| `docs/07-implementation-phases.md` | Task breakdown, phases |
| `docs/08-frontend-integration.md` | React Query, WebSocket |

## Tech Stack

**Frontend:**
- React 18.3 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- React Query (integration pending)

**Backend (Planned):**
- Node.js 20 + Fastify
- SQLite (better-sqlite3)
- simple-git + child_process

## Directory Structure

```
claude-manager/
├── src/                 # Frontend React code
│   ├── components/      # UI components
│   ├── hooks/           # React hooks (useWorkspace, etc.)
│   ├── pages/           # Page components
│   └── types/           # TypeScript types
├── server/              # Backend (to implement)
│   ├── src/routes/      # API endpoints
│   ├── src/services/    # Business logic
│   └── src/db/          # Database layer
├── shared/              # Shared types
└── docs/                # Technical documentation
```

## Core Concepts

### Agent
A Claude Code CLI process with:
- Status: running | waiting | error | finished
- Mode: auto | plan | regular
- Permissions: read | write | execute
- Context level: 0-100%

### Worktree
A git worktree containing:
- Multiple agents
- Sort mode: free | status | name
- Branch information

### Workspace
A git repository with multiple worktrees.

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useWorkspace.ts` | Frontend state (mock data) |
| `src/types/agent.ts` | Type definitions |
| `src/components/AgentBox.tsx` | Agent card component |
| `src/components/AgentModal.tsx` | Chat interface |

## Commands

```bash
npm run dev          # Start frontend (port 8080)
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Check linting
```

## Implementation Status

- [x] Frontend UI complete
- [x] Documentation complete
- [ ] Backend API
- [ ] Database
- [ ] Process management
- [ ] WebSocket
- [ ] Frontend integration
- [ ] CI/CD
