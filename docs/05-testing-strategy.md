# Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for Claude Manager, covering unit tests, integration tests, end-to-end tests, and test infrastructure.

## Testing Stack

| Tool | Purpose | Version |
|------|---------|---------|
| Vitest | Test runner | 3.x |
| @vitest/coverage-v8 | Coverage reports | 3.x |
| Supertest | HTTP testing | 6.x |
| MSW (Mock Service Worker) | API mocking | 2.x |
| @testing-library/react | React component testing | 16.x |
| Playwright | E2E testing | 1.x |

## Test Directory Structure

```
├── src/                          # Frontend tests (co-located)
│   └── components/
│       ├── AgentBox.tsx
│       └── AgentBox.test.tsx
│
├── server/
│   └── tests/
│       ├── unit/
│       │   ├── services/
│       │   │   ├── agent.service.test.ts
│       │   │   ├── git.service.test.ts
│       │   │   ├── process.service.test.ts
│       │   │   └── workspace.service.test.ts
│       │   ├── repositories/
│       │   │   ├── agent.repository.test.ts
│       │   │   ├── message.repository.test.ts
│       │   │   └── worktree.repository.test.ts
│       │   └── utils/
│       │       ├── validation.test.ts
│       │       └── id.test.ts
│       ├── integration/
│       │   ├── api/
│       │   │   ├── agents.test.ts
│       │   │   ├── worktrees.test.ts
│       │   │   └── workspaces.test.ts
│       │   ├── websocket/
│       │   │   └── agent-streaming.test.ts
│       │   └── database/
│       │       └── migrations.test.ts
│       ├── e2e/
│       │   └── (Playwright tests)
│       └── fixtures/
│           ├── agents.ts
│           ├── workspaces.ts
│           ├── worktrees.ts
│           └── messages.ts
│
└── e2e/                          # End-to-end tests
    ├── tests/
    │   ├── workspace.spec.ts
    │   ├── agent-lifecycle.spec.ts
    │   └── worktree-management.spec.ts
    └── playwright.config.ts
```

## Coverage Requirements

| Category | Minimum Coverage | Target Coverage |
|----------|------------------|-----------------|
| Unit Tests | 80% | 90% |
| Integration Tests | 70% | 80% |
| Critical Paths | 95% | 100% |
| Overall | 75% | 85% |

### Critical Paths (Must Have 95%+ Coverage)

1. Agent spawning and lifecycle management
2. Message send/receive flow
3. Git worktree operations
4. Database migrations
5. WebSocket connection handling
6. Error handling and recovery

---

## Unit Testing

### Configuration

```typescript
// server/vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/**/*.d.ts',
        'src/types/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
})
```

### Test Setup

```typescript
// server/tests/setup.ts
import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { runMigrations } from '../src/db/migrations/index.js'

// Test database path
const TEST_DB_PATH = path.join(__dirname, '.test.db')

// Global test database
let testDb: Database.Database | null = null

export function getTestDatabase(): Database.Database {
  if (!testDb) {
    throw new Error('Test database not initialized')
  }
  return testDb
}

beforeAll(() => {
  // Create fresh test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH)
  }

  testDb = new Database(TEST_DB_PATH)
  testDb.pragma('foreign_keys = ON')
  runMigrations(testDb)
})

afterAll(() => {
  if (testDb) {
    testDb.close()
    testDb = null
  }
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH)
  }
})

beforeEach(() => {
  // Clear all tables before each test
  if (testDb) {
    testDb.exec(`
      DELETE FROM messages;
      DELETE FROM agent_sessions;
      DELETE FROM agents;
      DELETE FROM worktrees;
      DELETE FROM workspaces;
    `)
  }
})

// Mock logger to suppress output
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}))
```

### Service Unit Tests

```typescript
// server/tests/unit/services/agent.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentService } from '@/services/agent.service'
import { AgentRepository } from '@/db/repositories/agent.repository'
import { MessageRepository } from '@/db/repositories/message.repository'
import { WorktreeRepository } from '@/db/repositories/worktree.repository'
import { getTestDatabase } from '../../setup'
import { NotFoundError, ConflictError } from '@/utils/errors'

describe('AgentService', () => {
  let agentService: AgentService
  let agentRepo: AgentRepository
  let messageRepo: MessageRepository
  let worktreeRepo: WorktreeRepository

  beforeEach(() => {
    const db = getTestDatabase()
    agentRepo = new AgentRepository(db)
    messageRepo = new MessageRepository(db)
    worktreeRepo = new WorktreeRepository(db)
    agentService = new AgentService(agentRepo, messageRepo, worktreeRepo)

    // Create test workspace and worktree
    db.prepare(`
      INSERT INTO workspaces (id, name, path) VALUES ('ws_test', 'test', '/tmp/test')
    `).run()
    db.prepare(`
      INSERT INTO worktrees (id, workspace_id, name, branch, path)
      VALUES ('wt_test', 'ws_test', 'main', 'main', '/tmp/test')
    `).run()
  })

  describe('createAgent', () => {
    it('should create an agent with default values', async () => {
      const agent = await agentService.createAgent({
        worktreeId: 'wt_test',
        name: 'Test Agent',
        mode: 'regular',
        permissions: ['read'],
      })

      expect(agent).toBeDefined()
      expect(agent.id).toMatch(/^ag_/)
      expect(agent.name).toBe('Test Agent')
      expect(agent.status).toBe('waiting')
      expect(agent.mode).toBe('regular')
      expect(agent.context_level).toBe(0)
    })

    it('should throw NotFoundError for invalid worktree', async () => {
      await expect(
        agentService.createAgent({
          worktreeId: 'wt_nonexistent',
          name: 'Test',
          mode: 'regular',
          permissions: ['read'],
        })
      ).rejects.toThrow(NotFoundError)
    })

    it('should auto-generate name when not provided', async () => {
      const agent = await agentService.createAgent({
        worktreeId: 'wt_test',
        mode: 'regular',
        permissions: ['read'],
      })

      expect(agent.name).toMatch(/^Agent /)
    })

    it('should emit agent:created event', async () => {
      const listener = vi.fn()
      agentService.on('agent:created', listener)

      await agentService.createAgent({
        worktreeId: 'wt_test',
        name: 'Test',
        mode: 'regular',
        permissions: ['read'],
      })

      expect(listener).toHaveBeenCalledOnce()
    })
  })

  describe('updateAgent', () => {
    let testAgentId: string

    beforeEach(async () => {
      const agent = await agentService.createAgent({
        worktreeId: 'wt_test',
        name: 'Test',
        mode: 'regular',
        permissions: ['read'],
      })
      testAgentId = agent.id
    })

    it('should update agent name', async () => {
      const updated = await agentService.updateAgent(testAgentId, {
        name: 'Updated Name',
      })

      expect(updated.name).toBe('Updated Name')
    })

    it('should update agent mode', async () => {
      const updated = await agentService.updateAgent(testAgentId, {
        mode: 'auto',
      })

      expect(updated.mode).toBe('auto')
    })

    it('should update permissions', async () => {
      const updated = await agentService.updateAgent(testAgentId, {
        permissions: ['read', 'write', 'execute'],
      })

      expect(JSON.parse(updated.permissions)).toEqual(['read', 'write', 'execute'])
    })

    it('should throw NotFoundError for invalid agent', async () => {
      await expect(
        agentService.updateAgent('ag_nonexistent', { name: 'Test' })
      ).rejects.toThrow(NotFoundError)
    })
  })

  describe('deleteAgent', () => {
    let testAgentId: string

    beforeEach(async () => {
      const agent = await agentService.createAgent({
        worktreeId: 'wt_test',
        name: 'Test',
        mode: 'regular',
        permissions: ['read'],
      })
      testAgentId = agent.id
    })

    it('should soft delete agent by default', async () => {
      await agentService.deleteAgent(testAgentId)

      const agent = agentRepo.findById(testAgentId)
      expect(agent).not.toBeNull()
      expect(agent?.deleted_at).not.toBeNull()
    })

    it('should hard delete when archive=false', async () => {
      await agentService.deleteAgent(testAgentId, false)

      const agent = agentRepo.findById(testAgentId)
      expect(agent).toBeNull()
    })

    it('should emit agent:deleted event', async () => {
      const listener = vi.fn()
      agentService.on('agent:deleted', listener)

      await agentService.deleteAgent(testAgentId)

      expect(listener).toHaveBeenCalledWith(testAgentId)
    })
  })

  describe('forkAgent', () => {
    let testAgentId: string

    beforeEach(async () => {
      const agent = await agentService.createAgent({
        worktreeId: 'wt_test',
        name: 'Original',
        mode: 'auto',
        permissions: ['read', 'write'],
      })
      testAgentId = agent.id
    })

    it('should create a copy with same settings', async () => {
      const forked = await agentService.forkAgent(testAgentId)

      expect(forked.id).not.toBe(testAgentId)
      expect(forked.name).toBe('Original (Fork)')
      expect(forked.mode).toBe('auto')
      expect(JSON.parse(forked.permissions)).toEqual(['read', 'write'])
    })

    it('should allow custom name for fork', async () => {
      const forked = await agentService.forkAgent(testAgentId, 'Custom Fork Name')

      expect(forked.name).toBe('Custom Fork Name')
    })
  })

  describe('reorderAgents', () => {
    let agents: any[]

    beforeEach(async () => {
      agents = []
      for (let i = 0; i < 3; i++) {
        const agent = await agentService.createAgent({
          worktreeId: 'wt_test',
          name: `Agent ${i}`,
          mode: 'regular',
          permissions: ['read'],
        })
        agents.push(agent)
      }
    })

    it('should reorder agents', async () => {
      const newOrder = [agents[2].id, agents[0].id, agents[1].id]
      await agentService.reorderAgents('wt_test', newOrder)

      const reordered = agentService.getAgentsByWorktree('wt_test')
      expect(reordered[0].id).toBe(agents[2].id)
      expect(reordered[1].id).toBe(agents[0].id)
      expect(reordered[2].id).toBe(agents[1].id)
    })
  })
})
```

### Repository Unit Tests

```typescript
// server/tests/unit/repositories/agent.repository.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRepository } from '@/db/repositories/agent.repository'
import { getTestDatabase } from '../../setup'

describe('AgentRepository', () => {
  let repo: AgentRepository

  beforeEach(() => {
    const db = getTestDatabase()
    repo = new AgentRepository(db)

    // Setup test data
    db.prepare(`
      INSERT INTO workspaces (id, name, path) VALUES ('ws_test', 'test', '/tmp/test')
    `).run()
    db.prepare(`
      INSERT INTO worktrees (id, workspace_id, name, branch, path)
      VALUES ('wt_test', 'ws_test', 'main', 'main', '/tmp/test')
    `).run()
  })

  describe('create', () => {
    it('should create agent with generated id', () => {
      const agent = repo.create({
        worktreeId: 'wt_test',
        name: 'Test Agent',
        mode: 'regular',
        permissions: ['read'],
      })

      expect(agent.id).toMatch(/^ag_/)
      expect(agent.name).toBe('Test Agent')
    })

    it('should auto-increment display_order', () => {
      const agent1 = repo.create({
        worktreeId: 'wt_test',
        name: 'Agent 1',
        mode: 'regular',
        permissions: ['read'],
      })
      const agent2 = repo.create({
        worktreeId: 'wt_test',
        name: 'Agent 2',
        mode: 'regular',
        permissions: ['read'],
      })

      expect(agent1.display_order).toBe(0)
      expect(agent2.display_order).toBe(1)
    })
  })

  describe('findById', () => {
    it('should return null for non-existent id', () => {
      const agent = repo.findById('ag_nonexistent')
      expect(agent).toBeNull()
    })

    it('should return agent by id', () => {
      const created = repo.create({
        worktreeId: 'wt_test',
        name: 'Test',
        mode: 'regular',
        permissions: ['read'],
      })

      const found = repo.findById(created.id)
      expect(found).not.toBeNull()
      expect(found?.name).toBe('Test')
    })
  })

  describe('findByWorktreeId', () => {
    it('should return empty array for worktree with no agents', () => {
      const agents = repo.findByWorktreeId('wt_test')
      expect(agents).toEqual([])
    })

    it('should return agents ordered by display_order', () => {
      repo.create({ worktreeId: 'wt_test', name: 'A', mode: 'regular', permissions: ['read'] })
      repo.create({ worktreeId: 'wt_test', name: 'B', mode: 'regular', permissions: ['read'] })
      repo.create({ worktreeId: 'wt_test', name: 'C', mode: 'regular', permissions: ['read'] })

      const agents = repo.findByWorktreeId('wt_test')
      expect(agents).toHaveLength(3)
      expect(agents[0].name).toBe('A')
      expect(agents[1].name).toBe('B')
      expect(agents[2].name).toBe('C')
    })

    it('should exclude soft-deleted agents by default', () => {
      const agent = repo.create({
        worktreeId: 'wt_test',
        name: 'Test',
        mode: 'regular',
        permissions: ['read'],
      })
      repo.softDelete(agent.id)

      const agents = repo.findByWorktreeId('wt_test')
      expect(agents).toHaveLength(0)
    })

    it('should include soft-deleted when requested', () => {
      const agent = repo.create({
        worktreeId: 'wt_test',
        name: 'Test',
        mode: 'regular',
        permissions: ['read'],
      })
      repo.softDelete(agent.id)

      const agents = repo.findByWorktreeId('wt_test', true)
      expect(agents).toHaveLength(1)
    })
  })

  describe('update', () => {
    it('should update specified fields only', () => {
      const agent = repo.create({
        worktreeId: 'wt_test',
        name: 'Original',
        mode: 'regular',
        permissions: ['read'],
      })

      const updated = repo.update(agent.id, { name: 'Updated' })

      expect(updated.name).toBe('Updated')
      expect(updated.mode).toBe('regular') // Unchanged
    })

    it('should update updated_at timestamp', () => {
      const agent = repo.create({
        worktreeId: 'wt_test',
        name: 'Test',
        mode: 'regular',
        permissions: ['read'],
      })

      const originalUpdatedAt = agent.updated_at

      // Small delay to ensure timestamp difference
      const updated = repo.update(agent.id, { name: 'Updated' })

      expect(updated.updated_at).not.toBe(originalUpdatedAt)
    })
  })

  describe('softDelete', () => {
    it('should set deleted_at timestamp', () => {
      const agent = repo.create({
        worktreeId: 'wt_test',
        name: 'Test',
        mode: 'regular',
        permissions: ['read'],
      })

      repo.softDelete(agent.id)

      const deleted = repo.findById(agent.id)
      expect(deleted?.deleted_at).not.toBeNull()
    })

    it('should set status to finished and clear pid', () => {
      const agent = repo.create({
        worktreeId: 'wt_test',
        name: 'Test',
        mode: 'regular',
        permissions: ['read'],
      })
      repo.update(agent.id, { status: 'running', pid: 12345 })

      repo.softDelete(agent.id)

      const deleted = repo.findById(agent.id)
      expect(deleted?.status).toBe('finished')
      expect(deleted?.pid).toBeNull()
    })
  })

  describe('reorder', () => {
    it('should update display_order based on array position', () => {
      const a1 = repo.create({ worktreeId: 'wt_test', name: 'A', mode: 'regular', permissions: ['read'] })
      const a2 = repo.create({ worktreeId: 'wt_test', name: 'B', mode: 'regular', permissions: ['read'] })
      const a3 = repo.create({ worktreeId: 'wt_test', name: 'C', mode: 'regular', permissions: ['read'] })

      repo.reorder('wt_test', [a3.id, a1.id, a2.id])

      const agents = repo.findByWorktreeId('wt_test')
      expect(agents[0].id).toBe(a3.id)
      expect(agents[1].id).toBe(a1.id)
      expect(agents[2].id).toBe(a2.id)
    })
  })
})
```

### Git Service Unit Tests

```typescript
// server/tests/unit/services/git.service.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GitService } from '@/services/git.service'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

describe('GitService', () => {
  const testRepoPath = path.join(__dirname, '../../fixtures/test-repo')
  let gitService: GitService

  beforeEach(() => {
    // Create test repository
    fs.mkdirSync(testRepoPath, { recursive: true })
    execSync('git init', { cwd: testRepoPath })
    execSync('git config user.email "test@test.com"', { cwd: testRepoPath })
    execSync('git config user.name "Test"', { cwd: testRepoPath })
    fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Test')
    execSync('git add .', { cwd: testRepoPath })
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath })

    gitService = new GitService(testRepoPath)
  })

  afterEach(() => {
    // Cleanup test repository
    fs.rmSync(testRepoPath, { recursive: true, force: true })
  })

  describe('isValidRepository', () => {
    it('should return true for valid git repository', async () => {
      const isValid = await gitService.isValidRepository()
      expect(isValid).toBe(true)
    })

    it('should return false for non-repository', async () => {
      const nonRepoPath = path.join(__dirname, '../../fixtures/non-repo')
      fs.mkdirSync(nonRepoPath, { recursive: true })

      const service = new GitService(nonRepoPath)
      const isValid = await service.isValidRepository()

      expect(isValid).toBe(false)
      fs.rmSync(nonRepoPath, { recursive: true })
    })
  })

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      const branch = await gitService.getCurrentBranch()
      expect(['main', 'master']).toContain(branch)
    })
  })

  describe('listWorktrees', () => {
    it('should return main worktree', async () => {
      const worktrees = await gitService.listWorktrees()

      expect(worktrees).toHaveLength(1)
      expect(worktrees[0].path).toBe(testRepoPath)
      expect(worktrees[0].isMain).toBe(true)
    })
  })

  describe('addWorktree', () => {
    it('should create new worktree with existing branch', async () => {
      // Create a new branch first
      execSync('git branch feature-test', { cwd: testRepoPath })

      const worktreePath = path.join(testRepoPath, '../test-worktree')
      await gitService.addWorktree(worktreePath, 'feature-test', false)

      const worktrees = await gitService.listWorktrees()
      expect(worktrees).toHaveLength(2)

      // Cleanup
      await gitService.removeWorktree(worktreePath, true)
    })

    it('should create new worktree with new branch', async () => {
      const worktreePath = path.join(testRepoPath, '../test-worktree-new')
      await gitService.addWorktree(worktreePath, 'new-feature', true)

      const worktrees = await gitService.listWorktrees()
      expect(worktrees).toHaveLength(2)
      expect(worktrees.some(w => w.branch === 'new-feature')).toBe(true)

      // Cleanup
      await gitService.removeWorktree(worktreePath, true)
    })
  })

  describe('listBranches', () => {
    it('should list local branches', async () => {
      const { local } = await gitService.listBranches()
      expect(local.length).toBeGreaterThan(0)
    })
  })
})
```

---

## Integration Testing

### API Integration Tests

```typescript
// server/tests/integration/api/agents.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import request from 'supertest'
import { buildApp } from '@/app'
import { getTestDatabase } from '../../setup'

describe('Agent API', () => {
  let app: FastifyInstance
  let workspaceId: string
  let worktreeId: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    const db = getTestDatabase()

    // Create test workspace and worktree
    db.prepare(`
      INSERT INTO workspaces (id, name, path) VALUES ('ws_int_test', 'integration-test', '/tmp/int-test')
    `).run()
    db.prepare(`
      INSERT INTO worktrees (id, workspace_id, name, branch, path)
      VALUES ('wt_int_test', 'ws_int_test', 'main', 'main', '/tmp/int-test')
    `).run()

    workspaceId = 'ws_int_test'
    worktreeId = 'wt_int_test'
  })

  describe('POST /api/agents', () => {
    it('should create a new agent', async () => {
      const response = await request(app.server)
        .post('/api/agents')
        .send({
          worktreeId,
          name: 'Test Agent',
          mode: 'regular',
          permissions: ['read', 'write'],
        })
        .expect(201)

      expect(response.body.id).toMatch(/^ag_/)
      expect(response.body.name).toBe('Test Agent')
      expect(response.body.status).toBe('waiting')
    })

    it('should return 400 for invalid worktree', async () => {
      const response = await request(app.server)
        .post('/api/agents')
        .send({
          worktreeId: 'wt_nonexistent',
          name: 'Test',
          mode: 'regular',
          permissions: ['read'],
        })
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should return 400 for invalid mode', async () => {
      const response = await request(app.server)
        .post('/api/agents')
        .send({
          worktreeId,
          name: 'Test',
          mode: 'invalid',
          permissions: ['read'],
        })
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('GET /api/agents/:id', () => {
    let agentId: string

    beforeEach(async () => {
      const response = await request(app.server)
        .post('/api/agents')
        .send({
          worktreeId,
          name: 'Test Agent',
          mode: 'regular',
          permissions: ['read'],
        })

      agentId = response.body.id
    })

    it('should return agent by id', async () => {
      const response = await request(app.server)
        .get(`/api/agents/${agentId}`)
        .expect(200)

      expect(response.body.id).toBe(agentId)
      expect(response.body.name).toBe('Test Agent')
    })

    it('should return 404 for non-existent agent', async () => {
      await request(app.server)
        .get('/api/agents/ag_nonexistent')
        .expect(404)
    })
  })

  describe('PUT /api/agents/:id', () => {
    let agentId: string

    beforeEach(async () => {
      const response = await request(app.server)
        .post('/api/agents')
        .send({
          worktreeId,
          name: 'Original Name',
          mode: 'regular',
          permissions: ['read'],
        })

      agentId = response.body.id
    })

    it('should update agent name', async () => {
      const response = await request(app.server)
        .put(`/api/agents/${agentId}`)
        .send({ name: 'Updated Name' })
        .expect(200)

      expect(response.body.name).toBe('Updated Name')
    })

    it('should update agent mode', async () => {
      const response = await request(app.server)
        .put(`/api/agents/${agentId}`)
        .send({ mode: 'auto' })
        .expect(200)

      expect(response.body.mode).toBe('auto')
    })
  })

  describe('DELETE /api/agents/:id', () => {
    let agentId: string

    beforeEach(async () => {
      const response = await request(app.server)
        .post('/api/agents')
        .send({
          worktreeId,
          name: 'To Delete',
          mode: 'regular',
          permissions: ['read'],
        })

      agentId = response.body.id
    })

    it('should soft delete agent', async () => {
      await request(app.server)
        .delete(`/api/agents/${agentId}`)
        .expect(204)

      // Agent should still exist in database (soft delete)
      const response = await request(app.server)
        .get(`/api/agents?worktreeId=${worktreeId}&includeDeleted=true`)
        .expect(200)

      const deleted = response.body.agents.find((a: any) => a.id === agentId)
      expect(deleted).toBeDefined()
      expect(deleted.deleted_at).not.toBeNull()
    })

    it('should hard delete when archive=false', async () => {
      await request(app.server)
        .delete(`/api/agents/${agentId}?archive=false`)
        .expect(204)

      // Agent should not exist in database
      const response = await request(app.server)
        .get(`/api/agents?worktreeId=${worktreeId}&includeDeleted=true`)
        .expect(200)

      const deleted = response.body.agents.find((a: any) => a.id === agentId)
      expect(deleted).toBeUndefined()
    })
  })

  describe('POST /api/agents/:id/fork', () => {
    let agentId: string

    beforeEach(async () => {
      const response = await request(app.server)
        .post('/api/agents')
        .send({
          worktreeId,
          name: 'Parent Agent',
          mode: 'auto',
          permissions: ['read', 'write'],
        })

      agentId = response.body.id
    })

    it('should create forked agent', async () => {
      const response = await request(app.server)
        .post(`/api/agents/${agentId}/fork`)
        .send({})
        .expect(201)

      expect(response.body.id).not.toBe(agentId)
      expect(response.body.name).toBe('Parent Agent (Fork)')
      expect(response.body.mode).toBe('auto')
    })

    it('should use custom name when provided', async () => {
      const response = await request(app.server)
        .post(`/api/agents/${agentId}/fork`)
        .send({ name: 'Custom Fork' })
        .expect(201)

      expect(response.body.name).toBe('Custom Fork')
    })
  })

  describe('PUT /api/agents/reorder', () => {
    let agentIds: string[]

    beforeEach(async () => {
      agentIds = []
      for (const name of ['A', 'B', 'C']) {
        const response = await request(app.server)
          .post('/api/agents')
          .send({
            worktreeId,
            name: `Agent ${name}`,
            mode: 'regular',
            permissions: ['read'],
          })
        agentIds.push(response.body.id)
      }
    })

    it('should reorder agents', async () => {
      const newOrder = [agentIds[2], agentIds[0], agentIds[1]]

      await request(app.server)
        .put('/api/agents/reorder')
        .send({ worktreeId, agentIds: newOrder })
        .expect(200)

      const response = await request(app.server)
        .get(`/api/agents?worktreeId=${worktreeId}`)
        .expect(200)

      expect(response.body.agents[0].id).toBe(agentIds[2])
      expect(response.body.agents[1].id).toBe(agentIds[0])
      expect(response.body.agents[2].id).toBe(agentIds[1])
    })
  })
})
```

### WebSocket Integration Tests

```typescript
// server/tests/integration/websocket/agent-streaming.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import { buildApp } from '@/app'

describe('WebSocket Agent Streaming', () => {
  let app: FastifyInstance
  let wsUrl: string

  beforeAll(async () => {
    app = await buildApp()
    await app.listen({ port: 0 }) // Random available port
    const address = app.server.address()
    const port = typeof address === 'object' ? address?.port : 3001
    wsUrl = `ws://localhost:${port}/ws`
  })

  afterAll(async () => {
    await app.close()
  })

  it('should connect and receive pong on ping', async () => {
    const ws = new WebSocket(wsUrl)

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'ping' }))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())
        if (message.type === 'pong') {
          expect(message.timestamp).toBeDefined()
          ws.close()
          resolve()
        }
      })

      ws.on('error', reject)

      setTimeout(() => reject(new Error('Timeout')), 5000)
    })
  })

  it('should subscribe to agent updates', async () => {
    const ws = new WebSocket(wsUrl)

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'subscribe:agent',
          payload: { agentId: 'ag_test123' },
        }))

        // Just verify no error on subscription
        setTimeout(() => {
          ws.close()
          resolve()
        }, 100)
      })

      ws.on('error', reject)
    })
  })
})
```

---

## End-to-End Testing

### Playwright Configuration

```typescript
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../',
      url: 'http://localhost:8080',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      cwd: '../server',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
```

### E2E Test Example

```typescript
// e2e/tests/agent-lifecycle.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Agent Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for app to load
    await expect(page.locator('[data-testid="toolbar"]')).toBeVisible()
  })

  test('should create a new agent', async ({ page }) => {
    // Click add agent button on first worktree
    await page.click('[data-testid="add-agent-button"]')

    // Wait for agent to appear
    const agentBox = page.locator('[data-testid="agent-box"]').last()
    await expect(agentBox).toBeVisible()

    // Verify initial state
    await expect(agentBox.locator('[data-testid="agent-status"]')).toHaveAttribute(
      'data-status',
      'waiting'
    )
  })

  test('should update agent mode', async ({ page }) => {
    // Create agent first
    await page.click('[data-testid="add-agent-button"]')
    const agentBox = page.locator('[data-testid="agent-box"]').last()

    // Open mode dropdown
    await agentBox.click('[data-testid="mode-selector"]')

    // Select auto mode
    await page.click('[data-testid="mode-option-auto"]')

    // Verify mode changed
    await expect(agentBox.locator('[data-testid="mode-indicator"]')).toHaveAttribute(
      'data-mode',
      'auto'
    )
  })

  test('should delete agent', async ({ page }) => {
    // Create agent first
    await page.click('[data-testid="add-agent-button"]')
    const agentCount = await page.locator('[data-testid="agent-box"]').count()

    // Click delete on last agent
    const lastAgent = page.locator('[data-testid="agent-box"]').last()
    await lastAgent.click('[data-testid="delete-agent-button"]')

    // Confirm deletion if dialog appears
    const confirmButton = page.locator('[data-testid="confirm-delete"]')
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }

    // Verify agent removed
    await expect(page.locator('[data-testid="agent-box"]')).toHaveCount(agentCount - 1)
  })

  test('should drag and drop agents', async ({ page }) => {
    // Create multiple agents
    await page.click('[data-testid="add-agent-button"]')
    await page.click('[data-testid="add-agent-button"]')

    const agents = page.locator('[data-testid="agent-box"]')
    await expect(agents).toHaveCount(2)

    // Get initial order
    const firstAgentId = await agents.first().getAttribute('data-agent-id')
    const secondAgentId = await agents.last().getAttribute('data-agent-id')

    // Perform drag and drop
    const firstAgent = agents.first()
    const secondAgent = agents.last()

    await firstAgent.dragTo(secondAgent)

    // Verify order changed
    const reorderedAgents = page.locator('[data-testid="agent-box"]')
    await expect(reorderedAgents.first()).toHaveAttribute('data-agent-id', secondAgentId)
    await expect(reorderedAgents.last()).toHaveAttribute('data-agent-id', firstAgentId)
  })
})
```

---

## Test Fixtures

```typescript
// server/tests/fixtures/agents.ts
import { AgentRow } from '@shared/types'

export const createMockAgent = (overrides: Partial<AgentRow> = {}): AgentRow => ({
  id: `ag_${Math.random().toString(36).substring(2, 9)}`,
  worktree_id: 'wt_test',
  name: 'Test Agent',
  status: 'waiting',
  context_level: 0,
  mode: 'regular',
  permissions: '["read"]',
  display_order: 0,
  pid: null,
  session_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  started_at: null,
  stopped_at: null,
  deleted_at: null,
  parent_agent_id: null,
  ...overrides,
})

export const mockAgents: AgentRow[] = [
  createMockAgent({ id: 'ag_001', name: 'Agent 1', status: 'running', context_level: 45 }),
  createMockAgent({ id: 'ag_002', name: 'Agent 2', status: 'waiting', display_order: 1 }),
  createMockAgent({ id: 'ag_003', name: 'Agent 3', status: 'error', display_order: 2 }),
]

// server/tests/fixtures/workspaces.ts
import { WorkspaceRow, WorktreeRow } from '@shared/types'

export const mockWorkspace: WorkspaceRow = {
  id: 'ws_test',
  name: 'test-project',
  path: '/home/user/projects/test-project',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  worktree_count: 2,
  agent_count: 3,
}

export const mockWorktrees: WorktreeRow[] = [
  {
    id: 'wt_main',
    workspace_id: 'ws_test',
    name: 'main',
    branch: 'main',
    path: '/home/user/projects/test-project',
    sort_mode: 'free',
    display_order: 0,
    is_main: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'wt_feature',
    workspace_id: 'ws_test',
    name: 'feature-auth',
    branch: 'feature/authentication',
    path: '/home/user/projects/test-project-feature-auth',
    sort_mode: 'status',
    display_order: 1,
    is_main: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]
```

---

## Running Tests

### Commands

```bash
# Run all unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test -- tests/unit/services/agent.service.test.ts

# Run integration tests only
npm run test -- tests/integration/

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui
```

### CI Test Matrix

| Test Type | Environment | Timeout | Retries |
|-----------|-------------|---------|---------|
| Unit | Node | 10s | 0 |
| Integration | Node + SQLite | 30s | 1 |
| E2E | Chromium | 60s | 2 |

---

## Mocking Strategies

### Mocking Child Processes

```typescript
// server/tests/mocks/process.mock.ts
import { vi } from 'vitest'
import { EventEmitter } from 'events'

export function createMockChildProcess() {
  const stdin = {
    write: vi.fn(),
    writable: true,
  }

  const stdout = new EventEmitter()
  const stderr = new EventEmitter()

  const proc = {
    pid: Math.floor(Math.random() * 10000),
    stdin,
    stdout,
    stderr,
    kill: vi.fn(),
    on: vi.fn((event, handler) => {
      if (event === 'exit') {
        // Store exit handler for manual triggering
        (proc as any).exitHandler = handler
      }
    }),
    // Helper to simulate output
    simulateOutput: (text: string) => {
      stdout.emit('data', Buffer.from(text))
    },
    simulateError: (text: string) => {
      stderr.emit('data', Buffer.from(text))
    },
    simulateExit: (code: number) => {
      if ((proc as any).exitHandler) {
        (proc as any).exitHandler(code)
      }
    },
  }

  return proc
}
```

### Mocking Git Operations

```typescript
// server/tests/mocks/git.mock.ts
import { vi } from 'vitest'

export function createMockGitService() {
  return {
    isValidRepository: vi.fn().mockResolvedValue(true),
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
    listWorktrees: vi.fn().mockResolvedValue([
      { path: '/tmp/test', branch: 'main', isMain: true },
    ]),
    addWorktree: vi.fn().mockResolvedValue(undefined),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
    listBranches: vi.fn().mockResolvedValue({
      local: ['main', 'develop'],
      remote: ['main', 'develop', 'feature/test'],
    }),
  }
}
```

This testing strategy provides comprehensive coverage across all layers of the application, from unit tests for individual functions to end-to-end tests that validate the complete user workflow.
