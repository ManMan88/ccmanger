# Claude Manager

[![CI](https://github.com/ManMan88/ccmanger/actions/workflows/ci.yml/badge.svg)](https://github.com/ManMan88/ccmanger/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.75+-B7410E?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri&logoColor=black)](https://tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)

A native desktop application for managing Claude Code CLI agents across git worktrees.

## Features

- **Multi-Worktree Support**: Manage multiple git worktrees in a single workspace
- **Agent Management**: Spawn, stop, resume, and fork Claude Code agents
- **Real-time Updates**: Live streaming of agent output via WebSocket
- **Context Tracking**: Monitor agent context usage with visual indicators
- **Mode Control**: Switch between auto-approve, plan, and regular modes
- **Permission Management**: Configure read/write/execute permissions per agent
- **Drag & Drop**: Reorder agents and worktrees intuitively
- **Agent History**: Restore previously deleted agents
- **Usage Statistics**: Track API usage with visual progress bars
- **Dark Mode**: Toggle between light and dark themes

---

## Installation

### Prerequisites

- **Rust 1.75+** - [Install](https://rustup.rs/)
- **pnpm** - `npm install -g pnpm`
- **Git** - [Download](https://git-scm.com/)
- **Claude Code CLI** - Installed and authenticated
- **Platform dependencies** - See [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/ManMan88/ccmanger.git
cd ccmanger

# Install dependencies
pnpm install

# Build native application
pnpm tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

### Development Setup

```bash
# Clone and install
git clone https://github.com/ManMan88/ccmanger.git
cd ccmanger
pnpm install

# Start development mode (hot reload)
pnpm tauri dev
```

---

## Tech Stack

### Frontend

| Category   | Technology                    |
| ---------- | ----------------------------- |
| Framework  | React 18 + TypeScript         |
| Build Tool | Vite 5.4                      |
| Styling    | Tailwind CSS 3.4              |
| Components | shadcn/ui (Radix primitives)  |
| State      | React Query (TanStack Query)  |
| Real-time  | WebSocket with auto-reconnect |
| Forms      | React Hook Form + Zod         |

### Backend (Rust/Tauri)

| Category           | Technology                    |
| ------------------ | ----------------------------- |
| Runtime            | Tauri 2.x + Tokio             |
| Framework          | Axum (WebSocket server)       |
| Database           | rusqlite + r2d2 pool          |
| Git                | git2-rs                       |
| Process Management | tokio::process                |
| Serialization      | serde + serde_json            |
| Tests              | 68 tests (unit + integration) |

---

## Available Commands

| Command                        | Description                     |
| ------------------------------ | ------------------------------- |
| `pnpm tauri dev`               | Start in development mode       |
| `pnpm tauri build`             | Build native application        |
| `cd src-tauri && cargo test`   | Run Rust tests (68 tests)       |
| `cd src-tauri && cargo bench`  | Run performance benchmarks      |
| `cd src-tauri && cargo clippy` | Run Rust linter                 |
| `pnpm dev`                     | Start frontend only (port 8080) |
| `pnpm test`                    | Run frontend tests              |
| `pnpm lint`                    | Run ESLint                      |

---

## Project Structure

```
claude-manager/
├── src/                    # Frontend source (React)
│   ├── pages/              # Page components
│   ├── components/         # React components
│   │   ├── ui/             # shadcn/ui components
│   │   └── ...             # Feature components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities and API client
│   └── types/              # TypeScript types
│
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── services/       # Business logic
│   │   ├── db/             # Database and repositories
│   │   └── websocket/      # WebSocket server (Axum)
│   ├── tests/              # Integration tests
│   └── benches/            # Performance benchmarks
│
├── shared/                 # Shared types (frontend + backend)
├── docs/                   # Documentation
└── e2e/                    # E2E tests (Playwright)
```

---

## Usage

### Opening a Workspace

1. Click **"Open Workspace"** in the toolbar
2. Select or enter a path to your git repository
3. Claude Manager will detect existing worktrees

### Managing Agents

1. Click **"+"** in a worktree to create a new agent
2. Enter a name and configure mode/permissions
3. Click on an agent card to open the chat interface
4. Send messages and receive real-time responses

### Agent Status

| Color  | Status   | Description                  |
| ------ | -------- | ---------------------------- |
| Green  | Running  | Agent is actively processing |
| Yellow | Waiting  | Agent awaits user input      |
| Red    | Error    | Agent encountered an error   |
| Gray   | Finished | Agent completed its task     |

---

## Documentation

| Document                                                | Description                  |
| ------------------------------------------------------- | ---------------------------- |
| [Architecture](docs/01-architecture-overview.md)        | System design and patterns   |
| [API Specification](docs/02-api-specification.md)       | API and WebSocket events     |
| [Database Schema](docs/03-database-schema.md)           | SQLite schema and migrations |
| [Frontend Integration](docs/08-frontend-integration.md) | React Query and Tauri IPC    |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests alongside code
4. Run `cargo clippy` and `cargo fmt`
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## License

MIT - See [LICENSE](LICENSE) for details.
