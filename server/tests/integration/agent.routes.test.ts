import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { initDatabase, closeDatabase, getDatabase } from '../../src/db/index.js'
import { runMigrations } from '../../src/db/migrate.js'
import { WorkspaceRepository } from '../../src/db/repositories/workspace.repository.js'
import { WorktreeRepository } from '../../src/db/repositories/worktree.repository.js'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import type { FastifyInstance } from 'fastify'

describe('Agent Routes Integration', () => {
  let app: FastifyInstance
  let testDir: string
  let worktreeId: string

  beforeAll(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'claude-manager-agent-test-'))
    const testDbPath = join(testDir, 'test.db')

    initDatabase(testDbPath)
    runMigrations()

    app = await buildApp()
  })

  beforeEach(() => {
    const db = getDatabase()
    db.exec(`
      DELETE FROM agent_sessions;
      DELETE FROM messages;
      DELETE FROM agents;
      DELETE FROM worktrees;
      DELETE FROM workspaces;
    `)

    // Create workspace and worktree for tests
    const workspaceRepo = new WorkspaceRepository(db)
    const worktreeRepo = new WorktreeRepository(db)

    const workspace = workspaceRepo.create({ name: 'test', path: '/test' })
    const worktree = worktreeRepo.create({
      workspaceId: workspace.id,
      name: 'main',
      branch: 'main',
      path: '/test',
      isMain: true,
    })
    worktreeId = worktree.id
  })

  afterAll(async () => {
    await app.close()
    closeDatabase()
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('GET /api/agents', () => {
    it('should return empty array when no agents exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/agents',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.agents).toHaveLength(0)
    })

    it('should filter by worktreeId', async () => {
      // Create agent
      await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'Test Agent' },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/agents?worktreeId=${worktreeId}`,
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.agents).toHaveLength(1)
    })
  })

  describe('POST /api/agents', () => {
    it('should create agent with default values', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId },
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.id).toMatch(/^ag_/)
      expect(body.status).toBe('waiting')
      expect(body.mode).toBe('regular')
      expect(body.permissions).toEqual(['read'])
    })

    it('should create agent with custom values', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: {
          worktreeId,
          name: 'Custom Agent',
          mode: 'auto',
          permissions: ['read', 'write'],
        },
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.name).toBe('Custom Agent')
      expect(body.mode).toBe('auto')
      expect(body.permissions).toEqual(['read', 'write'])
    })

    it('should return 404 for non-existent worktree', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId: 'wt_nonexistent' },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /api/agents/:id', () => {
    it('should return agent details', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'Test Agent' },
      })
      const agent = JSON.parse(createResponse.body)

      const response = await app.inject({
        method: 'GET',
        url: `/api/agents/${agent.id}`,
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.id).toBe(agent.id)
      expect(body.name).toBe('Test Agent')
    })

    it('should return 404 for non-existent agent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/agents/ag_nonexistent',
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('PUT /api/agents/:id', () => {
    it('should update agent', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'Original' },
      })
      const agent = JSON.parse(createResponse.body)

      const response = await app.inject({
        method: 'PUT',
        url: `/api/agents/${agent.id}`,
        payload: { name: 'Updated', mode: 'plan' },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.name).toBe('Updated')
      expect(body.mode).toBe('plan')
    })
  })

  describe('DELETE /api/agents/:id', () => {
    it('should soft delete agent by default', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'To Delete' },
      })
      const agent = JSON.parse(createResponse.body)

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/agents/${agent.id}`,
      })

      expect(response.statusCode).toBe(204)

      // Agent should still exist but be marked as deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/agents/${agent.id}`,
      })
      const body = JSON.parse(getResponse.body)
      expect(body.deletedAt).toBeTruthy()
    })

    it('should hard delete when archive=false', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'To Hard Delete' },
      })
      const agent = JSON.parse(createResponse.body)

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/agents/${agent.id}?archive=false`,
      })

      expect(response.statusCode).toBe(204)

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/agents/${agent.id}`,
      })
      expect(getResponse.statusCode).toBe(404)
    })
  })

  describe('POST /api/agents/:id/fork', () => {
    it('should fork an agent', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'Parent Agent', mode: 'auto' },
      })
      const parent = JSON.parse(createResponse.body)

      const response = await app.inject({
        method: 'POST',
        url: `/api/agents/${parent.id}/fork`,
        payload: { name: 'Forked Agent' },
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.name).toBe('Forked Agent')
      expect(body.mode).toBe('auto') // Inherits mode from parent
      expect(body.parentAgentId).toBe(parent.id)
    })
  })

  describe('PUT /api/agents/reorder', () => {
    it('should reorder agents', async () => {
      const agent1 = JSON.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/agents',
            payload: { worktreeId, name: 'Agent 1' },
          })
        ).body
      )
      const agent2 = JSON.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/agents',
            payload: { worktreeId, name: 'Agent 2' },
          })
        ).body
      )

      const response = await app.inject({
        method: 'PUT',
        url: '/api/agents/reorder',
        payload: {
          worktreeId,
          agentIds: [agent2.id, agent1.id],
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.agents[0].id).toBe(agent2.id)
      expect(body.agents[0].order).toBe(0)
    })
  })

  describe('POST /api/agents/:id/message', () => {
    it('should queue a message', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'Test Agent' },
      })
      const agent = JSON.parse(createResponse.body)

      const response = await app.inject({
        method: 'POST',
        url: `/api/agents/${agent.id}/message`,
        payload: { content: 'Hello agent!' },
      })

      expect(response.statusCode).toBe(202)
      const body = JSON.parse(response.body)
      expect(body.status).toBe('queued')
      expect(body.messageId).toMatch(/^msg_/)
    })
  })

  describe('GET /api/agents/:id/messages', () => {
    it('should return message history', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'Test Agent' },
      })
      const agent = JSON.parse(createResponse.body)

      // Send some messages
      await app.inject({
        method: 'POST',
        url: `/api/agents/${agent.id}/message`,
        payload: { content: 'First message' },
      })
      await app.inject({
        method: 'POST',
        url: `/api/agents/${agent.id}/message`,
        payload: { content: 'Second message' },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/agents/${agent.id}/messages`,
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.messages).toHaveLength(2)
      expect(body.messages[0].content).toBe('First message')
    })
  })

  describe('POST /api/agents/:id/stop', () => {
    it('should stop agent and update status', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'Test Agent' },
      })
      const agent = JSON.parse(createResponse.body)

      const response = await app.inject({
        method: 'POST',
        url: `/api/agents/${agent.id}/stop`,
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.status).toBe('finished')
      expect(body.stoppedAt).toBeTruthy()
    })

    it('should return 404 for non-existent agent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/agents/ag_nonexistent/stop',
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /api/agents/:id/status', () => {
    it('should return agent status info', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'Test Agent' },
      })
      const agent = JSON.parse(createResponse.body)

      const response = await app.inject({
        method: 'GET',
        url: `/api/agents/${agent.id}/status`,
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.id).toBe(agent.id)
      expect(body.status).toBe('waiting')
      expect(body.isRunning).toBe(false)
    })

    it('should return 404 for non-existent agent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/agents/ag_nonexistent/status',
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('POST /api/agents/:id/restore', () => {
    it('should restore a deleted agent', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/agents',
        payload: { worktreeId, name: 'Agent to Restore' },
      })
      const agent = JSON.parse(createResponse.body)

      // Delete the agent
      await app.inject({
        method: 'DELETE',
        url: `/api/agents/${agent.id}`,
      })

      // Verify it's deleted
      const getDeletedResponse = await app.inject({
        method: 'GET',
        url: `/api/agents/${agent.id}`,
      })
      expect(JSON.parse(getDeletedResponse.body).deletedAt).toBeTruthy()

      // Restore the agent
      const restoreResponse = await app.inject({
        method: 'POST',
        url: `/api/agents/${agent.id}/restore`,
      })

      expect(restoreResponse.statusCode).toBe(200)
      const restored = JSON.parse(restoreResponse.body)
      expect(restored.deletedAt).toBeNull()
      expect(restored.status).toBe('waiting')
    })
  })
})
