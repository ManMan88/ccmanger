import type { WebSocket } from 'ws'
import { z } from 'zod'
import { logger } from '../utils/logger.js'
import type { ClientManager } from './client-manager.js'
import type {
  ClientMessage,
  ErrorMessage,
  PongMessage,
  SubscribedMessage,
  UnsubscribedMessage,
} from './types.js'
import { AgentIdSchema, WorkspaceIdSchema } from '../validation/schemas.js'

// Validation schemas for incoming messages
const SubscribeAgentPayloadSchema = z.object({
  agentId: AgentIdSchema,
})

const UnsubscribeAgentPayloadSchema = z.object({
  agentId: AgentIdSchema,
})

const SubscribeWorkspacePayloadSchema = z.object({
  workspaceId: WorkspaceIdSchema,
})

const UnsubscribeWorkspacePayloadSchema = z.object({
  workspaceId: WorkspaceIdSchema,
})

const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe:agent'),
    payload: SubscribeAgentPayloadSchema,
  }),
  z.object({
    type: z.literal('unsubscribe:agent'),
    payload: UnsubscribeAgentPayloadSchema,
  }),
  z.object({
    type: z.literal('subscribe:workspace'),
    payload: SubscribeWorkspacePayloadSchema,
  }),
  z.object({
    type: z.literal('unsubscribe:workspace'),
    payload: UnsubscribeWorkspacePayloadSchema,
  }),
  z.object({
    type: z.literal('ping'),
  }),
])

export class MessageHandler {
  constructor(private clientManager: ClientManager) {}

  handleMessage(socket: WebSocket, rawMessage: string): void {
    let parsed: unknown

    // Parse JSON
    try {
      parsed = JSON.parse(rawMessage)
    } catch {
      this.sendError(socket, 'INVALID_JSON', 'Message is not valid JSON')
      return
    }

    // Validate message structure
    const result = ClientMessageSchema.safeParse(parsed)
    if (!result.success) {
      const errorMessage = result.error.issues.map((i) => i.message).join(', ')
      this.sendError(socket, 'INVALID_MESSAGE', `Invalid message format: ${errorMessage}`)
      return
    }

    const message = result.data as ClientMessage

    // Route to appropriate handler
    switch (message.type) {
      case 'subscribe:agent':
        this.handleSubscribeAgent(socket, message.payload.agentId)
        break
      case 'unsubscribe:agent':
        this.handleUnsubscribeAgent(socket, message.payload.agentId)
        break
      case 'subscribe:workspace':
        this.handleSubscribeWorkspace(socket, message.payload.workspaceId)
        break
      case 'unsubscribe:workspace':
        this.handleUnsubscribeWorkspace(socket, message.payload.workspaceId)
        break
      case 'ping':
        this.handlePing(socket)
        break
      default:
        this.sendError(socket, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type`)
    }
  }

  private handleSubscribeAgent(socket: WebSocket, agentId: string): void {
    const success = this.clientManager.subscribeToAgent(socket, agentId)
    if (success) {
      const response: SubscribedMessage = {
        type: 'subscribed',
        payload: { type: 'agent', id: agentId },
        timestamp: new Date().toISOString(),
      }
      this.send(socket, response)
      logger.debug({ agentId }, 'Client subscribed to agent')
    } else {
      this.sendError(socket, 'SUBSCRIPTION_FAILED', 'Failed to subscribe to agent')
    }
  }

  private handleUnsubscribeAgent(socket: WebSocket, agentId: string): void {
    const success = this.clientManager.unsubscribeFromAgent(socket, agentId)
    if (success) {
      const response: UnsubscribedMessage = {
        type: 'unsubscribed',
        payload: { type: 'agent', id: agentId },
        timestamp: new Date().toISOString(),
      }
      this.send(socket, response)
      logger.debug({ agentId }, 'Client unsubscribed from agent')
    } else {
      this.sendError(socket, 'UNSUBSCRIPTION_FAILED', 'Failed to unsubscribe from agent')
    }
  }

  private handleSubscribeWorkspace(socket: WebSocket, workspaceId: string): void {
    const success = this.clientManager.subscribeToWorkspace(socket, workspaceId)
    if (success) {
      const response: SubscribedMessage = {
        type: 'subscribed',
        payload: { type: 'workspace', id: workspaceId },
        timestamp: new Date().toISOString(),
      }
      this.send(socket, response)
      logger.debug({ workspaceId }, 'Client subscribed to workspace')
    } else {
      this.sendError(socket, 'SUBSCRIPTION_FAILED', 'Failed to subscribe to workspace')
    }
  }

  private handleUnsubscribeWorkspace(socket: WebSocket, workspaceId: string): void {
    const success = this.clientManager.unsubscribeFromWorkspace(socket, workspaceId)
    if (success) {
      const response: UnsubscribedMessage = {
        type: 'unsubscribed',
        payload: { type: 'workspace', id: workspaceId },
        timestamp: new Date().toISOString(),
      }
      this.send(socket, response)
      logger.debug({ workspaceId }, 'Client unsubscribed from workspace')
    } else {
      this.sendError(socket, 'UNSUBSCRIPTION_FAILED', 'Failed to unsubscribe from workspace')
    }
  }

  private handlePing(socket: WebSocket): void {
    this.clientManager.updatePing(socket)
    const response: PongMessage = {
      type: 'pong',
      timestamp: new Date().toISOString(),
    }
    this.send(socket, response)
  }

  private send(socket: WebSocket, message: object): void {
    if (socket.readyState === 1) {
      // WebSocket.OPEN
      socket.send(JSON.stringify(message))
    }
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    const errorMessage: ErrorMessage = {
      type: 'error',
      payload: { code, message },
      timestamp: new Date().toISOString(),
    }
    this.send(socket, errorMessage)
    logger.warn({ code, message }, 'WebSocket error sent to client')
  }
}
