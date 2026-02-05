# Installation Guide

This guide covers all installation methods for Claude Manager.

## Table of Contents

- [Quick Install](#quick-install)
- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
  - [One-Line Install](#one-line-install)
  - [Manual Install](#manual-install)
  - [Development Setup](#development-setup)
- [Post-Installation](#post-installation)
- [Updating](#updating)
- [Uninstalling](#uninstalling)

---

## Quick Install

The fastest way to get started:

```bash
curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash
```

Then open http://localhost:8080 in your browser.

---

## Prerequisites

### Required

| Software   | Version | Check Command      | Install                                       |
| ---------- | ------- | ------------------ | --------------------------------------------- |
| Node.js    | 20+     | `node --version`   | [nodejs.org](https://nodejs.org/)             |
| pnpm       | 9+      | `pnpm --version`   | `npm install -g pnpm`                         |
| Git        | 2.20+   | `git --version`    | [git-scm.com](https://git-scm.com/)           |
| Claude CLI | latest  | `claude --version` | [Anthropic Docs](https://docs.anthropic.com/) |

### Optional (Recommended)

| Software | Purpose             | Install              |
| -------- | ------------------- | -------------------- |
| PM2      | Process management  | `npm install -g pm2` |
| jq       | JSON parsing in CLI | `apt install jq`     |

### Quick Prerequisites Check

```bash
# Run this to check all prerequisites
node --version    # Should be v20.x.x or higher
pnpm --version    # Should be 9.x.x or higher
git --version     # Should be 2.20+
claude --version  # Claude CLI should be installed
```

---

## Installation Methods

### One-Line Install

The simplest method - downloads, builds, and starts everything:

```bash
curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash
```

#### Install Options

Customize the installation with environment variables:

```bash
# Custom installation directory (default: ~/.claude-manager/app)
INSTALL_DIR=/opt/claude-manager curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash

# Install a specific version
VERSION=v1.0.0 curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash

# Install without auto-starting the server
SKIP_START=1 curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash

# Combine options
INSTALL_DIR=/opt/cm VERSION=v1.0.0 SKIP_START=1 curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash
```

#### What the Installer Does

1. Checks prerequisites (Node.js, pnpm, git)
2. Downloads the latest release (or specified version)
3. Installs dependencies
4. Builds the application
5. Creates data directories (`~/.claude-manager/`)
6. Adds shell aliases (cm-start, cm-stop, cm-logs, cm-status)
7. Starts the server

---

### Manual Install

For full control over the installation process:

#### Step 1: Clone the Repository

```bash
git clone https://github.com/ManMan88/ccmanger.git
cd ccmanger
```

Or download a specific release:

```bash
# Download release tarball
curl -LO https://github.com/ManMan88/ccmanger/releases/download/v1.0.0/claude-manager-1.0.0.tar.gz

# Extract
mkdir claude-manager && tar -xzf claude-manager-1.0.0.tar.gz -C claude-manager
cd claude-manager
```

#### Step 2: Install Dependencies

```bash
pnpm install
```

#### Step 3: Build

```bash
# Using the build script
./scripts/build.sh

# Or manually
pnpm --filter @claude-manager/shared build
pnpm build
pnpm --filter @claude-manager/server build
```

#### Step 4: Create Data Directories

```bash
mkdir -p ~/.claude-manager/logs
mkdir -p ~/.claude-manager/backups
```

#### Step 5: Start the Server

```bash
# Using the start script
./scripts/start-prod.sh

# Or with PM2 (recommended)
pm2 start ecosystem.config.js --env production

# Or directly with Node
NODE_ENV=production node server/dist/index.js
```

---

### Development Setup

For contributing or local development:

```bash
# Clone
git clone https://github.com/ManMan88/ccmanger.git
cd ccmanger

# Install all dependencies
pnpm install

# Start development servers (with hot reload)
./scripts/start-dev.sh
```

This starts:

- Frontend dev server on http://localhost:8080 (hot reload)
- Backend dev server on http://localhost:3001 (watch mode)

#### Running Tests

```bash
# Frontend tests
pnpm test

# Backend tests
pnpm --filter @claude-manager/server test

# E2E tests (requires Playwright)
pnpm test:e2e
```

---

## Post-Installation

### Verify Installation

```bash
# Check health endpoint
curl http://localhost:3001/api/health

# Expected response:
# {"status":"ok","timestamp":"...","checks":{"database":"ok"}}
```

### Access the Application

- **Web UI**: http://localhost:8080
- **API**: http://localhost:3001
- **API Docs**: http://localhost:3001/api/docs/ui

### Shell Aliases

The installer adds these aliases (restart your shell or `source ~/.bashrc`):

| Alias       | Description          |
| ----------- | -------------------- |
| `cm-start`  | Start Claude Manager |
| `cm-stop`   | Stop Claude Manager  |
| `cm-logs`   | View server logs     |
| `cm-status` | Check health status  |

### PM2 Management

If using PM2:

```bash
# View status
pm2 status

# View logs
pm2 logs claude-manager

# Restart
pm2 restart claude-manager

# Stop
pm2 stop claude-manager

# Auto-start on system boot
pm2 save
pm2 startup
```

---

## Updating

### Using the Install Script

```bash
# Re-run the installer (updates existing installation)
curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash
```

### Manual Update

```bash
cd /path/to/claude-manager

# Stop the server
pm2 stop claude-manager  # or pkill -f claude-manager

# Pull latest changes
git pull origin master

# Reinstall dependencies
pnpm install

# Rebuild
./scripts/build.sh

# Restart
pm2 start claude-manager  # or ./scripts/start-prod.sh
```

### Update to Specific Version

```bash
VERSION=v1.1.0 curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash
```

---

## Uninstalling

### Stop the Server

```bash
# If using PM2
pm2 stop claude-manager
pm2 delete claude-manager

# If running directly
pkill -f "node.*claude-manager"
```

### Remove Files

```bash
# Remove application (default location)
rm -rf ~/.claude-manager/app

# Remove data (WARNING: deletes database and logs)
rm -rf ~/.claude-manager

# Remove shell aliases (edit ~/.bashrc or ~/.zshrc)
# Remove the "# Claude Manager" section
```

### Remove PM2 Startup

```bash
pm2 unstartup
```

---

## Troubleshooting Installation

### "Command not found: pnpm"

```bash
npm install -g pnpm
```

### "Node.js version too old"

```bash
# Using nvm
nvm install 20
nvm use 20

# Or download from nodejs.org
```

### "Permission denied" errors

```bash
# Don't use sudo with npm/pnpm
# Instead, fix npm permissions:
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Port 3001 already in use

```bash
# Find what's using the port
lsof -i :3001

# Kill the process or use a different port
PORT=3002 ./scripts/start-prod.sh
```

### Build fails

```bash
# Clear caches and rebuild
rm -rf node_modules
rm -rf server/node_modules
rm -rf shared/node_modules
pnpm install
./scripts/build.sh
```

---

## Next Steps

- [User Guide](docs/user-guide.md) - Learn how to use Claude Manager
- [Configuration](docs/configuration.md) - Customize settings
- [Troubleshooting](docs/troubleshooting.md) - Fix common issues
