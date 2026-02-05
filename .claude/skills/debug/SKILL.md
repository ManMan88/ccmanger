---
name: debug
description: Debug issues in Claude Manager across frontend, backend (Node.js and Rust), database, and process management. Use when encountering errors, unexpected behavior, test failures, or performance issues. Triggers on "debug", "fix this error", "why is this failing", "investigate issue", or when errors appear in output.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Task
---

# Debug Workflow

Systematic debugging approach for Claude Manager issues across TypeScript and Rust codebases.

## Step 1: Understand the Error

### Gather Information
- What is the exact error message?
- Where does it occur (frontend/backend/database)?
- Is it reproducible?
- When did it start happening?
- **Which backend?** Node.js (server/) or Rust (src-tauri/)?

### Check Logs

#### Node.js Backend
```bash
# Backend logs (if running)
tail -f server/logs/*.log

# Test output
npm test -- --reporter=verbose
```

#### Rust Backend
```bash
# Tauri logs (with RUST_LOG)
RUST_LOG=debug cargo tauri dev

# Run with backtrace
RUST_BACKTRACE=1 cargo run

# Test output
cargo test -- --nocapture
```

#### Frontend
```bash
# Check browser DevTools Console
# Check Network tab for API errors
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
  - **Tauri:** `invoke()` returning error string

### Backend API Issues

#### Node.js (Legacy)
- **Symptoms:** 4xx/5xx errors, wrong response format
- **Check:** Server logs, request/response in Network tab
- **Common causes:**
  - Validation schema mismatch
  - Service throwing unhandled error
  - Database query failing
  - Missing middleware

#### Rust (New)
- **Symptoms:** Tauri command returning error, panics
- **Check:** Terminal output with `RUST_LOG=debug`
- **Common causes:**
  - Missing `?` operator (error not propagated)
  - `unwrap()` on None/Err
  - State not managed in Tauri
  - Serde deserialization mismatch

### Database Issues
- **Symptoms:** Data not persisting, constraint violations
- **Check:** SQLite database directly
- **Common causes:**
  - Migration not run
  - Foreign key constraint
  - Unique constraint violation
  - Wrong data type
  - **Rust:** Connection pool exhausted

### Process Management Issues

#### Node.js
- **Symptoms:** Agent not starting, output not streaming
- **Check:** Process list, stdout/stderr
- **Common causes:**
  - Claude CLI not found in PATH
  - Working directory incorrect
  - Stdin/stdout not connected

#### Rust
- **Symptoms:** `tokio::process::Command` failing
- **Check:** RUST_BACKTRACE=1 output
- **Common causes:**
  - Async runtime not initialized
  - Lock contention on processes map
  - Channel receiver dropped
  - Process exited before handling

### WebSocket Issues
- **Symptoms:** No real-time updates, connection dropping
- **Check:** WebSocket frames in Network tab
- **Common causes:**
  - Not subscribed to channel
  - Server not broadcasting
  - Connection timeout
  - Message format wrong
  - **Rust:** Broadcast channel capacity exceeded

## Step 3: Isolate the Problem

### Create Minimal Reproduction

#### TypeScript
```typescript
describe('debug test', () => {
  it('reproduces the issue', async () => {
    // Minimal code to trigger the bug
  })
})
```

#### Rust
```rust
#[cfg(test)]
mod debug_tests {
    use super::*;

    #[test]
    fn reproduces_the_issue() {
        // Minimal code to trigger the bug
    }

    #[tokio::test]
    async fn reproduces_async_issue() {
        // For async bugs
    }
}
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

#### TypeScript
```typescript
// Temporary debugging (remove before commit!)
console.log('[DEBUG]', { variable, state })
debugger
```

#### Rust
```rust
// Temporary debugging (remove before commit!)
dbg!(&variable);
println!("[DEBUG] {:?}", state);

// Or use tracing
tracing::debug!(?variable, "debugging state");
```

## Step 4: Common Issues & Solutions

### TypeScript Issues

#### "Cannot find module"
```bash
ls node_modules/<module>
rm -rf node_modules && npm install
```

#### "Type error"
```bash
npm run typecheck
grep -r "any" src/ --include="*.ts"
```

#### "Test failing"
```bash
npm test -- path/to/test.ts --reporter=verbose
node --inspect-brk node_modules/.bin/vitest run path/to/test.ts
```

### Rust Issues

#### "cannot borrow as mutable"
```rust
// Problem: Trying to mutate borrowed data
let x = &data;
x.mutate(); // Error!

// Solution: Use mutable reference or interior mutability
let x = &mut data;
x.mutate();
// Or use Arc<RwLock<T>> for shared mutable state
```

#### "cannot move out of borrowed content"
```rust
// Problem: Moving owned data from a reference
fn take_ownership(s: String) {}
let borrowed = &my_string;
take_ownership(*borrowed); // Error!

// Solution: Clone or change function signature
take_ownership(borrowed.clone());
// Or: fn take_ref(s: &str) {}
```

#### "value does not live long enough"
```rust
// Problem: Reference outlives the data
fn return_ref() -> &str {
    let s = String::from("hello");
    &s // Error! s is dropped
}

// Solution: Return owned data or use 'static
fn return_owned() -> String {
    String::from("hello")
}
```

#### "thread 'main' panicked"
```bash
# Get full backtrace
RUST_BACKTRACE=full cargo run

# Find the unwrap/expect that panicked
grep -r "unwrap()" src-tauri/src/
grep -r "expect(" src-tauri/src/
```

#### "the trait bound is not satisfied"
```rust
// Check what traits are required
// Add #[derive(...)] or impl the trait manually

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MyType { ... }
```

#### "async fn is not Send"
```rust
// Problem: Holding non-Send type across await
let data = Rc::new(...); // Rc is not Send
some_async_fn().await;

// Solution: Use Arc instead of Rc
let data = Arc::new(...);
```

### Database Issues

```sql
-- Check current data
SELECT * FROM table_name WHERE id = 'xxx';

-- Check constraints
.schema table_name

-- Check foreign keys
PRAGMA foreign_keys;
```

### WebSocket Issues

```javascript
// Check connection state
console.log(ws.readyState) // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
ws.onerror = (e) => console.error('WS Error:', e)
```

### Process Issues

```bash
# Check if Claude CLI exists
which claude
claude --version

# Check working directory
ls -la /path/to/worktree

# Check running processes (Linux/macOS)
ps aux | grep claude
```

## Step 5: Fix & Verify

1. Make the minimal fix
2. Add test to prevent regression
3. Verify fix doesn't break other tests
4. Clean up debug code
5. Document if it was a tricky issue

### Verification Commands

#### TypeScript
```bash
npm test
npm run typecheck
npm run lint
```

#### Rust
```bash
cargo test
cargo clippy -- -D warnings
cargo fmt --check
```

## Debug Checklist

### Both Languages
- [ ] Error message understood
- [ ] Layer identified
- [ ] Reproduced reliably
- [ ] Root cause found
- [ ] Fix implemented
- [ ] Test added
- [ ] Debug code removed
- [ ] Other tests still pass

### Rust-Specific
- [ ] No `unwrap()` added in production code
- [ ] Clippy passes
- [ ] No new warnings
- [ ] Async code properly awaited
- [ ] Locks released before await points
