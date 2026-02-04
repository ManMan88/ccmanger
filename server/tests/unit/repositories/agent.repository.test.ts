import { describe, it, expect, beforeEach } from 'vitest'
import { getDatabase } from '../../../src/db/index.js'
import { WorkspaceRepository } from '../../../src/db/repositories/workspace.repository.js'
import { WorktreeRepository } from '../../../src/db/repositories/worktree.repository.js'
import { AgentRepository } from '../../../src/db/repositories/agent.repository.js'

describe('AgentRepository', () => {
  let workspaceRepo: WorkspaceRepository
  let worktreeRepo: WorktreeRepository
  let agentRepo: AgentRepository
  let worktreeId: string

  beforeEach(() => {
    const db = getDatabase()
    workspaceRepo = new WorkspaceRepository(db)
    worktreeRepo = new WorktreeRepository(db)
    agentRepo = new AgentRepository(db)

    // Create workspace and worktree for agents
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

  describe('create', () => {
    it('should create an agent with default values', () => {
      const agent = agentRepo.create({
        worktreeId,
        name: 'Test Agent',
      })

      expect(agent.id).toMatch(/^ag_/)
      expect(agent.name).toBe('Test Agent')
      expect(agent.status).toBe('waiting')
      expect(agent.mode).toBe('regular')
      expect(JSON.parse(agent.permissions)).toEqual(['read'])
      expect(agent.display_order).toBe(0)
      expect(agent.deleted_at).toBeNull()
    })

    it('should create agent with custom mode and permissions', () => {
      const agent = agentRepo.create({
        worktreeId,
        name: 'Auto Agent',
        mode: 'auto',
        permissions: ['read', 'write', 'execute'],
      })

      expect(agent.mode).toBe('auto')
      expect(JSON.parse(agent.permissions)).toEqual(['read', 'write', 'execute'])
    })

    it('should auto-increment display_order', () => {
      const agent1 = agentRepo.create({ worktreeId, name: 'Agent 1' })
      const agent2 = agentRepo.create({ worktreeId, name: 'Agent 2' })
      const agent3 = agentRepo.create({ worktreeId, name: 'Agent 3' })

      expect(agent1.display_order).toBe(0)
      expect(agent2.display_order).toBe(1)
      expect(agent3.display_order).toBe(2)
    })
  })

  describe('findById', () => {
    it('should find agent by id', () => {
      const created = agentRepo.create({ worktreeId, name: 'Test' })
      const found = agentRepo.findById(created.id)

      expect(found).toBeTruthy()
      expect(found!.id).toBe(created.id)
    })

    it('should return falsy for non-existent id', () => {
      const found = agentRepo.findById('ag_nonexistent')
      expect(found).toBeFalsy()
    })
  })

  describe('findByWorktreeId', () => {
    it('should return agents for worktree', () => {
      agentRepo.create({ worktreeId, name: 'Agent 1' })
      agentRepo.create({ worktreeId, name: 'Agent 2' })

      const agents = agentRepo.findByWorktreeId(worktreeId)

      expect(agents).toHaveLength(2)
      expect(agents[0].name).toBe('Agent 1')
    })

    it('should exclude deleted agents by default', () => {
      const agent1 = agentRepo.create({ worktreeId, name: 'Active' })
      const agent2 = agentRepo.create({ worktreeId, name: 'Deleted' })
      agentRepo.softDelete(agent2.id)

      const agents = agentRepo.findByWorktreeId(worktreeId)
      expect(agents).toHaveLength(1)
      expect(agents[0].id).toBe(agent1.id)
    })

    it('should include deleted agents when requested', () => {
      agentRepo.create({ worktreeId, name: 'Active' })
      const deleted = agentRepo.create({ worktreeId, name: 'Deleted' })
      agentRepo.softDelete(deleted.id)

      const agents = agentRepo.findByWorktreeId(worktreeId, true)
      expect(agents).toHaveLength(2)
    })
  })

  describe('findActive', () => {
    it('should return running and waiting agents', () => {
      const running = agentRepo.create({ worktreeId, name: 'Running' })
      agentRepo.update(running.id, { status: 'running' })

      const waiting = agentRepo.create({ worktreeId, name: 'Waiting' })
      agentRepo.update(waiting.id, { status: 'waiting' })

      const finished = agentRepo.create({ worktreeId, name: 'Finished' })
      agentRepo.update(finished.id, { status: 'finished' })

      const active = agentRepo.findActive()
      expect(active).toHaveLength(2)
    })
  })

  describe('update', () => {
    it('should update agent fields', () => {
      const agent = agentRepo.create({ worktreeId, name: 'Old Name' })
      const updated = agentRepo.update(agent.id, {
        name: 'New Name',
        status: 'running',
        contextLevel: 50,
      })

      expect(updated!.name).toBe('New Name')
      expect(updated!.status).toBe('running')
      expect(updated!.context_level).toBe(50)
    })

    it('should update pid and session_id', () => {
      const agent = agentRepo.create({ worktreeId, name: 'Test' })
      agentRepo.update(agent.id, { pid: 12345, sessionId: 'ses_abc123' })

      const found = agentRepo.findById(agent.id)
      expect(found!.pid).toBe(12345)
      expect(found!.session_id).toBe('ses_abc123')
    })
  })

  describe('softDelete', () => {
    it('should soft delete agent', () => {
      const agent = agentRepo.create({ worktreeId, name: 'Test' })
      const result = agentRepo.softDelete(agent.id)

      expect(result).toBe(true)

      const found = agentRepo.findById(agent.id)
      expect(found!.deleted_at).toBeTruthy()
      expect(found!.status).toBe('finished')
      expect(found!.pid).toBeNull()
    })
  })

  describe('hardDelete', () => {
    it('should permanently delete agent', () => {
      const agent = agentRepo.create({ worktreeId, name: 'Test' })
      const result = agentRepo.hardDelete(agent.id)

      expect(result).toBe(true)
      expect(agentRepo.findById(agent.id)).toBeFalsy()
    })
  })

  describe('restore', () => {
    it('should restore soft-deleted agent', () => {
      const agent = agentRepo.create({ worktreeId, name: 'Test' })
      agentRepo.softDelete(agent.id)
      const restored = agentRepo.restore(agent.id)

      expect(restored!.deleted_at).toBeNull()
      expect(restored!.status).toBe('waiting')
    })
  })

  describe('reorder', () => {
    it('should reorder agents', () => {
      const agent1 = agentRepo.create({ worktreeId, name: 'Agent 1' })
      const agent2 = agentRepo.create({ worktreeId, name: 'Agent 2' })
      const agent3 = agentRepo.create({ worktreeId, name: 'Agent 3' })

      // Reverse order
      agentRepo.reorder(worktreeId, [agent3.id, agent2.id, agent1.id])

      const agents = agentRepo.findByWorktreeId(worktreeId)
      expect(agents[0].id).toBe(agent3.id)
      expect(agents[0].display_order).toBe(0)
      expect(agents[1].id).toBe(agent2.id)
      expect(agents[1].display_order).toBe(1)
      expect(agents[2].id).toBe(agent1.id)
      expect(agents[2].display_order).toBe(2)
    })
  })

  describe('countByWorktreeId', () => {
    it('should count agents in worktree', () => {
      agentRepo.create({ worktreeId, name: 'Agent 1' })
      agentRepo.create({ worktreeId, name: 'Agent 2' })

      const count = agentRepo.countByWorktreeId(worktreeId)
      expect(count).toBe(2)
    })

    it('should exclude deleted agents by default', () => {
      agentRepo.create({ worktreeId, name: 'Active' })
      const deleted = agentRepo.create({ worktreeId, name: 'Deleted' })
      agentRepo.softDelete(deleted.id)

      const count = agentRepo.countByWorktreeId(worktreeId)
      expect(count).toBe(1)
    })
  })
})
