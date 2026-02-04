import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getDatabase } from '../db/index.js'
import {
  WorkspaceRepository,
  WorktreeRepository,
  AgentRepository,
} from '../db/repositories/index.js'
import { WorkspaceService } from '../services/workspace.service.js'
import { CreateWorkspaceSchema, UpdateWorkspaceSchema } from '../validation/schemas.js'

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabase()
  const workspaceRepo = new WorkspaceRepository(db)
  const worktreeRepo = new WorktreeRepository(db)
  const agentRepo = new AgentRepository(db)
  const workspaceService = new WorkspaceService(workspaceRepo, worktreeRepo, agentRepo)

  // GET /api/workspaces - List all workspaces
  app.get('/api/workspaces', async (_request: FastifyRequest, reply: FastifyReply) => {
    const workspaces = await workspaceService.listWorkspaces()
    return reply.send({ workspaces })
  })

  // GET /api/workspaces/:id - Get workspace with all worktrees and agents
  app.get<{ Params: { id: string } }>(
    '/api/workspaces/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const workspace = await workspaceService.getWorkspaceWithDetails(request.params.id)
      if (!workspace) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Workspace not found' },
        })
      }
      return reply.send(workspace)
    }
  )

  // POST /api/workspaces - Create or open workspace
  app.post('/api/workspaces', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = CreateWorkspaceSchema.parse(request.body)
    const workspace = await workspaceService.createWorkspace(body.path)
    return reply.status(201).send(workspace)
  })

  // PUT /api/workspaces/:id - Update workspace
  app.put<{ Params: { id: string } }>(
    '/api/workspaces/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const body = UpdateWorkspaceSchema.parse(request.body)
      if (!body.name) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Name is required' },
        })
      }
      const workspace = await workspaceService.updateWorkspace(request.params.id, body.name)
      return reply.send(workspace)
    }
  )

  // DELETE /api/workspaces/:id - Close workspace
  app.delete<{ Params: { id: string } }>(
    '/api/workspaces/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      await workspaceService.deleteWorkspace(request.params.id)
      return reply.status(204).send()
    }
  )

  // POST /api/workspaces/:id/refresh - Refresh worktrees from git
  app.post<{ Params: { id: string } }>(
    '/api/workspaces/:id/refresh',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const workspace = await workspaceService.refreshWorkspace(request.params.id)
      return reply.send(workspace)
    }
  )
}
