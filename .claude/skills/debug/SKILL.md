---
name: debug
description: Debug issues in Claude Manager across frontend, backend, database, and process management. Use when encountering errors, unexpected behavior, test failures, or performance issues. Triggers on "debug", "fix this error", "why is this failing", "investigate issue", or when errors appear in output.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Task
---

# Debug Workflow

Systematic debugging approach for Claude Manager issues.

## Step 1: Understand the Error

### Gather Information
- What is the exact error message?
- Where does it occur (frontend/backend/database)?
- Is it reproducible?
- When did it start happening?

### Check Logs
```bash
# Backend logs (if running)
tail -f server/logs/*.log

# Frontend console
# Check browser DevTools

# Test output
npm test -- --reporter=verbose
```

## Step 2: Identify the Layer

### Frontend Issues
- **Symptoms:** UI not updating, React errors, network failures
- **Check:** Browser DevTools (Console, Network, React DevTools)
- **Common causes:**
  - React Query cache stale
  - WebSocket disconnected
  - Component state not updating
  - Missing error boundaries

### Backend API Issues
- **Symptoms:** 4xx/5xx errors, wrong response format
- **Check:** Server logs, request/response in Network tab
- **Common causes:**
  - Validation schema mismatch
  - Service throwing unhandled error
  - Database query failing
  - Missing middleware

### Database Issues
- **Symptoms:** Data not persisting, constraint violations
- **Check:** SQLite database directly
- **Common causes:**
  - Migration not run
  - Foreign key constraint
  - Unique constraint violation
  - Wrong data type

### Process Management Issues
- **Symptoms:** Agent not starting, output not streaming
- **Check:** Process list, stdout/stderr
- **Common causes:**
  - Claude CLI not found in PATH
  - Working directory incorrect
  - Stdin/stdout not connected
  - Process crashed

### WebSocket Issues
- **Symptoms:** No real-time updates, connection dropping
- **Check:** WebSocket frames in Network tab
- **Common causes:**
  - Not subscribed to channel
  - Server not broadcasting
  - Connection timeout
  - Message format wrong

## Step 3: Isolate the Problem

### Create Minimal Reproduction
```typescript
// Isolate the failing code
describe('debug test', () => {
  it('reproduces the issue', async () => {
    // Minimal code to trigger the bug
  })
})
```

### Check Recent Changes
```bash
# What changed recently?
git log --oneline -10
git diff HEAD~3

# Find when it broke
git bisect start
git bisect bad HEAD
git bisect good <known-good-commit>
```

### Add Debugging Output
```typescript
// Temporary debugging (remove before commit!)
console.log('[DEBUG]', { variable, state })

// Or use debugger
debugger
```

## Step 4: Common Issues & Solutions

### "Cannot find module"
```bash
# Check if module exists
ls node_modules/<module>

# Reinstall dependencies
rm -rf node_modules && npm install
```

### "Type error" in TypeScript
```bash
# Check types
npm run typecheck

# Look for any types
grep -r "any" src/ --include="*.ts"
```

### "Test failing"
```bash
# Run single test with verbose output
npm test -- path/to/test.ts --reporter=verbose

# Run with debugger
node --inspect-brk node_modules/.bin/vitest run path/to/test.ts
```

### "Database constraint violation"
```sql
-- Check current data
SELECT * FROM table_name WHERE id = 'xxx';

-- Check constraints
.schema table_name
```

### "WebSocket not connecting"
```javascript
// Check connection state
console.log(ws.readyState) // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED

// Check for errors
ws.onerror = (e) => console.error('WS Error:', e)
```

### "Process not spawning"
```bash
# Check if Claude CLI exists
which claude

# Try running directly
claude --version

# Check working directory exists
ls -la /path/to/worktree
```

## Step 5: Fix & Verify

1. Make the minimal fix
2. Add test to prevent regression
3. Verify fix doesn't break other tests
4. Clean up debug code
5. Document if it was a tricky issue

## Debug Checklist

- [ ] Error message understood
- [ ] Layer identified
- [ ] Reproduced reliably
- [ ] Root cause found
- [ ] Fix implemented
- [ ] Test added
- [ ] Debug code removed
- [ ] Other tests still pass
