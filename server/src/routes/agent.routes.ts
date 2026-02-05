import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getDatabase } from '../db/index.js'
import {
  AgentRepository,
  MessageRepository,
  WorktreeRepository,
  WorkspaceRepository,
} from '../db/repositories/index.js'
import { AgentService } from '../services/agent.service.js'
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  SendMessageSchema,
  ReorderAgentsSchema,
  ForkAgentSchema,
  AgentQuerySchema,
  MessageQuerySchema,
} from '../validation/schemas.js'
import { getEventBroadcaster } from '../websocket/index.js'

interface AgentParams {
  id: string
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabase()
  const agentRepo = new AgentRepository(db)
  const messageRepo = new MessageRepository(db)
  const worktreeRepo = new WorktreeRepository(db)
  const workspaceRepo = new WorkspaceRepository(db)
  const agentService = new AgentService(agentRepo, messageRepo, worktreeRepo, workspaceRepo)

  // GET /api/agents - List all agents
  app.get('/api/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = AgentQuerySchema.parse(request.query)
    const agents = await agentService.listAgents({
      worktreeId: query.worktreeId,
      status: query.status,
      includeDeleted: query.includeDeleted,
    })
    return reply.send({ agents })
  })

  // GET /api/agents/:id - Get agent details
  app.get<{ Params: AgentParams }>(
    '/api/agents/:id',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const agent = await agentService.getAgentById(request.params.id)
      if (!agent) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Agent not found' },
        })
      }
      return reply.send(agent)
    }
  )

  // POST /api/agents - Create agent
  app.post('/api/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = CreateAgentSchema.parse(request.body)
    const agent = await agentService.createAgent({
      worktreeId: body.worktreeId,
      name: body.name,
      mode: body.mode,
      permissions: body.permissions,
    })

    // Broadcast workspace update - need to get workspace ID from worktree
    const worktree = worktreeRepo.findById(body.worktreeId)
    if (worktree) {
      const broadcaster = getEventBroadcaster()
      if (broadcaster) {
        broadcaster.broadcastWorkspaceUpdate(worktree.workspace_id, 'agent_added', {
          id: agent.id,
          name: agent.name,
          worktreeId: agent.worktreeId,
          status: agent.status,
        })
      }
    }

    return reply.status(201).send(agent)
  })

  // PUT /api/agents/:id - Update agent
  app.put<{ Params: AgentParams }>(
    '/api/agents/:id',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const body = UpdateAgentSchema.parse(request.body)
      const agent = await agentService.updateAgent(request.params.id, {
        name: body.name,
        mode: body.mode,
        permissions: body.permissions,
      })

      // Broadcast workspace update
      const worktree = worktreeRepo.findById(agent.worktreeId)
      if (worktree) {
        const broadcaster = getEventBroadcaster()
        if (broadcaster) {
          broadcaster.broadcastWorkspaceUpdate(worktree.workspace_id, 'agent_updated', {
            id: agent.id,
            name: agent.name,
            mode: agent.mode,
            permissions: agent.permissions,
          })
        }
      }

      return reply.send(agent)
    }
  )

  // DELETE /api/agents/:id - Delete agent
  app.delete<{ Params: AgentParams; Querystring: { archive?: string } }>(
    '/api/agents/:id',
    async (
      request: FastifyRequest<{ Params: AgentParams; Querystring: { archive?: string } }>,
      reply: FastifyReply
    ) => {
      const archive = request.query.archive !== 'false'
      const agentId = request.params.id

      // Get agent info before deletion for broadcasting
      const agent = await agentService.getAgentById(agentId)
      const worktree = agent ? worktreeRepo.findById(agent.worktreeId) : null

      await agentService.deleteAgent(agentId, archive)

      // Broadcast workspace update
      if (worktree) {
        const broadcaster = getEventBroadcaster()
        if (broadcaster) {
          broadcaster.broadcastWorkspaceUpdate(worktree.workspace_id, 'agent_removed', {
            id: agentId,
            worktreeId: worktree.id,
          })
        }
      }

      return reply.status(204).send()
    }
  )

  // POST /api/agents/:id/fork - Fork an agent
  app.post<{ Params: AgentParams }>(
    '/api/agents/:id/fork',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const body = ForkAgentSchema.parse(request.body || {})
      const forked = await agentService.forkAgent(request.params.id, body.name)
      return reply.status(201).send(forked)
    }
  )

  // POST /api/agents/:id/restore - Restore a deleted agent
  app.post<{ Params: AgentParams }>(
    '/api/agents/:id/restore',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const agent = await agentService.restoreAgent(request.params.id)
      return reply.send(agent)
    }
  )

  // PUT /api/agents/reorder - Reorder agents
  app.put('/api/agents/reorder', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = ReorderAgentsSchema.parse(request.body)
    await agentService.reorderAgents(body.worktreeId, body.agentIds)
    return reply.send({
      agents: body.agentIds.map((id, order) => ({ id, order })),
    })
  })

  // GET /api/agents/:id/messages - Get message history
  app.get<{ Params: AgentParams }>(
    '/api/agents/:id/messages',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const query = MessageQuerySchema.parse(request.query)
      const result = await agentService.getMessages(request.params.id, {
        limit: query.limit,
        before: query.before,
      })
      return reply.send({
        messages: result.messages,
        hasMore: result.hasMore,
        nextCursor: result.hasMore ? result.messages[0]?.id : undefined,
      })
    }
  )

  // POST /api/agents/:id/message - Send a message to a running agent
  app.post<{ Params: AgentParams }>(
    '/api/agents/:id/message',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const body = SendMessageSchema.parse(request.body)

      // Check if agent is running
      if (!agentService.isAgentRunning(request.params.id)) {
        // If not running, just save the message (for later when agent starts)
        const message = await agentService.addMessage(request.params.id, 'user', body.content)
        return reply.status(202).send({
          messageId: message.id,
          status: 'queued',
          running: false,
        })
      }

      // Send message to running agent
      const message = await agentService.sendMessageToAgent(request.params.id, body.content)
      return reply.status(202).send({
        messageId: message.id,
        status: 'sent',
        running: true,
      })
    }
  )

  // POST /api/agents/:id/stop - Stop a running agent
  app.post<{ Params: AgentParams; Querystring: { force?: string } }>(
    '/api/agents/:id/stop',
    async (
      request: FastifyRequest<{ Params: AgentParams; Querystring: { force?: string } }>,
      reply: FastifyReply
    ) => {
      const force = request.query.force === 'true'
      const agent = await agentService.stopAgent(request.params.id, force)
      return reply.send(agent)
    }
  )

  // POST /api/agents/:id/resume - Resume a stopped agent with session
  app.post<{ Params: AgentParams }>(
    '/api/agents/:id/resume',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const agent = await agentService.resumeAgent(request.params.id)
      return reply.send(agent)
    }
  )

  // POST /api/agents/:id/start - Start an agent process
  app.post<{ Params: AgentParams }>(
    '/api/agents/:id/start',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const body = (request.body || {}) as { initialPrompt?: string }
      const agent = await agentService.startAgent(request.params.id, body.initialPrompt)
      return reply.send(agent)
    }
  )

  // GET /api/agents/:id/status - Get real-time process status
  app.get<{ Params: AgentParams }>(
    '/api/agents/:id/status',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const agent = await agentService.getAgentById(request.params.id)
      if (!agent) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Agent not found' },
        })
      }

      const processStatus = agentService.getAgentProcessStatus(request.params.id)
      const isRunning = agentService.isAgentRunning(request.params.id)

      return reply.send({
        id: agent.id,
        status: agent.status,
        processStatus,
        isRunning,
        contextLevel: agent.contextLevel,
        pid: agent.pid,
      })
    }
  )
}
