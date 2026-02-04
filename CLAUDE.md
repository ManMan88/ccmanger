# Claude Manager

A GUI application for managing Claude Code CLI agents across git worktrees.

## Project Overview

Claude Manager provides a visual interface to:
- Manage git workspaces with multiple worktrees
- Spawn, monitor, and interact with Claude Code CLI agents
- Track agent status (running/waiting/error/finished) and context usage
- Configure agent modes (auto-approve/plan/regular) and permissions
- View API usage statistics

**Current State**: Frontend prototype with mock data. Backend integration pending.

## Tech Stack

- **Framework**: React 18.3 + TypeScript
- **Build Tool**: Vite 5.4
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (Radix primitives)
- **State**: React hooks + React Query
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React

## Project Structure

```
src/
├── pages/
│   └── Index.tsx           # Main dashboard page
├── components/
│   ├── Toolbar.tsx         # Top navigation bar
│   ├── WorktreeRow.tsx     # Worktree container with agents
│   ├── AgentBox.tsx        # Individual agent card
│   ├── AgentModal.tsx      # Agent interaction dialog
│   ├── AddWorktreeDialog.tsx
│   ├── SettingsDialog.tsx
│   ├── UsageBar.tsx        # API usage display
│   └── ui/                 # shadcn/ui components (40+)
├── hooks/
│   ├── useWorkspace.ts     # Workspace/agent state management
│   └── useTheme.ts         # Light/dark theme toggle
├── types/
│   └── agent.ts            # TypeScript interfaces
└── lib/
    └── utils.ts            # Tailwind merge utilities
```

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useWorkspace.ts` | State management for workspace, worktrees, agents (currently mock data) |
| `src/types/agent.ts` | Core type definitions: Agent, Worktree, Workspace, UsageStats |
| `src/components/AgentBox.tsx` | Agent card with status, context level, mode/permission controls |
| `src/components/WorktreeRow.tsx` | Worktree container with drag-drop, sorting, agent management |
| `src/pages/Index.tsx` | Main page orchestrating all components |

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run test         # Run tests (Vitest)
npm run lint         # ESLint check
```

## Type Definitions

Core types in `src/types/agent.ts`:

```typescript
interface Agent {
  id: string;
  name: string;
  status: 'running' | 'waiting' | 'error' | 'finished';
  contextLevel: number;  // 0-100 percentage
  mode: 'auto' | 'plan' | 'regular';
  permissions: string[];  // ['read', 'write', 'execute']
  worktreeId: string;
  createdAt: Date;
  order: number;
}

interface Worktree {
  id: string;
  name: string;
  branch: string;
  path: string;
  agents: Agent[];
  previousAgents: Agent[];  // Deleted agents for history
  sortMode: 'free' | 'status' | 'name';
  order: number;
}
```

## Architecture Notes

### Current Architecture (Frontend Only)
- All state is in-memory using React hooks
- Mock data in `useWorkspace.ts` simulates backend
- No persistence - data lost on refresh
- No actual Claude CLI integration

### Planned Backend: Tauri (Rust)

Recommended stack based on related `worktree_viewer` project:

```
src-tauri/
├── src/
│   ├── commands/
│   │   ├── agent.rs      # Claude CLI process spawning
│   │   ├── workspace.rs  # Workspace management
│   │   └── git.rs        # Git worktree operations
│   └── agent/
│       ├── process.rs    # Process lifecycle management
│       └── store.rs      # Agent persistence (SQLite)
```

Key capabilities needed:
- **Process Management**: Spawn/stop Claude CLI agents, stream output
- **Git Operations**: Worktree add/remove, branch checkout
- **IPC**: Real-time bidirectional communication via Tauri events
- **Persistence**: Store agent history, settings

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
