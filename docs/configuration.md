# Configuration Reference

This document describes all configuration options for Claude Manager.

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Configuration Files](#configuration-files)
3. [Data Directories](#data-directories)
4. [Logging Configuration](#logging-configuration)
5. [PM2 Configuration](#pm2-configuration)
6. [Frontend Configuration](#frontend-configuration)

---

## Environment Variables

### Server Configuration

| Variable   | Default       | Description                                                       |
| ---------- | ------------- | ----------------------------------------------------------------- |
| `NODE_ENV` | `development` | Environment mode: `development`, `production`, or `test`          |
| `PORT`     | `3001`        | HTTP server port                                                  |
| `HOST`     | `127.0.0.1`   | Server bind address. Use `0.0.0.0` to accept external connections |

### Database Configuration

| Variable   | Default                     | Description                   |
| ---------- | --------------------------- | ----------------------------- |
| `DATA_DIR` | `~/.claude-manager`         | Base directory for data files |
| `DB_PATH`  | `~/.claude-manager/data.db` | SQLite database file path     |

### Claude CLI Configuration

| Variable             | Default  | Description                                     |
| -------------------- | -------- | ----------------------------------------------- |
| `CLAUDE_CLI_PATH`    | `claude` | Path to Claude CLI binary                       |
| `CLAUDE_CLI_TIMEOUT` | `300000` | CLI command timeout in milliseconds (5 minutes) |

### CORS Configuration

| Variable      | Default                 | Description                                         |
| ------------- | ----------------------- | --------------------------------------------------- |
| `CORS_ORIGIN` | `http://localhost:8080` | Allowed CORS origins (comma-separated for multiple) |

### Logging Configuration

| Variable    | Default                       | Description                                                   |
| ----------- | ----------------------------- | ------------------------------------------------------------- |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

### WebSocket Configuration

| Variable                | Default | Description                                  |
| ----------------------- | ------- | -------------------------------------------- |
| `WS_HEARTBEAT_INTERVAL` | `30000` | WebSocket heartbeat interval in milliseconds |

### Error Tracking Configuration

| Variable                     | Default           | Description                            |
| ---------------------------- | ----------------- | -------------------------------------- |
| `ERROR_TRACKING_ENABLED`     | `true`            | Enable/disable error tracking          |
| `ERROR_TRACKING_DSN`         | (none)            | Sentry DSN for external error tracking |
| `ERROR_TRACKING_ENVIRONMENT` | `NODE_ENV`        | Environment name for error reports     |
| `ERROR_TRACKING_RELEASE`     | (package version) | Release identifier for error reports   |

---

## Configuration Files

### `.env` Files

Create environment-specific `.env` files:

**`.env.development`** (default for development):

```bash
NODE_ENV=development
PORT=3001
HOST=127.0.0.1
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:8080
```

**`.env.production`**:

```bash
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:8080
DATA_DIR=/var/lib/claude-manager
```

**`.env.test`** (for running tests):

```bash
NODE_ENV=test
PORT=3002
LOG_LEVEL=error
DATA_DIR=/tmp/claude-manager-test
```

### Frontend Environment Files

**`.env.development`** (frontend):

```bash
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001/ws
```

**`.env.production`** (frontend):

```bash
VITE_API_URL=/api
VITE_WS_URL=ws://localhost:3001/ws
```

---

## Data Directories

### Default Structure

```
~/.claude-manager/
├── data.db              # SQLite database
├── backups/             # Database backups
│   └── data.db.backup   # Latest backup
└── logs/                # Application logs
    ├── out.log          # Standard output
    └── error.log        # Error output
```

### Customizing Data Directory

Set the `DATA_DIR` environment variable:

```bash
export DATA_DIR=/var/lib/claude-manager
```

All subdirectories (backups, logs) will be created within this directory.

### Database Location

The database path can be set independently:

```bash
export DB_PATH=/custom/path/claude-manager.db
```

### Backup Configuration

Backups are automatically created:

- On server startup
- Directory: `${DATA_DIR}/backups/`
- Only the latest backup is kept by default

---

## Logging Configuration

### Log Levels

| Level   | Usage                               |
| ------- | ----------------------------------- |
| `trace` | Very detailed debugging information |
| `debug` | Debugging information               |
| `info`  | Normal operational messages         |
| `warn`  | Warning conditions                  |
| `error` | Error conditions                    |
| `fatal` | Critical errors causing shutdown    |

### Development Logging

In development mode, logs are:

- Colorized with timestamps
- Formatted with pino-pretty
- Written to stdout

### Production Logging

In production mode, logs are:

- JSON formatted (for parsing)
- Written to files
- Level is `info` by default

### Log File Configuration (PM2)

When using PM2, logs are configured in `ecosystem.config.js`:

```javascript
{
  error_file: '~/.claude-manager/logs/error.log',
  out_file: '~/.claude-manager/logs/out.log',
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  merge_logs: true,
}
```

### Log Rotation

For production, configure log rotation:

**Using logrotate (Linux):**

Create `/etc/logrotate.d/claude-manager`:

```
/home/user/.claude-manager/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 user user
    postrotate
        pm2 reloadLogs
    endscript
}
```

**Using PM2 log rotation:**

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## PM2 Configuration

### ecosystem.config.js

The PM2 configuration file supports these options:

```javascript
module.exports = {
  apps: [
    {
      name: 'claude-manager',
      script: 'server/dist/index.js',

      // Process management
      instances: 1, // SQLite requires single instance
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',

      // Restart behavior
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 1000,

      // Environment
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 30000,
    },
  ],
}
```

### PM2 Commands

```bash
# Start with default environment
pm2 start ecosystem.config.js

# Start in production mode
pm2 start ecosystem.config.js --env production

# View status
pm2 status

# View logs
pm2 logs claude-manager

# Restart
pm2 restart claude-manager

# Stop
pm2 stop claude-manager

# Delete from PM2
pm2 delete claude-manager

# Save process list for auto-restart on boot
pm2 save
pm2 startup
```

---

## Frontend Configuration

### Vite Configuration

Frontend configuration is in `vite.config.ts`:

```typescript
export default defineConfig({
  server: {
    port: 8080,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  // ...
})
```

### Build Configuration

Build output is configured in `vite.config.ts`:

```typescript
export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // ...
})
```

### Environment Variables in Frontend

Access environment variables in frontend code:

```typescript
// API URL
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// WebSocket URL
const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'
```

---

## Complete Configuration Example

### Development Setup

**.env.development** (project root):

```bash
# Server
NODE_ENV=development
PORT=3001
HOST=127.0.0.1
LOG_LEVEL=debug

# CORS
CORS_ORIGIN=http://localhost:8080

# Data
DATA_DIR=~/.claude-manager

# Claude CLI
CLAUDE_CLI_PATH=claude

# Frontend
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001/ws
```

### Production Setup

**.env.production** (project root):

```bash
# Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info

# CORS
CORS_ORIGIN=http://your-domain.com

# Data
DATA_DIR=/var/lib/claude-manager

# Error tracking (optional)
ERROR_TRACKING_DSN=https://xxx@sentry.io/xxx

# Frontend (for build)
VITE_API_URL=/api
VITE_WS_URL=wss://your-domain.com/ws
```

---

## Security Considerations

1. **Bind Address**: In production, consider using `HOST=127.0.0.1` behind a reverse proxy
2. **CORS**: Set `CORS_ORIGIN` to your specific domain, not `*`
3. **Data Directory**: Ensure proper permissions on `DATA_DIR`
4. **Logs**: Don't log sensitive information; set appropriate log levels
5. **Error Tracking**: Sentry DSN contains a secret; don't commit it to version control
