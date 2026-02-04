---
name: feature-development
description: End-to-end feature implementation workflow for Claude Manager. Use when implementing new features that span frontend and backend, require database changes, need API endpoints, or involve UI components. Triggers on requests like "implement feature", "add new functionality", "build the X feature", or when working on implementation phases from docs/07-implementation-phases.md.
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
   - Reference `docs/07-implementation-phases.md` for current phase tasks

2. **Analyze existing code**
   - Search for similar patterns in the codebase
   - Identify files that will need modification
   - List new files that need to be created

3. **Create implementation plan**
   - Use TodoWrite to track all tasks
   - Break down into: database → backend → API → frontend
   - Identify dependencies between tasks

## Phase 2: Database Layer (if needed)

1. Create migration in `server/src/db/migrations/`
2. Update repository in `server/src/db/repositories/`
3. Add/update types in `shared/types.ts`
4. Write repository unit tests

## Phase 3: Backend Service

1. Implement service methods in `server/src/services/`
2. Follow existing patterns (dependency injection, event emitter)
3. Add proper error handling using `server/src/utils/errors.ts`
4. Write service unit tests

## Phase 4: API Routes

1. Create/update routes in `server/src/routes/`
2. Add Zod validation schemas in `server/src/utils/validation.ts`
3. Follow REST conventions from `docs/02-api-specification.md`
4. Write API integration tests

## Phase 5: WebSocket (if real-time needed)

1. Add event types in `server/src/websocket/`
2. Connect service events to WebSocket broadcasts
3. Update frontend WebSocket client

## Phase 6: Frontend Integration

1. Add API client methods in `src/lib/api.ts`
2. Create/update React Query hooks in `src/hooks/`
3. Update components to use real data
4. Add loading and error states

## Phase 7: Testing & Validation

1. Run existing tests: `npm test`
2. Test manually in development
3. Verify all edge cases
4. Check for regressions

## Code Quality Checklist

- [ ] TypeScript types are properly defined
- [ ] Error handling is comprehensive
- [ ] No hardcoded values (use config)
- [ ] Follows existing code patterns
- [ ] Tests written for new code
- [ ] No console.log statements left
- [ ] API responses match specification
