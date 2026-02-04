# CI/CD Pipeline

## Overview

This document defines the continuous integration and continuous deployment pipelines for Claude Manager using GitHub Actions.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GitHub Repository                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              ┌─────────┐    ┌─────────┐    ┌─────────────┐
              │  Push   │    │   PR    │    │   Release   │
              │ to main │    │ Created │    │   Tag       │
              └────┬────┘    └────┬────┘    └──────┬──────┘
                   │              │                 │
                   ▼              ▼                 ▼
              ┌─────────────────────────────────────────┐
              │              CI Pipeline                 │
              │  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
              │  │  Lint   │  │  Test   │  │  Build  │  │
              │  └─────────┘  └─────────┘  └─────────┘  │
              └─────────────────────────────────────────┘
                                    │
                                    ▼
              ┌─────────────────────────────────────────┐
              │           Quality Gates                  │
              │  • Test coverage ≥ 80%                  │
              │  • No lint errors                       │
              │  • Build successful                     │
              │  • Security scan passed                 │
              └─────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
              ┌───────────┐                  ┌───────────┐
              │  Preview  │                  │  Release  │
              │  Deploy   │                  │  Deploy   │
              │  (PR)     │                  │  (Tag)    │
              └───────────┘                  └───────────┘
```

## Workflow Files

### 1. Main CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '9'

jobs:
  # ============================================
  # LINT & TYPE CHECK
  # ============================================
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint frontend
        run: pnpm --filter @claude-manager/frontend lint

      - name: Lint backend
        run: pnpm --filter @claude-manager/server lint

      - name: Type check frontend
        run: pnpm --filter @claude-manager/frontend typecheck

      - name: Type check backend
        run: pnpm --filter @claude-manager/server typecheck

  # ============================================
  # FRONTEND TESTS
  # ============================================
  test-frontend:
    name: Frontend Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run frontend tests
        run: pnpm --filter @claude-manager/frontend test:coverage

      - name: Upload frontend coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          flags: frontend
          name: frontend-coverage
          fail_ci_if_error: false

  # ============================================
  # BACKEND TESTS
  # ============================================
  test-backend:
    name: Backend Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run backend unit tests
        run: pnpm --filter @claude-manager/server test:unit:coverage

      - name: Run backend integration tests
        run: pnpm --filter @claude-manager/server test:integration

      - name: Upload backend coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./server/coverage/lcov.info
          flags: backend
          name: backend-coverage
          fail_ci_if_error: false

  # ============================================
  # BUILD
  # ============================================
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [test-frontend, test-backend]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build frontend
        run: pnpm --filter @claude-manager/frontend build

      - name: Build backend
        run: pnpm --filter @claude-manager/server build

      - name: Upload frontend build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: frontend-dist
          path: dist/
          retention-days: 7

      - name: Upload backend build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: backend-dist
          path: server/dist/
          retention-days: 7

  # ============================================
  # SECURITY SCAN
  # ============================================
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run npm audit
        run: pnpm audit --audit-level=high
        continue-on-error: true

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

  # ============================================
  # E2E TESTS (on PR only)
  # ============================================
  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'pull_request'
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm --filter @claude-manager/e2e exec playwright install --with-deps chromium

      - name: Download frontend build
        uses: actions/download-artifact@v4
        with:
          name: frontend-dist
          path: dist/

      - name: Download backend build
        uses: actions/download-artifact@v4
        with:
          name: backend-dist
          path: server/dist/

      - name: Run E2E tests
        run: pnpm --filter @claude-manager/e2e test
        env:
          CI: true

      - name: Upload E2E test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-results
          path: e2e/test-results/
          retention-days: 7

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

### 2. Release Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  packages: write

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '9'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ============================================
  # BUILD & TEST
  # ============================================
  build:
    name: Build & Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test

      - name: Build
        run: pnpm build

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: |
            dist/
            server/dist/
          retention-days: 1

  # ============================================
  # DOCKER BUILD & PUSH
  # ============================================
  docker:
    name: Docker Build & Push
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
            type=sha

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./docker/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ============================================
  # CREATE GITHUB RELEASE
  # ============================================
  release:
    name: Create Release
    runs-on: ubuntu-latest
    needs: [build, docker]
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist

      - name: Generate changelog
        id: changelog
        uses: orhun/git-cliff-action@v3
        with:
          config: cliff.toml
          args: --latest --strip header

      - name: Create tarball
        run: |
          tar -czvf claude-manager-${{ github.ref_name }}.tar.gz dist/ server/dist/

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          body: ${{ steps.changelog.outputs.content }}
          files: |
            claude-manager-${{ github.ref_name }}.tar.gz
          draft: false
          prerelease: ${{ contains(github.ref_name, '-') }}
```

### 3. PR Preview Deployment

```yaml
# .github/workflows/preview.yml
name: Preview Deploy

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '9'

jobs:
  deploy-preview:
    name: Deploy Preview
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build frontend
        run: pnpm --filter @claude-manager/frontend build
        env:
          VITE_API_URL: https://api-preview-${{ github.event.pull_request.number }}.claude-manager.dev

      # Deploy to your preview environment (Vercel, Netlify, etc.)
      - name: Deploy to Vercel
        id: deploy
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          scope: ${{ secrets.VERCEL_ORG_ID }}
          alias-domains: |
            pr-${{ github.event.pull_request.number }}.claude-manager.dev

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## 🚀 Preview Deployment Ready!

              | Environment | URL |
              |-------------|-----|
              | Frontend | [${{ steps.deploy.outputs.preview-url }}](${{ steps.deploy.outputs.preview-url }}) |

              *Commit: ${{ github.event.pull_request.head.sha }}*`
            })
```

### 4. Dependency Updates

```yaml
# .github/workflows/dependency-update.yml
name: Dependency Update

on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 6 AM
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  update-dependencies:
    name: Update Dependencies
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: '9'

      - name: Update dependencies
        run: |
          pnpm update --latest
          pnpm install

      - name: Run tests
        run: pnpm test
        continue-on-error: true

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v6
        with:
          commit-message: 'chore(deps): update dependencies'
          title: 'chore(deps): weekly dependency update'
          body: |
            ## Automated Dependency Update

            This PR updates project dependencies to their latest versions.

            ### Changes
            See the diff for updated packages.

            ### Checklist
            - [ ] Tests pass
            - [ ] Build succeeds
            - [ ] No breaking changes
          branch: deps/weekly-update
          delete-branch: true
          labels: |
            dependencies
            automated
```

## Docker Configuration

### Multi-Stage Dockerfile

```dockerfile
# docker/Dockerfile
# ============================================
# BASE STAGE
# ============================================
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9

WORKDIR /app

# ============================================
# DEPENDENCIES STAGE
# ============================================
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile --prod

# ============================================
# BUILD STAGE - Frontend
# ============================================
FROM base AS builder-frontend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @claude-manager/frontend build

# ============================================
# BUILD STAGE - Backend
# ============================================
FROM base AS builder-backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/ ./server/
COPY shared/ ./shared/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @claude-manager/server build

# ============================================
# PRODUCTION STAGE
# ============================================
FROM node:20-alpine AS runner
RUN apk add --no-cache git

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules

# Copy built assets
COPY --from=builder-frontend /app/dist ./dist
COPY --from=builder-backend /app/server/dist ./server/dist

# Copy package files for runtime
COPY package.json ./
COPY server/package.json ./server/

# Set ownership
RUN chown -R appuser:nodejs /app

USER appuser

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "server/dist/index.js"]
```

### Docker Compose for Development

```yaml
# docker/docker-compose.yml
version: '3.9'

services:
  frontend:
    build:
      context: ..
      dockerfile: docker/Dockerfile.dev
      target: frontend
    ports:
      - "8080:8080"
    volumes:
      - ../src:/app/src
      - ../public:/app/public
    environment:
      - VITE_API_URL=http://localhost:3001
    depends_on:
      - backend

  backend:
    build:
      context: ..
      dockerfile: docker/Dockerfile.dev
      target: backend
    ports:
      - "3001:3001"
    volumes:
      - ../server/src:/app/server/src
      - ../shared:/app/shared
      - claude-manager-data:/root/.claude-manager
    environment:
      - NODE_ENV=development
      - PORT=3001
      - DB_PATH=/root/.claude-manager/data.db
      - CORS_ORIGIN=http://localhost:8080

volumes:
  claude-manager-data:
```

### Development Dockerfile

```dockerfile
# docker/Dockerfile.dev
# Frontend development stage
FROM node:20-alpine AS frontend
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install
COPY . .
EXPOSE 8080
CMD ["pnpm", "run", "dev"]

# Backend development stage
FROM node:20-alpine AS backend
RUN apk add --no-cache git
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY shared/ ./shared/
RUN pnpm install
COPY server/ ./server/
EXPOSE 3001
CMD ["pnpm", "--filter", "@claude-manager/server", "run", "dev"]
```

## Quality Gates

### Branch Protection Rules

```yaml
# Recommended branch protection for 'main':
required_status_checks:
  strict: true
  contexts:
    - "Lint & Type Check"
    - "Frontend Tests"
    - "Backend Tests"
    - "Build"
    - "Security Scan"

required_pull_request_reviews:
  dismiss_stale_reviews: true
  require_code_owner_reviews: true
  required_approving_review_count: 1

enforce_admins: true
required_linear_history: true
allow_force_pushes: false
allow_deletions: false
```

### Code Coverage Requirements

```yaml
# codecov.yml
coverage:
  precision: 2
  round: down
  range: "70...100"
  status:
    project:
      default:
        target: 80%
        threshold: 2%
    patch:
      default:
        target: 80%
        threshold: 5%

parsers:
  gcov:
    branch_detection:
      conditional: yes
      loop: yes
      method: no
      macro: no

comment:
  layout: "reach,diff,flags,files"
  behavior: default
  require_changes: true
```

## Secrets & Environment Variables

### Required Secrets

| Secret | Description | Required For |
|--------|-------------|--------------|
| `CODECOV_TOKEN` | Codecov upload token | Coverage reporting |
| `VERCEL_TOKEN` | Vercel deployment token | Preview deployments |
| `VERCEL_ORG_ID` | Vercel organization ID | Preview deployments |
| `VERCEL_PROJECT_ID` | Vercel project ID | Preview deployments |
| `DOCKER_USERNAME` | Docker Hub username | Docker publishing |
| `DOCKER_PASSWORD` | Docker Hub password | Docker publishing |

### Environment Variables

```bash
# .env.example
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info

# Database
DB_PATH=~/.claude-manager/data.db

# Claude CLI
CLAUDE_CLI_PATH=claude
CLAUDE_CLI_TIMEOUT=300000

# CORS
CORS_ORIGIN=http://localhost:8080

# WebSocket
WS_HEARTBEAT_INTERVAL=30000
```

## Monitoring & Alerts

### GitHub Actions Notifications

```yaml
# Add to workflow jobs that should send notifications
- name: Notify on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    channel: '#ci-alerts'
    fields: repo,message,commit,author,action,eventName,ref,workflow
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Release Notification

```yaml
# In release.yml, after successful release
- name: Announce Release
  uses: 8398a7/action-slack@v3
  with:
    status: custom
    custom_payload: |
      {
        "text": "🎉 New Release: Claude Manager ${{ github.ref_name }}",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Claude Manager ${{ github.ref_name }}* has been released!\n\n${{ steps.changelog.outputs.content }}"
            }
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "text": { "type": "plain_text", "text": "View Release" },
                "url": "https://github.com/${{ github.repository }}/releases/tag/${{ github.ref_name }}"
              }
            ]
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Changelog Generation

### Git-Cliff Configuration

```toml
# cliff.toml
[changelog]
header = """
# Changelog\n
All notable changes to Claude Manager will be documented in this file.\n
"""
body = """
{% if version %}\
    ## [{{ version | trim_start_matches(pat="v") }}] - {{ timestamp | date(format="%Y-%m-%d") }}
{% else %}\
    ## [Unreleased]
{% endif %}\
{% for group, commits in commits | group_by(attribute="group") %}
    ### {{ group | striptags | trim | upper_first }}
    {% for commit in commits %}
        - {% if commit.scope %}**{{ commit.scope }}:** {% endif %}\
            {{ commit.message | upper_first }}\
            {% if commit.github.username %} by @{{ commit.github.username }}{%- endif %}\
    {% endfor %}
{% endfor %}\n
"""
footer = """
---
*Generated by [git-cliff](https://github.com/orhun/git-cliff)*
"""
trim = true

[git]
conventional_commits = true
filter_unconventional = true
split_commits = false
commit_parsers = [
  { message = "^feat", group = "Features" },
  { message = "^fix", group = "Bug Fixes" },
  { message = "^doc", group = "Documentation" },
  { message = "^perf", group = "Performance" },
  { message = "^refactor", group = "Refactoring" },
  { message = "^style", group = "Styling" },
  { message = "^test", group = "Testing" },
  { message = "^chore\\(deps\\)", group = "Dependencies" },
  { message = "^chore", group = "Miscellaneous" },
]
filter_commits = false
tag_pattern = "v[0-9].*"
skip_tags = ""
ignore_tags = ""
topo_order = false
sort_commits = "oldest"
```

This CI/CD pipeline provides comprehensive automation for testing, building, and deploying Claude Manager, with proper quality gates, security scanning, and release management.
