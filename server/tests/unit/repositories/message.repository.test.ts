import { describe, it, expect, beforeEach } from 'vitest'
import { getDatabase } from '../../../src/db/index.js'
import { WorkspaceRepository } from '../../../src/db/repositories/workspace.repository.js'
import { WorktreeRepository } from '../../../src/db/repositories/worktree.repository.js'
import { AgentRepository } from '../../../src/db/repositories/agent.repository.js'
import { MessageRepository } from '../../../src/db/repositories/message.repository.js'

describe('MessageRepository', () => {
  let messageRepo: MessageRepository
  let agentId: string

  beforeEach(() => {
    const db = getDatabase()
    const workspaceRepo = new WorkspaceRepository(db)
    const worktreeRepo = new WorktreeRepository(db)
    const agentRepo = new AgentRepository(db)
    messageRepo = new MessageRepository(db)

    // Create workspace, worktree, and agent for messages
    const workspace = workspaceRepo.create({ name: 'test', path: '/test' })
    const worktree = worktreeRepo.create({
      workspaceId: workspace.id,
      name: 'main',
      branch: 'main',
      path: '/test',
      isMain: true,
    })
    const agent = agentRepo.create({
      worktreeId: worktree.id,
      name: 'Test Agent',
    })
    agentId = agent.id
  })

  describe('create', () => {
    it('should create a message', () => {
      const message = messageRepo.create({
        agentId,
        role: 'user',
        content: 'Hello, agent!',
      })

      expect(message.id).toMatch(/^msg_/)
      expect(message.agent_id).toBe(agentId)
      expect(message.role).toBe('user')
      expect(message.content).toBe('Hello, agent!')
      expect(message.is_complete).toBe(1)
    })

    it('should create message with tool information', () => {
      const message = messageRepo.create({
        agentId,
        role: 'tool',
        content: 'Tool output',
        toolName: 'read_file',
        toolInput: { path: '/test.txt' },
        toolOutput: { content: 'file contents' },
      })

      expect(message.tool_name).toBe('read_file')
      expect(JSON.parse(message.tool_input!)).toEqual({ path: '/test.txt' })
      expect(JSON.parse(message.tool_output!)).toEqual({ content: 'file contents' })
    })

    it('should create incomplete message', () => {
      const message = messageRepo.create({
        agentId,
        role: 'assistant',
        content: 'Starting...',
        isComplete: false,
      })

      expect(message.is_complete).toBe(0)
    })
  })

  describe('findByAgentId', () => {
    it('should return messages in chronological order', () => {
      messageRepo.create({ agentId, role: 'user', content: 'First' })
      messageRepo.create({ agentId, role: 'assistant', content: 'Second' })
      messageRepo.create({ agentId, role: 'user', content: 'Third' })

      const messages = messageRepo.findByAgentId(agentId)

      expect(messages).toHaveLength(3)
      expect(messages[0].content).toBe('First')
      expect(messages[1].content).toBe('Second')
      expect(messages[2].content).toBe('Third')
    })

    it('should respect limit option', () => {
      for (let i = 0; i < 10; i++) {
        messageRepo.create({ agentId, role: 'user', content: `Message ${i}` })
      }

      const messages = messageRepo.findByAgentId(agentId, { limit: 5 })
      expect(messages).toHaveLength(5)
    })

    it('should filter by role', () => {
      messageRepo.create({ agentId, role: 'user', content: 'User message' })
      messageRepo.create({ agentId, role: 'assistant', content: 'Assistant message' })
      messageRepo.create({ agentId, role: 'user', content: 'Another user message' })

      const messages = messageRepo.findByAgentId(agentId, { role: 'user' })
      expect(messages).toHaveLength(2)
    })
  })

  describe('update', () => {
    it('should update message content', () => {
      const message = messageRepo.create({
        agentId,
        role: 'assistant',
        content: 'Initial',
      })

      const updated = messageRepo.update(message.id, { content: 'Updated content' })
      expect(updated!.content).toBe('Updated content')
    })

    it('should update isComplete', () => {
      const message = messageRepo.create({
        agentId,
        role: 'assistant',
        content: 'Streaming...',
        isComplete: false,
      })

      messageRepo.update(message.id, { isComplete: true })
      const found = messageRepo.findById(message.id)
      expect(found!.is_complete).toBe(1)
    })
  })

  describe('delete', () => {
    it('should delete a message', () => {
      const message = messageRepo.create({
        agentId,
        role: 'user',
        content: 'To be deleted',
      })

      const result = messageRepo.delete(message.id)
      expect(result).toBe(true)
      expect(messageRepo.findById(message.id)).toBeFalsy()
    })
  })

  describe('deleteByAgentId', () => {
    it('should delete all messages for an agent', () => {
      messageRepo.create({ agentId, role: 'user', content: 'Message 1' })
      messageRepo.create({ agentId, role: 'assistant', content: 'Message 2' })
      messageRepo.create({ agentId, role: 'user', content: 'Message 3' })

      const count = messageRepo.deleteByAgentId(agentId)
      expect(count).toBe(3)
      expect(messageRepo.findByAgentId(agentId)).toHaveLength(0)
    })
  })

  describe('countByAgentId', () => {
    it('should count messages', () => {
      messageRepo.create({ agentId, role: 'user', content: 'One' })
      messageRepo.create({ agentId, role: 'assistant', content: 'Two' })

      const count = messageRepo.countByAgentId(agentId)
      expect(count).toBe(2)
    })
  })

  describe('getLastMessage', () => {
    it('should get the most recent message', () => {
      messageRepo.create({ agentId, role: 'user', content: 'First' })
      messageRepo.create({ agentId, role: 'assistant', content: 'Second' })
      messageRepo.create({ agentId, role: 'user', content: 'Third' })

      const last = messageRepo.getLastMessage(agentId)
      expect(last!.content).toBe('Third')
    })

    it('should return falsy if no messages', () => {
      const last = messageRepo.getLastMessage(agentId)
      expect(last).toBeFalsy()
    })
  })

  describe('appendContent', () => {
    it('should append to existing content', () => {
      const message = messageRepo.create({
        agentId,
        role: 'assistant',
        content: 'Hello',
      })

      messageRepo.appendContent(message.id, ' World!')
      const found = messageRepo.findById(message.id)
      expect(found!.content).toBe('Hello World!')
    })
  })

  describe('getTotalTokenCount', () => {
    it('should sum token counts', () => {
      messageRepo.create({ agentId, role: 'user', content: 'Test', tokenCount: 100 })
      messageRepo.create({ agentId, role: 'assistant', content: 'Response', tokenCount: 500 })
      messageRepo.create({ agentId, role: 'user', content: 'Another', tokenCount: 50 })

      const total = messageRepo.getTotalTokenCount(agentId)
      expect(total).toBe(650)
    })

    it('should handle null token counts', () => {
      messageRepo.create({ agentId, role: 'user', content: 'No tokens' })
      messageRepo.create({ agentId, role: 'assistant', content: 'Has tokens', tokenCount: 100 })

      const total = messageRepo.getTotalTokenCount(agentId)
      expect(total).toBe(100)
    })
  })
})
