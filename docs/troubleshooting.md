# Troubleshooting Guide

This guide helps you diagnose and fix common issues with Claude Manager.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Connection Issues](#connection-issues)
3. [Agent Issues](#agent-issues)
4. [Git/Worktree Issues](#gitworktree-issues)
5. [Database Issues](#database-issues)
6. [Performance Issues](#performance-issues)
7. [Build/Deployment Issues](#builddeployment-issues)
8. [Log Files](#log-files)

---

## Quick Diagnostics

### Health Check

```bash
# Check if the server is running
curl http://localhost:3001/api/health

# Expected response:
# {"status":"ok","timestamp":"...","checks":{"database":"ok"}}
```

### Check Server Status

```bash
# If using PM2
pm2 status claude-manager
pm2 logs claude-manager --lines 50

# If running directly
# Check the terminal output or log files
```

### Verify Prerequisites

```bash
# Check Node.js version (should be 20+)
node --version

# Check Claude CLI
claude --version

# Check Git
git --version

# Check pnpm
pnpm --version
```

---

## Connection Issues

### Frontend can't connect to backend

**Symptoms:**

- "Connection lost" indicator in toolbar
- API calls failing
- No real-time updates

**Solutions:**

1. **Verify backend is running:**

   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Check for port conflicts:**

   ```bash
   lsof -i :3001
   ```

3. **Check CORS configuration:**
   - Ensure `CORS_ORIGIN` environment variable is set correctly
   - Default: `http://localhost:8080`

4. **Check firewall settings:**
   - Ensure ports 3001 (API) and 8080 (frontend) are accessible

### WebSocket connection fails

**Symptoms:**

- Connected indicator shows yellow/red
- No live updates from agents
- Chat messages don't appear in real-time

**Solutions:**

1. **Check WebSocket endpoint:**

   ```bash
   # Test WebSocket connection
   curl -i -N -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Key: test" \
        -H "Sec-WebSocket-Version: 13" \
        http://localhost:3001/ws
   ```

2. **Check proxy configuration:**
   - If using a reverse proxy, ensure WebSocket upgrade headers are passed

3. **Browser issues:**
   - Try a different browser
   - Check for browser extensions blocking WebSockets

---

## Agent Issues

### Agent won't start

**Symptoms:**

- Agent stays in "finished" or "error" status
- No output appears

**Solutions:**

1. **Check Claude CLI is installed:**

   ```bash
   which claude
   claude --version
   ```

2. **Check Claude CLI authentication:**

   ```bash
   claude auth status
   ```

3. **Check worktree path exists:**
   - Verify the worktree directory exists
   - Ensure you have read/write permissions

4. **Check server logs:**
   ```bash
   cat ~/.claude-manager/logs/error.log
   ```

### Agent crashes immediately

**Symptoms:**

- Agent starts then immediately shows "error" status
- Error messages in output

**Solutions:**

1. **Check for environment issues:**
   - Ensure all required environment variables are set
   - Check `CLAUDE_CLI_PATH` if using custom location

2. **Check worktree state:**
   - Ensure it's a valid git worktree
   - Check for corrupted git state

3. **Review error output:**
   - Click on the agent to see any error messages
   - Check server logs for detailed errors

### Agent not responding to messages

**Symptoms:**

- Messages sent but no response
- Agent shows as "running" but nothing happens

**Solutions:**

1. **Check agent is actually running:**

   ```bash
   # Check for Claude process
   ps aux | grep claude
   ```

2. **Check if agent is waiting for input:**
   - Some operations require approval before continuing
   - Check if there's a pending prompt

3. **Restart the agent:**
   - Stop and start the agent again
   - This will resume from the last session

### Orphaned processes

**Symptoms:**

- Claude processes running without Claude Manager knowing
- High CPU/memory usage from old processes

**Solutions:**

1. **Restart the server:**
   - Claude Manager cleans orphaned processes on startup

2. **Manually kill processes:**

   ```bash
   pkill -f "claude.*--session"
   ```

3. **Check database:**
   - Orphaned processes may have stale PIDs in the database
   - Restarting the server clears these

---

## Git/Worktree Issues

### Can't create worktree

**Symptoms:**

- Error when adding worktree
- Worktree creation fails

**Solutions:**

1. **Check target path:**
   - Path must not already exist
   - Parent directory must exist and be writable

2. **Check branch exists:**
   - If not creating a new branch, ensure the target branch exists
   - Run `git branch -a` to see available branches

3. **Check git state:**
   ```bash
   cd <workspace-path>
   git status
   git worktree list
   ```

### Worktree not detected

**Symptoms:**

- Existing worktrees not appearing in Claude Manager
- Worktree count doesn't match reality

**Solutions:**

1. **Refresh workspace:**
   - Close and reopen the workspace

2. **Check worktree is valid:**

   ```bash
   cd <workspace-path>
   git worktree list
   ```

3. **Repair worktrees:**
   ```bash
   git worktree prune
   ```

### Can't delete worktree

**Symptoms:**

- Delete fails with error
- Worktree still appears after delete

**Solutions:**

1. **Check for uncommitted changes:**
   - Worktrees with changes may fail to delete
   - Commit or stash changes first

2. **Check for running agents:**
   - Stop all agents in the worktree first

3. **Manual cleanup:**
   ```bash
   git worktree remove <worktree-path>
   rm -rf <worktree-path>
   ```

---

## Database Issues

### Database locked

**Symptoms:**

- "SQLITE_BUSY" errors
- Operations timing out

**Solutions:**

1. **Check for multiple instances:**
   - Only one server should access the database
   - Kill any duplicate processes

2. **Wait and retry:**
   - SQLite locks can be transient
   - Retry the operation after a moment

3. **Reset database lock:**
   ```bash
   # Stop the server first
   sqlite3 ~/.claude-manager/data.db "PRAGMA wal_checkpoint(TRUNCATE);"
   ```

### Database corrupted

**Symptoms:**

- Server won't start
- "SQLITE_CORRUPT" errors

**Solutions:**

1. **Try database recovery:**

   ```bash
   cd ~/.claude-manager
   sqlite3 data.db ".recover" | sqlite3 recovered.db
   mv data.db data.db.corrupt
   mv recovered.db data.db
   ```

2. **Restore from backup:**

   ```bash
   # Backups are in ~/.claude-manager/backups/
   cp ~/.claude-manager/backups/data.db.backup data.db
   ```

3. **Start fresh:**
   ```bash
   rm ~/.claude-manager/data.db
   # Server will create a new database on startup
   ```

### Migration failed

**Symptoms:**

- Server won't start after update
- Migration errors in logs

**Solutions:**

1. **Check migration logs:**

   ```bash
   cat ~/.claude-manager/logs/error.log
   ```

2. **Run migrations manually:**

   ```bash
   cd server
   pnpm migrate
   ```

3. **Roll back migration:**
   ```bash
   cd server
   pnpm migrate:down
   ```

---

## Performance Issues

### Slow UI

**Symptoms:**

- UI feels laggy
- Operations take a long time

**Solutions:**

1. **Check agent count:**
   - Too many running agents can slow things down
   - Stop agents you're not actively using

2. **Check browser memory:**
   - Refresh the page to clear accumulated memory

3. **Check server resources:**
   ```bash
   top
   free -m
   ```

### High memory usage

**Symptoms:**

- Server using excessive memory
- System becoming unresponsive

**Solutions:**

1. **Check for memory leaks:**
   - Restart the server to clear memory

2. **PM2 memory limit:**
   - Configured in `ecosystem.config.js`
   - Server auto-restarts at 500MB

3. **Reduce concurrent agents:**
   - Each agent process consumes memory

### Slow agent responses

**Symptoms:**

- Long delays before agent output appears
- Timeouts

**Solutions:**

1. **Check network:**
   - Agent responses depend on API latency

2. **Check context size:**
   - Large contexts take longer to process
   - Consider starting a new agent

3. **Check Claude API status:**
   - External API issues can cause delays

---

## Build/Deployment Issues

### Build fails

**Symptoms:**

- `pnpm build` errors
- TypeScript compilation errors

**Solutions:**

1. **Clear caches:**

   ```bash
   rm -rf node_modules
   rm -rf server/node_modules
   pnpm install
   ```

2. **Check TypeScript errors:**

   ```bash
   pnpm typecheck
   pnpm --filter @claude-manager/server typecheck
   ```

3. **Check Node.js version:**
   - Ensure Node.js 20+ is installed

### Server won't start in production

**Symptoms:**

- `./scripts/start-prod.sh` fails
- Server crashes on startup

**Solutions:**

1. **Verify build exists:**

   ```bash
   ls -la dist/
   ls -la server/dist/
   ```

2. **Check environment:**

   ```bash
   echo $NODE_ENV  # Should be "production"
   echo $PORT      # Should be set (default 3001)
   ```

3. **Run build first:**
   ```bash
   ./scripts/build.sh
   ```

---

## Log Files

### Log Locations

| Log           | Location                           |
| ------------- | ---------------------------------- |
| Server output | `~/.claude-manager/logs/out.log`   |
| Server errors | `~/.claude-manager/logs/error.log` |
| PM2 logs      | `~/.pm2/logs/claude-manager-*.log` |

### Viewing Logs

```bash
# Tail server logs
tail -f ~/.claude-manager/logs/out.log

# View recent errors
tail -50 ~/.claude-manager/logs/error.log

# PM2 logs
pm2 logs claude-manager
```

### Log Levels

Configure log verbosity with `LOG_LEVEL` environment variable:

- `trace` - Most verbose
- `debug` - Development
- `info` - Normal operation (default)
- `warn` - Warnings only
- `error` - Errors only
- `fatal` - Critical errors only

```bash
LOG_LEVEL=debug ./scripts/start-prod.sh
```

---

## Getting Help

If you can't resolve an issue:

1. **Check existing issues:**
   - Search the project's issue tracker

2. **Collect diagnostic information:**
   - Node.js version
   - Operating system
   - Relevant log excerpts
   - Steps to reproduce

3. **Report a bug:**
   - Open an issue with diagnostic information
   - Include any error messages

4. **Check API status:**
   - Visit http://localhost:3001/api/errors/stats for tracked errors
   - Visit http://localhost:3001/api/metrics for system metrics
