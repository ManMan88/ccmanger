import { basename } from 'path'
import { existsSync } from 'fs'
import type { Workspace, Worktree, Agent } from '@claude-manager/shared'
import { WorkspaceRepository } from '../db/repositories/workspace.repository.js'
import { WorktreeRepository } from '../db/repositories/worktree.repository.js'
import { AgentRepository } from '../db/repositories/agent.repository.js'
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js'
import { GitService } from './git.service.js'
import { logger } from '../utils/logger.js'

export interface WorkspaceWithDetails extends Workspace {
  worktrees: (Worktree & { agents: Agent[]; previousAgents: Agent[] })[]
}

export class WorkspaceService {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly worktreeRepo: WorktreeRepository,
    private readonly agentRepo: AgentRepository
  ) {}

  async createWorkspace(path: string): Promise<Workspace> {
    // Check if path exists
    if (!existsSync(path)) {
      throw new ValidationError('Path does not exist')
    }

    // Check if already exists
    const existing = this.workspaceRepo.findByPath(path)
    if (existing) {
      throw new ConflictError(`Workspace already exists at path: ${path}`)
    }

    // Validate it's a git repository
    const gitService = new GitService(path)
    const isValid = await gitService.isValidRepository()
    if (!isValid) {
      throw new ValidationError('Path is not a valid git repository')
    }

    // Get name from directory
    const name = basename(path)

    // Create workspace
    const workspace = this.workspaceRepo.create({ name, path })

    // Discover and register existing worktrees
    const worktreeInfos = await gitService.listWorktrees()

    for (const info of worktreeInfos) {
      this.worktreeRepo.create({
        workspaceId: workspace.id,
        name: info.isMain ? 'main' : basename(info.path),
        branch: info.branch,
        path: info.path,
        isMain: info.isMain,
      })
    }

    // Update counts
    this.workspaceRepo.recalculateCounts(workspace.id)

    logger.info({ workspaceId: workspace.id, path }, 'Workspace created')

    return this.getWorkspaceById(workspace.id) as Promise<Workspace>
  }

  async getWorkspaceById(id: string): Promise<Workspace | null> {
    const row = this.workspaceRepo.findById(id)
    if (!row) return null

    const { workspaceRowToApi } = await import('@claude-manager/shared')
    return workspaceRowToApi(row)
  }

  async getWorkspaceWithDetails(id: string): Promise<WorkspaceWithDetails | null> {
    const workspace = this.workspaceRepo.findById(id)
    if (!workspace) return null

    const { workspaceRowToApi, worktreeRowToApi, agentRowToApi } =
      await import('@claude-manager/shared')

    const worktreeRows = this.worktreeRepo.findByWorkspaceId(id)
    const worktreesWithAgents = worktreeRows.map((wt) => {
      const activeAgents = this.agentRepo.findByWorktreeId(wt.id, false)
      const deletedAgents = this.agentRepo.findDeletedByWorktreeId(wt.id)

      return {
        ...worktreeRowToApi(wt),
        agents: activeAgents.map(agentRowToApi),
        previousAgents: deletedAgents.map(agentRowToApi),
      }
    })

    return {
      ...workspaceRowToApi(workspace),
      worktrees: worktreesWithAgents,
    }
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const rows = this.workspaceRepo.findAll()
    const { workspaceRowToApi } = await import('@claude-manager/shared')
    return rows.map(workspaceRowToApi)
  }

  async updateWorkspace(id: string, name: string): Promise<Workspace> {
    const existing = this.workspaceRepo.findById(id)
    if (!existing) {
      throw new NotFoundError('Workspace', id)
    }

    const updated = this.workspaceRepo.update(id, { name })
    const { workspaceRowToApi } = await import('@claude-manager/shared')
    return workspaceRowToApi(updated!)
  }

  async deleteWorkspace(id: string): Promise<void> {
    const existing = this.workspaceRepo.findById(id)
    if (!existing) {
      throw new NotFoundError('Workspace', id)
    }

    // This will cascade delete worktrees and agents due to foreign keys
    const deleted = this.workspaceRepo.delete(id)
    if (!deleted) {
      throw new Error('Failed to delete workspace')
    }

    logger.info({ workspaceId: id }, 'Workspace deleted')
  }

  async refreshWorkspace(id: string): Promise<WorkspaceWithDetails> {
    const workspace = this.workspaceRepo.findById(id)
    if (!workspace) {
      throw new NotFoundError('Workspace', id)
    }

    // Re-discover worktrees from git
    const gitService = new GitService(workspace.path)
    const worktreeInfos = await gitService.listWorktrees()

    const existingWorktrees = this.worktreeRepo.findByWorkspaceId(id)
    const existingPaths = new Set(existingWorktrees.map((wt) => wt.path))

    // Add new worktrees
    for (const info of worktreeInfos) {
      if (!existingPaths.has(info.path)) {
        this.worktreeRepo.create({
          workspaceId: id,
          name: info.isMain ? 'main' : basename(info.path),
          branch: info.branch,
          path: info.path,
          isMain: info.isMain,
        })
      }
    }

    // Remove worktrees that no longer exist
    const currentPaths = new Set(worktreeInfos.map((w) => w.path))
    for (const wt of existingWorktrees) {
      if (!currentPaths.has(wt.path)) {
        this.worktreeRepo.delete(wt.id)
      }
    }

    // Recalculate counts
    this.workspaceRepo.recalculateCounts(id)

    return this.getWorkspaceWithDetails(id) as Promise<WorkspaceWithDetails>
  }
}
