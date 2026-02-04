---
name: git-workflow
description: Git workflow automation for Claude Manager. Use when creating branches, making commits, preparing PRs, or managing git operations. Triggers on "commit", "create PR", "create branch", "git workflow", or when ready to save work.
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
---

# Git Workflow

Git operations following Claude Manager conventions.

## Branch Naming

```
feature/description    # New features
fix/description        # Bug fixes
refactor/description   # Code refactoring
docs/description       # Documentation updates
test/description       # Test additions
chore/description      # Maintenance tasks
```

## Commit Message Format

```
<type>(<scope>): <subject>

<body>

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

**Scopes:**
- `frontend`: React/UI changes
- `backend`: Server changes
- `api`: API endpoint changes
- `db`: Database changes
- `ws`: WebSocket changes
- `docs`: Documentation
- `deps`: Dependencies

## Workflow Steps

### Starting Work

```bash
# Ensure on latest main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/my-feature
```

### Making Commits

```bash
# Check status
git status

# Stage specific files
git add src/components/NewComponent.tsx
git add src/hooks/useNewHook.ts

# Commit with message
git commit -m "$(cat <<'EOF'
feat(frontend): add new component for X

- Implemented NewComponent with Y functionality
- Added useNewHook for state management
- Updated Index.tsx to use new component

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

### Creating PR

```bash
# Push branch
git push -u origin feature/my-feature

# Create PR
gh pr create --title "feat(frontend): add new component" --body "$(cat <<'EOF'
## Summary
- Added NewComponent for X functionality
- Implemented useNewHook for state management

## Changes
- `src/components/NewComponent.tsx` - New component
- `src/hooks/useNewHook.ts` - New hook
- `src/pages/Index.tsx` - Integration

## Testing
- [ ] Unit tests pass
- [ ] Manual testing completed

## Screenshots
(if applicable)
EOF
)"
```

### Keeping Up to Date

```bash
# Rebase on main
git fetch origin
git rebase origin/main

# Resolve conflicts if any
git add .
git rebase --continue

# Force push (only on feature branches!)
git push --force-with-lease
```

## Pre-commit Checklist

- [ ] Code compiles (`npm run typecheck`)
- [ ] Tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] No debug code left
- [ ] Commit message follows format
- [ ] Changes are related (single purpose)

## Common Operations

```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Amend last commit
git commit --amend

# Interactive rebase (squash commits)
git rebase -i HEAD~3

# Stash changes
git stash
git stash pop

# View changes
git diff
git diff --staged
```
