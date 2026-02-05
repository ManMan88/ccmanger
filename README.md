# Claude Manager

[![CI](https://github.com/ManMan88/ccmanger/actions/workflows/ci.yml/badge.svg)](https://github.com/ManMan88/ccmanger/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E%20Tests-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)

A desktop application for managing Claude Code CLI agents across git worktrees.

## Installation

### Quick Install (One Command)

```bash
curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash
```

This will:

- Check prerequisites (Node.js 20+, pnpm, git)
- Download and install the latest release
- Set up data directories
- Start the server

Open http://localhost:8080 in your browser.

### Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm)
- **pnpm** - `npm install -g pnpm`
- **Git** - [Download](https://git-scm.com/)
- **Claude Code CLI** - Installed and authenticated

### Manual Installation

For more control over the installation:

```bash
# Clone the repository
git clone https://github.com/ManMan88/ccmanger.git
cd ccmanger

# Install dependencies
pnpm install

# Build the application
./scripts/build.sh

# Start in production mode
./scripts/start-prod.sh
```

### Development Setup

```bash
# Clone and install
git clone https://github.com/ManMan88/ccmanger.git
cd ccmanger
pnpm install

# Start development servers (hot reload)
./scripts/start-dev.sh
```

### Install Options

The install script supports several options via environment variables:

```bash
# Install to custom directory
INSTALL_DIR=/opt/claude-manager curl -fsSL .../install.sh | bash

# Install specific version
VERSION=v1.0.0 curl -fsSL .../install.sh | bash

# Install without starting the server
SKIP_START=1 curl -fsSL .../install.sh | bash
```

### Using PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js --env production

# Auto-start on boot
pm2 save
pm2 startup
```

---

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

## Documentation

| Document                                          | Description                        |
| ------------------------------------------------- | ---------------------------------- |
| [User Guide](docs/user-guide.md)                  | How to use Claude Manager          |
| [Configuration](docs/configuration.md)            | Environment variables and settings |
| [Troubleshooting](docs/troubleshooting.md)        | Common issues and solutions        |
| [API Specification](docs/02-api-specification.md) | REST API and WebSocket events      |
| [Architecture](docs/01-architecture-overview.md)  | System design and patterns         |

### API Documentation

Interactive API documentation is available at:

- **Swagger UI**: http://localhost:3001/api/docs/ui
- **OpenAPI JSON**: http://localhost:3001/api/docs
- **OpenAPI YAML**: http://localhost:3001/api/docs/yaml

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

### Backend

| Category   | Technology              |
| ---------- | ----------------------- |
| Runtime    | Node.js 20 LTS          |
| Framework  | Fastify 4.x             |
| Database   | SQLite (better-sqlite3) |
| Real-time  | @fastify/websocket      |
| Git        | simple-git              |
| Validation | Zod                     |

---

## Available Scripts

| Command                                     | Description                                  |
| ------------------------------------------- | -------------------------------------------- |
| `./scripts/start-dev.sh`                    | Start frontend + backend in development mode |
| `./scripts/build.sh`                        | Create production build                      |
| `./scripts/start-prod.sh`                   | Start in production mode                     |
| `pnpm dev`                                  | Start frontend only                          |
| `pnpm dev:server`                           | Start backend only                           |
| `pnpm test`                                 | Run frontend tests                           |
| `pnpm test:e2e`                             | Run E2E tests with Playwright                |
| `pnpm --filter @claude-manager/server test` | Run backend tests                            |
| `pnpm lint`                                 | Run ESLint                                   |

---

## Project Structure

```
claude-manager/
├── src/                    # Frontend source
│   ├── pages/              # Page components
│   ├── components/         # React components
│   │   ├── ui/             # shadcn/ui components
│   │   └── ...             # Feature components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities and API client
│   └── types/              # TypeScript types
│
├── server/                 # Backend source
│   ├── src/
│   │   ├── routes/         # REST API endpoints
│   │   ├── services/       # Business logic
│   │   ├── db/             # Database and repositories
│   │   └── websocket/      # WebSocket handlers
│   └── tests/              # Backend tests
│
├── shared/                 # Shared types (frontend + backend)
├── docs/                   # Documentation
├── scripts/                # Deployment scripts
├── e2e/                    # E2E tests (Playwright)
└── ecosystem.config.js     # PM2 configuration
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

## Monitoring & Metrics

### Health Checks

```bash
# Comprehensive health check
curl http://localhost:3001/api/health

# Liveness probe
curl http://localhost:3001/api/health/live

# Readiness probe
curl http://localhost:3001/api/health/ready
```

### Application Metrics

```bash
# JSON format
curl http://localhost:3001/api/metrics

# Prometheus format
curl http://localhost:3001/api/metrics/prometheus
```

### Error Tracking

```bash
# Recent errors
curl http://localhost:3001/api/errors

# Error statistics
curl http://localhost:3001/api/errors/stats
```

---

## Configuration

Configuration is via environment variables. See [Configuration Reference](docs/configuration.md) for details.

Key variables:

```bash
NODE_ENV=production       # Environment mode
PORT=3001                 # Server port
DATA_DIR=~/.claude-manager # Data directory
LOG_LEVEL=info            # Log verbosity
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write tests for new features
- Follow existing code patterns
- Update documentation as needed
- Ensure CI passes before merging

---

## License

MIT - See [LICENSE](LICENSE) for details.
