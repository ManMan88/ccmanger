---
name: code-review
description: Comprehensive code review for Claude Manager. Use when reviewing PRs, checking code quality, auditing changes, or validating implementations. Supports both TypeScript and Rust code. Triggers on "review this code", "check my changes", "audit this file", "is this implementation correct", or before committing significant changes.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Code Review Workflow

Perform thorough code reviews following Claude Manager's standards for both TypeScript and Rust.

## Review Dimensions

### 1. Architecture & Design
- Does it follow patterns from `docs/01-architecture-overview.md`?
- **Rust:** Does it follow `docs/09-rust-tauri-migration.md`?
- Is the responsibility in the correct layer (route/command → service → repository)?
- Are dependencies properly injected?
- Is it over-engineered or under-engineered?

### 2. API Compliance
- Does it match `docs/02-api-specification.md`?
- Are request/response schemas correct?
- **Rust:** Do Tauri commands match the TypeScript API contract?
- Is error handling consistent with API spec?
- Are WebSocket events properly typed?

### 3. Database
- Do queries match schema in `docs/03-database-schema.md`?
- Are indexes being used effectively?
- Is there potential for SQL injection?
- Are transactions used where needed?
- **Rust:** Are queries parameterized with `rusqlite::params![]`?

### 4. Type Quality

#### TypeScript
- Are types properly defined (no `any`)?
- Are interfaces in the correct location?
- Is `shared/src/index.ts` used for cross-boundary types?
- Are generics used appropriately?

#### Rust
- Do types derive appropriate traits (`Debug`, `Clone`, `Serialize`, `Deserialize`)?
- Are enums used for state machines instead of strings?
- Is `#[serde(rename_all = "camelCase")]` used for API types?
- Are `Option<T>` and `Result<T, E>` used appropriately?

### 5. Error Handling

#### TypeScript
- Are custom errors from `server/src/utils/errors.ts` used?
- Are all error cases handled?

#### Rust
- Are error types defined with thiserror?
- Is `?` operator used instead of `unwrap()`?
- Do error messages include context (using `.map_err()`)?
- Is `expect()` used only in tests or with clear messages?

### 6. Testing

#### TypeScript
- Are unit tests written with Vitest?
- Do tests cover edge cases?
- Are mocks used appropriately?

#### Rust
- Are tests in `#[cfg(test)]` module?
- Is tempdir used for database isolation?
- Are async tests using `#[tokio::test]`?
- Do tests verify both success and error paths?

### 7. Security
- Is user input validated (Zod for TS, validator crate for Rust)?
- Are file paths sanitized?
- Is there command injection risk?
- Are permissions checked before operations?
- **Rust:** Is `unsafe` code avoided or well-documented?

### 8. Performance
- Are there N+1 query issues?
- Is data fetched eagerly or lazily appropriately?
- Are WebSocket messages batched?
- Is React re-rendering optimized?
- **Rust:** Are clones minimized (use references where possible)?
- **Rust:** Is `Arc` used instead of cloning large data?

### 9. Rust-Specific Patterns

#### Ownership & Borrowing
- Is ownership transferred only when necessary?
- Are references (`&T`) used for read-only access?
- Are lifetimes explicit only when needed?
- Is `Cow<'_, T>` used for flexible ownership?

#### Async Patterns
- Is `tokio::spawn` used for background tasks?
- Are locks held for minimal duration?
- Is `RwLock` used instead of `Mutex` for read-heavy access?
- Are channels (`broadcast`, `mpsc`) used for communication?

#### Concurrency Safety
- Is `Arc` used for shared state?
- Is `parking_lot` used for synchronization?
- Are there potential deadlocks?

### 10. Frontend Patterns
- Are React Query hooks used correctly?
- Is state management appropriate (local vs global)?
- Are loading/error states handled?
- Do components follow existing patterns?
- **Tauri:** Is `invoke()` used with proper error handling?

## Review Output Format

```markdown
## Code Review Summary

**Files Reviewed:** [list files]
**Language(s):** [TypeScript / Rust / Both]
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

### Both Languages
- [ ] No secrets/credentials in code
- [ ] No debug code left
- [ ] Error messages are user-friendly
- [ ] Code follows existing patterns
- [ ] Tests pass

### TypeScript
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] No `console.log` statements
- [ ] No `any` types

### Rust
- [ ] Compiles without warnings (`cargo build`)
- [ ] Clippy passes (`cargo clippy -- -D warnings`)
- [ ] Formatted (`cargo fmt --check`)
- [ ] No `unwrap()` in production code
- [ ] All public items have `///` doc comments
- [ ] Tests pass (`cargo test`)
