import type { Agent, Message, agentRowToApi, messageRowToApi } from '@claude-manager/shared'
import { AgentRepository } from '../db/repositories/agent.repository.js'
import { MessageRepository } from '../db/repositories/message.repository.js'
import { WorktreeRepository } from '../db/repositories/worktree.repository.js'
import { WorkspaceRepository } from '../db/repositories/workspace.repository.js'
import { NotFoundError, ConflictError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export interface CreateAgentOptions {
  worktreeId: string
  name?: string
  mode?: 'auto' | 'plan' | 'regular'
  permissions?: string[]
}

export interface UpdateAgentOptions {
  name?: string
  mode?: 'auto' | 'plan' | 'regular'
  permissions?: string[]
}

export class AgentService {
  constructor(
    private readonly agentRepo: AgentRepository,
    private readonly messageRepo: MessageRepository,
    private readonly worktreeRepo: WorktreeRepository,
    private readonly workspaceRepo: WorkspaceRepository
  ) {}

  async createAgent(options: CreateAgentOptions): Promise<Agent> {
    // Validate worktree exists
    const worktree = this.worktreeRepo.findById(options.worktreeId)
    if (!worktree) {
      throw new NotFoundError('Worktree', options.worktreeId)
    }

    // Generate name if not provided
    const name = options.name || `Agent ${Date.now().toString(36).toUpperCase()}`

    // Create agent
    const agent = this.agentRepo.create({
      worktreeId: options.worktreeId,
      name,
      mode: options.mode || 'regular',
      permissions: options.permissions || ['read'],
    })

    // Update workspace agent count
    this.workspaceRepo.incrementAgentCount(worktree.workspace_id)

    logger.info({ agentId: agent.id, worktreeId: options.worktreeId }, 'Agent created')

    const { agentRowToApi } = await import('@claude-manager/shared')
    return agentRowToApi(agent)
  }

  async getAgentById(id: string): Promise<Agent | null> {
    const row = this.agentRepo.findById(id)
    if (!row) return null

    const { agentRowToApi } = await import('@claude-manager/shared')
    return agentRowToApi(row)
  }

  async listAgents(options: {
    worktreeId?: string
    status?: 'running' | 'waiting' | 'error' | 'finished'
    includeDeleted?: boolean
  }): Promise<Agent[]> {
    const rows = this.agentRepo.findAll({
      worktreeId: options.worktreeId,
      status: options.status,
      includeDeleted: options.includeDeleted,
    })

    const { agentRowToApi } = await import('@claude-manager/shared')
    return rows.map(agentRowToApi)
  }

  async updateAgent(id: string, options: UpdateAgentOptions): Promise<Agent> {
    const existing = this.agentRepo.findById(id)
    if (!existing) {
      throw new NotFoundError('Agent', id)
    }

    const updated = this.agentRepo.update(id, {
      name: options.name,
      mode: options.mode,
      permissions: options.permissions,
    })

    logger.info({ agentId: id }, 'Agent updated')

    const { agentRowToApi } = await import('@claude-manager/shared')
    return agentRowToApi(updated!)
  }

  async deleteAgent(id: string, archive = true): Promise<void> {
    const agent = this.agentRepo.findById(id)
    if (!agent) {
      throw new NotFoundError('Agent', id)
    }

    const worktree = this.worktreeRepo.findById(agent.worktree_id)

    if (archive) {
      this.agentRepo.softDelete(id)
    } else {
      this.agentRepo.hardDelete(id)
    }

    // Update workspace agent count if not already deleted
    if (!agent.deleted_at && worktree) {
      this.workspaceRepo.decrementAgentCount(worktree.workspace_id)
    }

    logger.info({ agentId: id, archive }, 'Agent deleted')
  }

  async forkAgent(id: string, name?: string): Promise<Agent> {
    const parent = this.agentRepo.findById(id)
    if (!parent) {
      throw new NotFoundError('Agent', id)
    }

    const worktree = this.worktreeRepo.findById(parent.worktree_id)
    if (!worktree) {
      throw new NotFoundError('Worktree', parent.worktree_id)
    }

    // Create forked agent
    const forked = this.agentRepo.create({
      worktreeId: parent.worktree_id,
      name: name || `${parent.name} (Fork)`,
      mode: parent.mode,
      permissions: JSON.parse(parent.permissions),
      parentAgentId: id,
    })

    // Update workspace agent count
    this.workspaceRepo.incrementAgentCount(worktree.workspace_id)

    logger.info({ forkedId: forked.id, parentId: id }, 'Agent forked')

    const { agentRowToApi } = await import('@claude-manager/shared')
    return agentRowToApi(forked)
  }

  async reorderAgents(worktreeId: string, agentIds: string[]): Promise<void> {
    const worktree = this.worktreeRepo.findById(worktreeId)
    if (!worktree) {
      throw new NotFoundError('Worktree', worktreeId)
    }

    // Validate all agent IDs belong to this worktree
    const existingAgents = this.agentRepo.findByWorktreeId(worktreeId)
    const existingIds = new Set(existingAgents.map((a) => a.id))

    for (const id of agentIds) {
      if (!existingIds.has(id)) {
        throw new ConflictError(`Agent '${id}' does not belong to worktree`)
      }
    }

    this.agentRepo.reorder(worktreeId, agentIds)
  }

  async restoreAgent(id: string): Promise<Agent> {
    const agent = this.agentRepo.findById(id)
    if (!agent) {
      throw new NotFoundError('Agent', id)
    }

    if (!agent.deleted_at) {
      throw new ConflictError('Agent is not deleted')
    }

    const restored = this.agentRepo.restore(id)

    // Update workspace count
    const worktree = this.worktreeRepo.findById(agent.worktree_id)
    if (worktree) {
      this.workspaceRepo.incrementAgentCount(worktree.workspace_id)
    }

    logger.info({ agentId: id }, 'Agent restored')

    const { agentRowToApi } = await import('@claude-manager/shared')
    return agentRowToApi(restored!)
  }

  async getMessages(
    agentId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const agent = this.agentRepo.findById(agentId)
    if (!agent) {
      throw new NotFoundError('Agent', agentId)
    }

    const limit = options.limit || 100
    const messages = this.messageRepo.findByAgentId(agentId, {
      limit: limit + 1,
      beforeId: options.before,
    })

    const { messageRowToApi } = await import('@claude-manager/shared')
    const hasMore = messages.length > limit

    return {
      messages: messages.slice(0, limit).map(messageRowToApi),
      hasMore,
    }
  }

  async addMessage(
    agentId: string,
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: string
  ): Promise<Message> {
    const agent = this.agentRepo.findById(agentId)
    if (!agent) {
      throw new NotFoundError('Agent', agentId)
    }

    const message = this.messageRepo.create({
      agentId,
      role,
      content,
    })

    const { messageRowToApi } = await import('@claude-manager/shared')
    return messageRowToApi(message)
  }

  async getActiveAgents(): Promise<Agent[]> {
    const rows = this.agentRepo.findActive()
    const { agentRowToApi } = await import('@claude-manager/shared')
    return rows.map(agentRowToApi)
  }

  async clearOrphanedProcesses(): Promise<number> {
    const count = this.agentRepo.clearPidForRunningAgents()
    if (count > 0) {
      logger.info({ count }, 'Cleared orphaned agent processes')
    }
    return count
  }
}
