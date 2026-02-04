import { describe, it, expect, beforeEach } from 'vitest'
import { getDatabase } from '../../../src/db/index.js'
import { WorkspaceRepository } from '../../../src/db/repositories/workspace.repository.js'

describe('WorkspaceRepository', () => {
  let repo: WorkspaceRepository

  beforeEach(() => {
    repo = new WorkspaceRepository(getDatabase())
  })

  describe('create', () => {
    it('should create a workspace', () => {
      const workspace = repo.create({ name: 'test-project', path: '/home/user/test-project' })

      expect(workspace.id).toMatch(/^ws_/)
      expect(workspace.name).toBe('test-project')
      expect(workspace.path).toBe('/home/user/test-project')
      expect(workspace.worktree_count).toBe(0)
      expect(workspace.agent_count).toBe(0)
      expect(workspace.created_at).toBeTruthy()
      expect(workspace.updated_at).toBeTruthy()
    })
  })

  describe('findById', () => {
    it('should find workspace by id', () => {
      const created = repo.create({ name: 'test', path: '/test' })
      const found = repo.findById(created.id)

      expect(found).toBeTruthy()
      expect(found!.id).toBe(created.id)
      expect(found!.name).toBe('test')
    })

    it('should return falsy for non-existent id', () => {
      const found = repo.findById('ws_nonexistent')
      expect(found).toBeFalsy()
    })
  })

  describe('findByPath', () => {
    it('should find workspace by path', () => {
      repo.create({ name: 'test', path: '/unique/path' })
      const found = repo.findByPath('/unique/path')

      expect(found).toBeTruthy()
      expect(found!.path).toBe('/unique/path')
    })

    it('should return falsy for non-existent path', () => {
      const found = repo.findByPath('/nonexistent')
      expect(found).toBeFalsy()
    })
  })

  describe('findAll', () => {
    it('should return all workspaces', () => {
      repo.create({ name: 'first', path: '/first' })
      repo.create({ name: 'second', path: '/second' })
      repo.create({ name: 'third', path: '/third' })

      const all = repo.findAll()

      expect(all).toHaveLength(3)
      // All workspaces should be returned (order depends on updated_at which may be same for fast inserts)
      const names = all.map((w) => w.name)
      expect(names).toContain('first')
      expect(names).toContain('second')
      expect(names).toContain('third')
    })

    it('should return empty array when no workspaces', () => {
      const all = repo.findAll()
      expect(all).toHaveLength(0)
    })
  })

  describe('update', () => {
    it('should update workspace name', () => {
      const workspace = repo.create({ name: 'old-name', path: '/test' })
      const updated = repo.update(workspace.id, { name: 'new-name' })

      expect(updated).toBeTruthy()
      expect(updated!.name).toBe('new-name')
    })

    it('should update worktree count', () => {
      const workspace = repo.create({ name: 'test', path: '/test' })
      repo.update(workspace.id, { worktreeCount: 5 })

      const found = repo.findById(workspace.id)
      expect(found!.worktree_count).toBe(5)
    })

    it('should return workspace unchanged if no updates provided', () => {
      const workspace = repo.create({ name: 'test', path: '/test' })
      const result = repo.update(workspace.id, {})

      expect(result).toBeTruthy()
      expect(result!.name).toBe('test')
    })
  })

  describe('delete', () => {
    it('should delete workspace', () => {
      const workspace = repo.create({ name: 'test', path: '/test' })
      const result = repo.delete(workspace.id)

      expect(result).toBe(true)
      expect(repo.findById(workspace.id)).toBeFalsy()
    })

    it('should return false for non-existent workspace', () => {
      const result = repo.delete('ws_nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('count operations', () => {
    it('should increment worktree count', () => {
      const workspace = repo.create({ name: 'test', path: '/test' })
      repo.incrementWorktreeCount(workspace.id)
      repo.incrementWorktreeCount(workspace.id)

      const found = repo.findById(workspace.id)
      expect(found!.worktree_count).toBe(2)
    })

    it('should decrement worktree count', () => {
      const workspace = repo.create({ name: 'test', path: '/test' })
      repo.update(workspace.id, { worktreeCount: 5 })
      repo.decrementWorktreeCount(workspace.id)

      const found = repo.findById(workspace.id)
      expect(found!.worktree_count).toBe(4)
    })

    it('should not go below zero when decrementing', () => {
      const workspace = repo.create({ name: 'test', path: '/test' })
      repo.decrementWorktreeCount(workspace.id)

      const found = repo.findById(workspace.id)
      expect(found!.worktree_count).toBe(0)
    })

    it('should increment agent count', () => {
      const workspace = repo.create({ name: 'test', path: '/test' })
      repo.incrementAgentCount(workspace.id)

      const found = repo.findById(workspace.id)
      expect(found!.agent_count).toBe(1)
    })

    it('should decrement agent count', () => {
      const workspace = repo.create({ name: 'test', path: '/test' })
      repo.update(workspace.id, { agentCount: 3 })
      repo.decrementAgentCount(workspace.id)

      const found = repo.findById(workspace.id)
      expect(found!.agent_count).toBe(2)
    })
  })
})
