---
name: code-review
description: Comprehensive code review for Claude Manager. Use when reviewing PRs, checking code quality, auditing changes, or validating implementations. Triggers on "review this code", "check my changes", "audit this file", "is this implementation correct", or before committing significant changes.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Code Review Workflow

Perform thorough code reviews following Claude Manager's standards.

## Review Dimensions

### 1. Architecture & Design
- Does it follow patterns from `docs/01-architecture-overview.md`?
- Is the responsibility in the correct layer (route → service → repository)?
- Are dependencies properly injected?
- Is it over-engineered or under-engineered?

### 2. API Compliance
- Does it match `docs/02-api-specification.md`?
- Are request/response schemas correct?
- Is error handling consistent with API spec?
- Are WebSocket events properly typed?

### 3. Database
- Do queries match schema in `docs/03-database-schema.md`?
- Are indexes being used effectively?
- Is there potential for SQL injection?
- Are transactions used where needed?

### 4. TypeScript Quality
- Are types properly defined (no `any`)?
- Are interfaces in the correct location?
- Is `shared/types.ts` used for cross-boundary types?
- Are generics used appropriately?

### 5. Error Handling
- Are custom errors from `server/src/utils/errors.ts` used?
- Are all error cases handled?
- Are error messages helpful for debugging?
- Is sensitive info excluded from errors?

### 6. Testing
- Are unit tests written for new code?
- Do tests cover edge cases?
- Are mocks used appropriately?
- Is test coverage adequate (>80%)?

### 7. Security
- Is user input validated with Zod?
- Are file paths sanitized?
- Is there command injection risk in Bash calls?
- Are permissions checked before operations?

### 8. Performance
- Are there N+1 query issues?
- Is data fetched eagerly or lazily appropriately?
- Are WebSocket messages batched?
- Is React re-rendering optimized?

### 9. Frontend Patterns
- Are React Query hooks used correctly?
- Is state management appropriate (local vs global)?
- Are loading/error states handled?
- Do components follow existing patterns?

## Review Output Format

```markdown
## Code Review Summary

**Files Reviewed:** [list files]
**Overall Assessment:** [APPROVE / REQUEST CHANGES / NEEDS DISCUSSION]

### Critical Issues
- [blocking issues that must be fixed]

### Suggestions
- [non-blocking improvements]

### Positive Observations
- [good patterns to reinforce]

### Questions
- [areas needing clarification]
```

## Review Checklist

- [ ] No secrets/credentials in code
- [ ] No debug code left (console.log, debugger)
- [ ] Error messages are user-friendly
- [ ] Code follows existing patterns
- [ ] Tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
