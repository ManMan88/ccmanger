import { basename, join, dirname } from 'path'
import type { Worktree, Agent } from '@claude-manager/shared'
import { WorktreeRepository } from '../db/repositories/worktree.repository.js'
import { AgentRepository } from '../db/repositories/agent.repository.js'
import { WorkspaceRepository } from '../db/repositories/workspace.repository.js'
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js'
import { GitService } from './git.service.js'
import { logger } from '../utils/logger.js'

export interface WorktreeWithAgents extends Worktree {
  agents: Agent[]
  previousAgents: Agent[]
}

export interface CreateWorktreeOptions {
  workspaceId: string
  name: string
  branch: string
  createBranch: boolean
}

export class WorktreeService {
  constructor(
    private readonly worktreeRepo: WorktreeRepository,
    private readonly agentRepo: AgentRepository,
    private readonly workspaceRepo: WorkspaceRepository
  ) {}

  async createWorktree(options: CreateWorktreeOptions): Promise<Worktree> {
    const workspace = this.workspaceRepo.findById(options.workspaceId)
    if (!workspace) {
      throw new NotFoundError('Workspace', options.workspaceId)
    }

    // Check for name conflict
    if (this.worktreeRepo.existsWithNameInWorkspace(options.workspaceId, options.name)) {
      throw new ConflictError(`Worktree with name '${options.name}' already exists`)
    }

    // Generate worktree path - sibling to main repository
    const worktreePath = join(
      dirname(workspace.path),
      `${basename(workspace.path)}-${options.name}`
    )

    // Check if path already exists in another worktree
    if (this.worktreeRepo.findByPath(worktreePath)) {
      throw new ConflictError(`Worktree already exists at path: ${worktreePath}`)
    }

    // Create git worktree
    const gitService = new GitService(workspace.path)
    await gitService.addWorktree(worktreePath, options.branch, options.createBranch)

    // Create database record
    const worktree = this.worktreeRepo.create({
      workspaceId: options.workspaceId,
      name: options.name,
      branch: options.branch,
      path: worktreePath,
      isMain: false,
    })

    // Update workspace count
    this.workspaceRepo.incrementWorktreeCount(options.workspaceId)

    logger.info(
      { worktreeId: worktree.id, workspaceId: options.workspaceId, path: worktreePath },
      'Worktree created'
    )

    const { worktreeRowToApi } = await import('@claude-manager/shared')
    return worktreeRowToApi(worktree)
  }

  async getWorktreeById(id: string): Promise<Worktree | null> {
    const row = this.worktreeRepo.findById(id)
    if (!row) return null

    const { worktreeRowToApi } = await import('@claude-manager/shared')
    return worktreeRowToApi(row)
  }

  async getWorktreeWithAgents(id: string): Promise<WorktreeWithAgents | null> {
    const worktree = this.worktreeRepo.findById(id)
    if (!worktree) return null

    const { worktreeRowToApi, agentRowToApi } = await import('@claude-manager/shared')

    const activeAgents = this.agentRepo.findByWorktreeId(id, false)
    const deletedAgents = this.agentRepo.findDeletedByWorktreeId(id)

    return {
      ...worktreeRowToApi(worktree),
      agents: activeAgents.map(agentRowToApi),
      previousAgents: deletedAgents.map(agentRowToApi),
    }
  }

  async listWorktreesByWorkspace(workspaceId: string): Promise<Worktree[]> {
    const workspace = this.workspaceRepo.findById(workspaceId)
    if (!workspace) {
      throw new NotFoundError('Workspace', workspaceId)
    }

    const rows = this.worktreeRepo.findByWorkspaceId(workspaceId)
    const { worktreeRowToApi } = await import('@claude-manager/shared')
    return rows.map(worktreeRowToApi)
  }

  async updateWorktree(
    id: string,
    updates: { name?: string; sortMode?: 'free' | 'status' | 'name'; order?: number }
  ): Promise<Worktree> {
    const existing = this.worktreeRepo.findById(id)
    if (!existing) {
      throw new NotFoundError('Worktree', id)
    }

    // Check for name conflict if renaming
    if (
      updates.name &&
      this.worktreeRepo.existsWithNameInWorkspace(existing.workspace_id, updates.name, id)
    ) {
      throw new ConflictError(`Worktree with name '${updates.name}' already exists`)
    }

    const updated = this.worktreeRepo.update(id, {
      name: updates.name,
      sortMode: updates.sortMode,
      displayOrder: updates.order,
    })

    const { worktreeRowToApi } = await import('@claude-manager/shared')
    return worktreeRowToApi(updated!)
  }

  async deleteWorktree(id: string, force = false): Promise<void> {
    const worktree = this.worktreeRepo.findById(id)
    if (!worktree) {
      throw new NotFoundError('Worktree', id)
    }

    // Cannot delete main worktree
    if (worktree.is_main) {
      throw new ValidationError('Cannot delete the main worktree')
    }

    const workspace = this.workspaceRepo.findById(worktree.workspace_id)
    if (!workspace) {
      throw new NotFoundError('Workspace', worktree.workspace_id)
    }

    // Remove git worktree
    const gitService = new GitService(workspace.path)
    await gitService.removeWorktree(worktree.path, force)

    // Delete from database (cascades to agents)
    this.worktreeRepo.delete(id)

    // Update workspace count
    this.workspaceRepo.decrementWorktreeCount(worktree.workspace_id)

    logger.info({ worktreeId: id, workspaceId: worktree.workspace_id }, 'Worktree deleted')
  }

  async checkoutBranch(id: string, branch: string, createBranch = false): Promise<Worktree> {
    const worktree = this.worktreeRepo.findById(id)
    if (!worktree) {
      throw new NotFoundError('Worktree', id)
    }

    // Use git service with the worktree path
    const gitService = new GitService(worktree.path)
    await gitService.checkout(branch, createBranch)

    // Update database
    const updated = this.worktreeRepo.update(id, { branch })

    logger.info({ worktreeId: id, branch, createBranch }, 'Branch checked out')

    const { worktreeRowToApi } = await import('@claude-manager/shared')
    return worktreeRowToApi(updated!)
  }

  async reorderWorktrees(workspaceId: string, worktreeIds: string[]): Promise<void> {
    const workspace = this.workspaceRepo.findById(workspaceId)
    if (!workspace) {
      throw new NotFoundError('Workspace', workspaceId)
    }

    // Validate all IDs belong to this workspace
    const existingWorktrees = this.worktreeRepo.findByWorkspaceId(workspaceId)
    const existingIds = new Set(existingWorktrees.map((w) => w.id))

    for (const id of worktreeIds) {
      if (!existingIds.has(id)) {
        throw new ValidationError(`Worktree '${id}' does not belong to workspace`)
      }
    }

    this.worktreeRepo.reorder(workspaceId, worktreeIds)
  }

  async getGitStatus(
    id: string
  ): Promise<{ isClean: boolean; modified: string[]; staged: string[]; untracked: string[] }> {
    const worktree = this.worktreeRepo.findById(id)
    if (!worktree) {
      throw new NotFoundError('Worktree', id)
    }

    const gitService = new GitService(worktree.path)
    return gitService.getStatus()
  }

  async listBranches(id: string): Promise<{ local: string[]; remote: string[]; current: string }> {
    const worktree = this.worktreeRepo.findById(id)
    if (!worktree) {
      throw new NotFoundError('Worktree', id)
    }

    const gitService = new GitService(worktree.path)
    return gitService.listBranches()
  }
}
