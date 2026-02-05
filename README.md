# Claude Manager

[![CI](https://github.com/ManMan88/ccmanger/actions/workflows/ci.yml/badge.svg)](https://github.com/ManMan88/ccmanger/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E%20Tests-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)

A desktop application for managing Claude Code CLI agents across git worktrees.

## Features

- **Multi-Worktree Support**: Manage multiple git worktrees in a single workspace
- **Agent Management**: Spawn, stop, resume, and fork Claude Code agents
- **Real-time Status**: Visual indicators for agent status (running/waiting/error/finished)
- **Context Tracking**: Monitor agent context usage with percentage display
- **Mode Control**: Switch between auto-approve, plan, and regular modes
- **Permission Management**: Configure read/write/execute permissions per agent
- **Drag & Drop**: Reorder agents and worktrees with drag-and-drop
- **Agent History**: Restore previously deleted agents from history
- **Usage Statistics**: Track daily/weekly API usage with visual progress bars
- **Dark Mode**: Toggle between light and dark themes

## Tech Stack

| Category   | Technology                   |
| ---------- | ---------------------------- |
| Framework  | React 18 + TypeScript        |
| Build Tool | Vite                         |
| Styling    | Tailwind CSS                 |
| Components | shadcn/ui (Radix primitives) |
| State      | React Hooks + React Query    |
| Forms      | React Hook Form + Zod        |
| Icons      | Lucide React                 |

## Getting Started

### Prerequisites

- Node.js 20+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/ManMan88/ccmanger.git
cd ccmanger

# Install dependencies
pnpm install

# Start development server (frontend + backend)
pnpm dev:all
```

The app will be available at `http://localhost:8080`.

### Available Scripts

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `pnpm dev`        | Start frontend development server |
| `pnpm dev:server` | Start backend development server  |
| `pnpm dev:all`    | Start both frontend and backend   |
| `pnpm build`      | Create production build           |
| `pnpm test`       | Run frontend tests with Vitest    |
| `pnpm test:e2e`   | Run E2E tests with Playwright     |
| `pnpm lint`       | Run ESLint                        |

## Project Structure

```
claude_manager/
├── src/
│   ├── pages/              # Page components
│   │   └── Index.tsx       # Main dashboard
│   ├── components/         # React components
│   │   ├── Toolbar.tsx     # Navigation bar
│   │   ├── WorktreeRow.tsx # Worktree container
│   │   ├── AgentBox.tsx    # Agent card
│   │   ├── AgentModal.tsx  # Agent interaction dialog
│   │   ├── UsageBar.tsx    # Usage statistics
│   │   └── ui/             # shadcn/ui components
│   ├── hooks/              # Custom React hooks
│   │   ├── useWorkspace.ts # State management
│   │   └── useTheme.ts     # Theme toggle
│   ├── types/              # TypeScript types
│   │   └── agent.ts        # Core data models
│   └── lib/                # Utilities
├── public/                 # Static assets
├── index.html              # Entry HTML
├── vite.config.ts          # Vite configuration
├── tailwind.config.ts      # Tailwind configuration
└── package.json
```

## Architecture

### Current State

The application is a **full-stack application** with React frontend and Fastify backend. Features include:

- Real-time updates via WebSocket
- SQLite database for persistence
- React Query for server state management
- 175+ backend tests passing

### Tech Stack: Node.js + Fastify

The backend stack is **Node.js + TypeScript** with the following technologies:

| Requirement             | Solution                                            |
| ----------------------- | --------------------------------------------------- |
| Framework               | Fastify (faster than Express, excellent TS support) |
| Git Operations          | `simple-git` library                                |
| Claude CLI Integration  | `child_process.spawn()` with streaming              |
| Real-time Communication | WebSocket via `@fastify/websocket`                  |
| Claude API              | Official `@anthropic-ai/sdk`                        |
| Data Persistence        | SQLite via `better-sqlite3` or PostgreSQL           |

**Why Node.js:**

- **Shared TypeScript types** between frontend and backend
- **Official Anthropic SDK** with streaming support
- **React Query integration** works naturally with REST endpoints
- **Fast iteration** - same language, instant reload
- **Excellent WebSocket support** for real-time agent updates

### Backend Architecture (Implemented)

```
server/
├── src/
│   ├── routes/
│   │   ├── workspace.ts    # Workspace CRUD endpoints
│   │   ├── worktree.ts     # Worktree management + git ops
│   │   └── agent.ts        # Agent lifecycle + WebSocket
│   ├── services/
│   │   ├── git.ts          # Git operations (simple-git)
│   │   ├── agent-process.ts # Claude CLI process spawning
│   │   └── claude-api.ts   # Anthropic SDK integration
│   ├── db/
│   │   └── schema.ts       # Database schema
│   └── index.ts            # Fastify server entry
├── shared/
│   └── types.ts            # Shared types (frontend + backend)
└── package.json
```

### Frontend-Backend Integration

The frontend is fully integrated with the backend:

- `useWorkspace.ts` - React Query hooks with REST API calls
- `useAgents.ts` - Agent CRUD operations with optimistic updates
- `AgentModal.tsx` - Real-time chat via WebSocket streams
- `WorktreeRow.tsx` - Git operations via API endpoints
- `UsageBar.tsx` - Live usage statistics from backend

## Usage

### Managing Worktrees

1. Click **"+ Add Worktree"** to create a new worktree
2. Enter the worktree name and branch
3. Use the dropdown menu (⋮) to checkout branches or remove worktrees
4. Drag worktree rows to reorder

### Managing Agents

1. Click **"+"** in a worktree row to spawn a new agent
2. Click an agent card to open the interaction modal
3. Use the dropdown menus to:
   - Change mode (Auto Approve / Plan / Regular)
   - Modify permissions (Read / Write / Execute)
   - Fork or delete the agent
4. Drag agent cards to reorder (in "Free Arrangement" mode)

### Agent Status Indicators

| Color  | Status   | Description                  |
| ------ | -------- | ---------------------------- |
| Green  | Running  | Agent is actively processing |
| Yellow | Waiting  | Agent awaits user input      |
| Red    | Error    | Agent encountered an error   |
| Gray   | Finished | Agent completed its task     |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT
