import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getDatabase } from '../db/index.js'
import {
  WorkspaceRepository,
  WorktreeRepository,
  AgentRepository,
} from '../db/repositories/index.js'
import { WorktreeService } from '../services/worktree.service.js'
import {
  CreateWorktreeSchema,
  UpdateWorktreeSchema,
  CheckoutBranchSchema,
  ReorderWorktreesSchema,
} from '../validation/schemas.js'
import { getEventBroadcaster } from '../websocket/index.js'

interface WorkspaceWorktreeParams {
  workspaceId: string
  id?: string
}

export async function worktreeRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabase()
  const worktreeRepo = new WorktreeRepository(db)
  const agentRepo = new AgentRepository(db)
  const workspaceRepo = new WorkspaceRepository(db)
  const worktreeService = new WorktreeService(worktreeRepo, agentRepo, workspaceRepo)

  // GET /api/workspaces/:workspaceId/worktrees - List worktrees
  app.get<{ Params: { workspaceId: string } }>(
    '/api/workspaces/:workspaceId/worktrees',
    async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
      const worktrees = await worktreeService.listWorktreesByWorkspace(request.params.workspaceId)
      return reply.send({ worktrees })
    }
  )

  // POST /api/workspaces/:workspaceId/worktrees - Create worktree
  app.post<{ Params: { workspaceId: string } }>(
    '/api/workspaces/:workspaceId/worktrees',
    async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
      const body = CreateWorktreeSchema.parse(request.body)
      const worktree = await worktreeService.createWorktree({
        workspaceId: request.params.workspaceId,
        name: body.name,
        branch: body.branch,
        createBranch: body.createBranch,
      })

      // Broadcast workspace update
      const broadcaster = getEventBroadcaster()
      if (broadcaster) {
        broadcaster.broadcastWorkspaceUpdate(request.params.workspaceId, 'worktree_added', {
          id: worktree.id,
          name: worktree.name,
          branch: worktree.branch,
        })
      }

      return reply.status(201).send(worktree)
    }
  )

  // GET /api/workspaces/:workspaceId/worktrees/:id - Get worktree with agents
  app.get<{ Params: WorkspaceWorktreeParams }>(
    '/api/workspaces/:workspaceId/worktrees/:id',
    async (request: FastifyRequest<{ Params: WorkspaceWorktreeParams }>, reply: FastifyReply) => {
      const worktree = await worktreeService.getWorktreeWithAgents(request.params.id!)
      if (!worktree) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Worktree not found' },
        })
      }
      return reply.send(worktree)
    }
  )

  // PUT /api/workspaces/:workspaceId/worktrees/:id - Update worktree
  app.put<{ Params: WorkspaceWorktreeParams }>(
    '/api/workspaces/:workspaceId/worktrees/:id',
    async (request: FastifyRequest<{ Params: WorkspaceWorktreeParams }>, reply: FastifyReply) => {
      const body = UpdateWorktreeSchema.parse(request.body)
      const worktree = await worktreeService.updateWorktree(request.params.id!, {
        name: body.name,
        sortMode: body.sortMode,
        order: body.order,
      })
      return reply.send(worktree)
    }
  )

  // DELETE /api/workspaces/:workspaceId/worktrees/:id - Delete worktree
  app.delete<{ Params: WorkspaceWorktreeParams; Querystring: { force?: string } }>(
    '/api/workspaces/:workspaceId/worktrees/:id',
    async (
      request: FastifyRequest<{ Params: WorkspaceWorktreeParams; Querystring: { force?: string } }>,
      reply: FastifyReply
    ) => {
      const force = request.query.force === 'true'
      const worktreeId = request.params.id!
      await worktreeService.deleteWorktree(worktreeId, force)

      // Broadcast workspace update
      const broadcaster = getEventBroadcaster()
      if (broadcaster) {
        broadcaster.broadcastWorkspaceUpdate(request.params.workspaceId, 'worktree_removed', {
          id: worktreeId,
        })
      }

      return reply.status(204).send()
    }
  )

  // POST /api/workspaces/:workspaceId/worktrees/:id/checkout - Checkout branch
  app.post<{ Params: WorkspaceWorktreeParams }>(
    '/api/workspaces/:workspaceId/worktrees/:id/checkout',
    async (request: FastifyRequest<{ Params: WorkspaceWorktreeParams }>, reply: FastifyReply) => {
      const body = CheckoutBranchSchema.parse(request.body)
      const worktree = await worktreeService.checkoutBranch(
        request.params.id!,
        body.branch,
        body.createBranch
      )
      return reply.send(worktree)
    }
  )

  // PUT /api/workspaces/:workspaceId/worktrees/reorder - Reorder worktrees
  app.put<{ Params: { workspaceId: string } }>(
    '/api/workspaces/:workspaceId/worktrees/reorder',
    async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
      const body = ReorderWorktreesSchema.parse(request.body)
      await worktreeService.reorderWorktrees(request.params.workspaceId, body.worktreeIds)

      const worktrees = await worktreeService.listWorktreesByWorkspace(request.params.workspaceId)
      return reply.send({
        worktrees: worktrees.map((w) => ({ id: w.id, order: w.displayOrder })),
      })
    }
  )

  // GET /api/workspaces/:workspaceId/worktrees/:id/status - Get git status
  app.get<{ Params: WorkspaceWorktreeParams }>(
    '/api/workspaces/:workspaceId/worktrees/:id/status',
    async (request: FastifyRequest<{ Params: WorkspaceWorktreeParams }>, reply: FastifyReply) => {
      const status = await worktreeService.getGitStatus(request.params.id!)
      return reply.send(status)
    }
  )

  // GET /api/workspaces/:workspaceId/worktrees/:id/branches - List branches
  app.get<{ Params: WorkspaceWorktreeParams }>(
    '/api/workspaces/:workspaceId/worktrees/:id/branches',
    async (request: FastifyRequest<{ Params: WorkspaceWorktreeParams }>, reply: FastifyReply) => {
      const branches = await worktreeService.listBranches(request.params.id!)
      return reply.send(branches)
    }
  )
}
