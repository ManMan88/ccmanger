import type { WebSocket } from 'ws'
import { logger } from '../utils/logger.js'
import type { ConnectedClient, ServerMessage } from './types.js'
import { generateId } from '@claude-manager/shared'

export class ClientManager {
  private clients: Map<string, ConnectedClient> = new Map()
  private socketToClientId: Map<WebSocket, string> = new Map()

  addClient(socket: WebSocket): ConnectedClient {
    const clientId = generateId('cl')
    const client: ConnectedClient = {
      id: clientId,
      socket,
      subscribedAgents: new Set(),
      subscribedWorkspaces: new Set(),
      lastPing: Date.now(),
      connectedAt: new Date(),
    }

    this.clients.set(clientId, client)
    this.socketToClientId.set(socket, clientId)

    logger.info({ clientId }, 'WebSocket client connected')
    return client
  }

  removeClient(socket: WebSocket): void {
    const clientId = this.socketToClientId.get(socket)
    if (clientId) {
      const client = this.clients.get(clientId)
      if (client) {
        logger.info(
          {
            clientId,
            subscribedAgents: Array.from(client.subscribedAgents),
            subscribedWorkspaces: Array.from(client.subscribedWorkspaces),
          },
          'WebSocket client disconnected'
        )
      }
      this.clients.delete(clientId)
      this.socketToClientId.delete(socket)
    }
  }

  getClient(socket: WebSocket): ConnectedClient | undefined {
    const clientId = this.socketToClientId.get(socket)
    return clientId ? this.clients.get(clientId) : undefined
  }

  getClientById(clientId: string): ConnectedClient | undefined {
    return this.clients.get(clientId)
  }

  getAllClients(): ConnectedClient[] {
    return Array.from(this.clients.values())
  }

  getClientCount(): number {
    return this.clients.size
  }

  // Subscription management
  subscribeToAgent(socket: WebSocket, agentId: string): boolean {
    const client = this.getClient(socket)
    if (!client) return false

    client.subscribedAgents.add(agentId)
    logger.debug({ clientId: client.id, agentId }, 'Client subscribed to agent')
    return true
  }

  unsubscribeFromAgent(socket: WebSocket, agentId: string): boolean {
    const client = this.getClient(socket)
    if (!client) return false

    client.subscribedAgents.delete(agentId)
    logger.debug({ clientId: client.id, agentId }, 'Client unsubscribed from agent')
    return true
  }

  subscribeToWorkspace(socket: WebSocket, workspaceId: string): boolean {
    const client = this.getClient(socket)
    if (!client) return false

    client.subscribedWorkspaces.add(workspaceId)
    logger.debug({ clientId: client.id, workspaceId }, 'Client subscribed to workspace')
    return true
  }

  unsubscribeFromWorkspace(socket: WebSocket, workspaceId: string): boolean {
    const client = this.getClient(socket)
    if (!client) return false

    client.subscribedWorkspaces.delete(workspaceId)
    logger.debug({ clientId: client.id, workspaceId }, 'Client unsubscribed from workspace')
    return true
  }

  // Get clients subscribed to specific entities
  getClientsSubscribedToAgent(agentId: string): ConnectedClient[] {
    return Array.from(this.clients.values()).filter((client) =>
      client.subscribedAgents.has(agentId)
    )
  }

  getClientsSubscribedToWorkspace(workspaceId: string): ConnectedClient[] {
    return Array.from(this.clients.values()).filter((client) =>
      client.subscribedWorkspaces.has(workspaceId)
    )
  }

  // Update last ping time
  updatePing(socket: WebSocket): void {
    const client = this.getClient(socket)
    if (client) {
      client.lastPing = Date.now()
    }
  }

  // Get stale clients (no ping for a while)
  getStaleClients(maxAge: number): ConnectedClient[] {
    const cutoff = Date.now() - maxAge
    return Array.from(this.clients.values()).filter((client) => client.lastPing < cutoff)
  }

  // Send message to specific client
  sendToClient(client: ConnectedClient, message: ServerMessage): boolean {
    if (client.socket.readyState !== 1) {
      // WebSocket.OPEN
      logger.warn({ clientId: client.id }, 'Cannot send message, socket not open')
      return false
    }

    try {
      client.socket.send(JSON.stringify(message))
      return true
    } catch (error) {
      logger.error({ clientId: client.id, error }, 'Failed to send message to client')
      return false
    }
  }

  // Broadcast to all clients
  broadcast(message: ServerMessage): number {
    let sent = 0
    for (const client of this.clients.values()) {
      if (this.sendToClient(client, message)) {
        sent++
      }
    }
    return sent
  }

  // Broadcast to clients subscribed to an agent
  broadcastToAgentSubscribers(agentId: string, message: ServerMessage): number {
    const subscribers = this.getClientsSubscribedToAgent(agentId)
    let sent = 0
    for (const client of subscribers) {
      if (this.sendToClient(client, message)) {
        sent++
      }
    }
    logger.debug(
      { agentId, subscriberCount: subscribers.length, sent },
      'Broadcast to agent subscribers'
    )
    return sent
  }

  // Broadcast to clients subscribed to a workspace
  broadcastToWorkspaceSubscribers(workspaceId: string, message: ServerMessage): number {
    const subscribers = this.getClientsSubscribedToWorkspace(workspaceId)
    let sent = 0
    for (const client of subscribers) {
      if (this.sendToClient(client, message)) {
        sent++
      }
    }
    logger.debug(
      { workspaceId, subscriberCount: subscribers.length, sent },
      'Broadcast to workspace subscribers'
    )
    return sent
  }

  // Cleanup all clients
  cleanup(): void {
    for (const client of this.clients.values()) {
      try {
        client.socket.close(1001, 'Server shutting down')
      } catch {
        // Ignore close errors
      }
    }
    this.clients.clear()
    this.socketToClientId.clear()
    logger.info('WebSocket client manager cleaned up')
  }
}

// Singleton instance
let clientManager: ClientManager | null = null

export function getClientManager(): ClientManager {
  if (!clientManager) {
    clientManager = new ClientManager()
  }
  return clientManager
}

export function resetClientManager(): void {
  if (clientManager) {
    clientManager.cleanup()
    clientManager = null
  }
}
