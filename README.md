# Claude Manager

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

| Category | Technology |
|----------|------------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Components | shadcn/ui (Radix primitives) |
| State | React Hooks + React Query |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |

## Getting Started

### Prerequisites

- Node.js 18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- npm or bun

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd claude_manager

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:8080`.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Create production build |
| `npm run preview` | Preview production build locally |
| `npm run test` | Run tests with Vitest |
| `npm run lint` | Run ESLint |

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

The application is currently a **frontend prototype** with mock data. All state is managed client-side using React hooks. Data does not persist between sessions.

### Planned Backend: Tauri

The recommended backend stack is **Tauri** (Rust) based on the following requirements:

| Requirement | Solution |
|-------------|----------|
| Git Operations | `git2` crate or shell commands |
| Claude CLI Integration | Async process spawning with `tokio::process` |
| Real-time Communication | Tauri event system (`emit`/`listen`) |
| Data Persistence | SQLite via `sqlx` |
| Desktop Packaging | Built-in (AppImage, .deb, .msi, .dmg) |

**Why Tauri over Electron:**
- Lower memory footprint (~30-60MB vs 200-500MB)
- Smaller bundle size (~5-10MB vs 150MB+)
- Native performance for process management
- Proven pattern in related `worktree_viewer` project

### Backend Integration Points

The following hooks/components are ready for backend integration:

- `useWorkspace.ts` - Replace mock data with Tauri commands
- `AgentModal.tsx` - Connect chat interface to agent process streams
- `WorktreeRow.tsx` - Connect git operations to Tauri commands

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

| Color | Status | Description |
|-------|--------|-------------|
| Green | Running | Agent is actively processing |
| Yellow | Waiting | Agent awaits user input |
| Red | Error | Agent encountered an error |
| Gray | Finished | Agent completed its task |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT
