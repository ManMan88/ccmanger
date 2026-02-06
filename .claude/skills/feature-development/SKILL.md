---
name: feature-development
description: End-to-end feature implementation workflow for Claude Manager. Use when implementing new features that span frontend and backend, require database changes, need API endpoints, or involve UI components. Supports both Node.js (legacy) and Rust (new) backends. Triggers on requests like "implement feature", "add new functionality", "build the X feature", or when working on implementation phases.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
---

# Feature Development Workflow

Follow this structured approach when implementing new features for Claude Manager.

## Phase 1: Research & Planning

1. **Read relevant documentation**
   - Review `docs/01-architecture-overview.md` for system design
   - Check `docs/02-api-specification.md` for API contracts
   - Consult `docs/03-database-schema.md` for data models
   - **For Rust:** Review `docs/09-rust-tauri-migration.md` for Rust patterns

2. **Analyze existing code**
   - Search for similar patterns in the codebase
   - Identify files that will need modification
   - List new files that need to be created

3. **Create implementation plan**
   - Use TodoWrite to track all tasks
   - Break down into: database → backend → API/Commands → frontend
   - Identify dependencies between tasks

## Phase 2: Database Layer

### Node.js (Legacy)
1. Create migration in `server/src/db/migrations/`
2. Update repository in `server/src/db/repositories/`
3. Add/update types in `shared/src/index.ts`
4. Write repository unit tests

### Rust (New)
1. Add migration SQL in `src-tauri/src/db/migrations/`
2. Update repository in `src-tauri/src/db/repositories/`
3. Add types in `src-tauri/src/types/`
4. Write repository unit tests with tempdir

## Phase 3: Backend Service

### Node.js (Legacy)
1. Implement service methods in `server/src/services/`
2. Follow existing patterns (dependency injection, event emitter)
3. Add proper error handling using `server/src/utils/errors.ts`
4. Write service unit tests with vitest

### Rust (New)
1. Implement service in `src-tauri/src/services/`
2. Use `Arc<Repository>` for dependency injection
3. Use `broadcast::Sender` for events
4. Add error handling with thiserror
5. Write unit tests with `#[test]` and `#[tokio::test]`

## Phase 4: API / Tauri Commands

### Node.js (Legacy)
1. Create/update routes in `server/src/routes/`
2. Add Zod validation schemas
3. Follow REST conventions
4. Write API integration tests with supertest

### Rust (New)
1. Create Tauri commands in `src-tauri/src/commands/`
2. Use `#[tauri::command]` attribute
3. Accept `State<'_, Arc<Service>>` for dependencies
4. Return `Result<T, String>` for error handling
5. Register in `tauri::generate_handler![]`

## Phase 5: WebSocket (if real-time needed)

### Node.js (Legacy)
1. Add event types in `server/src/websocket/`
2. Connect service events to WebSocket broadcasts
3. Update frontend WebSocket client

### Rust (New)
1. Add event types in `src-tauri/src/websocket/`
2. Use Axum WebSocket or Tauri events
3. Subscribe to `broadcast::Receiver<ProcessEvent>`
4. Broadcast to connected clients

## Phase 6: Frontend Integration

### For Both Backends
1. Add API client methods in `src/lib/api.ts`
   - Use `invoke()` for Tauri commands
   - Fallback to HTTP for dev without Tauri
2. Create/update React Query hooks in `src/hooks/`
3. Update components to use real data
4. Add loading and error states

```typescript
// Dual-mode API client pattern
async function getAgent(id: string): Promise<Agent> {
  if (isTauri) {
    return invoke<Agent>('get_agent', { id });
  }
  return request<Agent>('GET', `/agents/${id}`);
}
```

## Phase 7: Testing & Validation

### Node.js (Legacy)
```bash
npm test                    # Unit tests
npm run test:e2e           # E2E tests
npm run typecheck          # TypeScript check
npm run lint               # Linting
```

### Rust (New)
```bash
cd src-tauri
cargo test                 # Unit tests
cargo clippy -- -D warnings # Linting
cargo fmt --check          # Formatting
```

### Both
1. Test manually in development
2. Verify all edge cases
3. Check for regressions

## Code Quality Checklist

### TypeScript
- [ ] Types properly defined (no `any`)
- [ ] Error handling comprehensive
- [ ] No hardcoded values
- [ ] Tests written
- [ ] No console.log left
- [ ] API responses match spec

### Rust
- [ ] Types derive `Debug`, `Serialize`, `Deserialize`
- [ ] Error types use thiserror
- [ ] No `unwrap()` in production code
- [ ] All public items have `///` docs
- [ ] Tests use tempdir isolation
- [ ] Clippy passes with no warnings
- [ ] Code formatted with `cargo fmt`
