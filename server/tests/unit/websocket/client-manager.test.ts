import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { ClientManager } from '../../../src/websocket/client-manager.js'

// Mock WebSocket
function createMockSocket(readyState = 1): WebSocket {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket
}

describe('ClientManager', () => {
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = new ClientManager()
  })

  describe('addClient', () => {
    it('should add a new client', () => {
      const socket = createMockSocket()
      const client = clientManager.addClient(socket)

      expect(client.id).toMatch(/^cl_/)
      expect(client.socket).toBe(socket)
      expect(client.subscribedAgents.size).toBe(0)
      expect(client.subscribedWorkspaces.size).toBe(0)
    })

    it('should track multiple clients', () => {
      const socket1 = createMockSocket()
      const socket2 = createMockSocket()

      clientManager.addClient(socket1)
      clientManager.addClient(socket2)

      expect(clientManager.getClientCount()).toBe(2)
    })
  })

  describe('removeClient', () => {
    it('should remove a client by socket', () => {
      const socket = createMockSocket()
      clientManager.addClient(socket)

      expect(clientManager.getClientCount()).toBe(1)

      clientManager.removeClient(socket)

      expect(clientManager.getClientCount()).toBe(0)
    })

    it('should handle removing non-existent client', () => {
      const socket = createMockSocket()
      clientManager.removeClient(socket)

      expect(clientManager.getClientCount()).toBe(0)
    })
  })

  describe('getClient', () => {
    it('should return client by socket', () => {
      const socket = createMockSocket()
      const addedClient = clientManager.addClient(socket)

      const foundClient = clientManager.getClient(socket)

      expect(foundClient).toBe(addedClient)
    })

    it('should return undefined for unknown socket', () => {
      const socket = createMockSocket()

      const foundClient = clientManager.getClient(socket)

      expect(foundClient).toBeUndefined()
    })
  })

  describe('subscriptions', () => {
    it('should subscribe to agent', () => {
      const socket = createMockSocket()
      clientManager.addClient(socket)

      const result = clientManager.subscribeToAgent(socket, 'ag_test123')

      expect(result).toBe(true)
      const client = clientManager.getClient(socket)
      expect(client?.subscribedAgents.has('ag_test123')).toBe(true)
    })

    it('should unsubscribe from agent', () => {
      const socket = createMockSocket()
      clientManager.addClient(socket)
      clientManager.subscribeToAgent(socket, 'ag_test123')

      const result = clientManager.unsubscribeFromAgent(socket, 'ag_test123')

      expect(result).toBe(true)
      const client = clientManager.getClient(socket)
      expect(client?.subscribedAgents.has('ag_test123')).toBe(false)
    })

    it('should subscribe to workspace', () => {
      const socket = createMockSocket()
      clientManager.addClient(socket)

      const result = clientManager.subscribeToWorkspace(socket, 'ws_test123')

      expect(result).toBe(true)
      const client = clientManager.getClient(socket)
      expect(client?.subscribedWorkspaces.has('ws_test123')).toBe(true)
    })

    it('should unsubscribe from workspace', () => {
      const socket = createMockSocket()
      clientManager.addClient(socket)
      clientManager.subscribeToWorkspace(socket, 'ws_test123')

      const result = clientManager.unsubscribeFromWorkspace(socket, 'ws_test123')

      expect(result).toBe(true)
      const client = clientManager.getClient(socket)
      expect(client?.subscribedWorkspaces.has('ws_test123')).toBe(false)
    })

    it('should return false for unknown socket', () => {
      const socket = createMockSocket()

      expect(clientManager.subscribeToAgent(socket, 'ag_test123')).toBe(false)
      expect(clientManager.unsubscribeFromAgent(socket, 'ag_test123')).toBe(false)
      expect(clientManager.subscribeToWorkspace(socket, 'ws_test123')).toBe(false)
      expect(clientManager.unsubscribeFromWorkspace(socket, 'ws_test123')).toBe(false)
    })
  })

  describe('getClientsSubscribedToAgent', () => {
    it('should return clients subscribed to agent', () => {
      const socket1 = createMockSocket()
      const socket2 = createMockSocket()
      const socket3 = createMockSocket()

      clientManager.addClient(socket1)
      clientManager.addClient(socket2)
      clientManager.addClient(socket3)

      clientManager.subscribeToAgent(socket1, 'ag_test123')
      clientManager.subscribeToAgent(socket2, 'ag_test123')
      clientManager.subscribeToAgent(socket3, 'ag_other')

      const subscribers = clientManager.getClientsSubscribedToAgent('ag_test123')

      expect(subscribers.length).toBe(2)
    })
  })

  describe('getClientsSubscribedToWorkspace', () => {
    it('should return clients subscribed to workspace', () => {
      const socket1 = createMockSocket()
      const socket2 = createMockSocket()

      clientManager.addClient(socket1)
      clientManager.addClient(socket2)

      clientManager.subscribeToWorkspace(socket1, 'ws_test123')

      const subscribers = clientManager.getClientsSubscribedToWorkspace('ws_test123')

      expect(subscribers.length).toBe(1)
    })
  })

  describe('sendToClient', () => {
    it('should send message to open socket', () => {
      const socket = createMockSocket(1) // OPEN
      const client = clientManager.addClient(socket)

      const message = { type: 'test' as const, timestamp: new Date().toISOString() }
      const result = clientManager.sendToClient(client, message as never)

      expect(result).toBe(true)
      expect(socket.send).toHaveBeenCalledWith(JSON.stringify(message))
    })

    it('should not send to closed socket', () => {
      const socket = createMockSocket(3) // CLOSED
      const client = clientManager.addClient(socket)

      const message = { type: 'test' as const, timestamp: new Date().toISOString() }
      const result = clientManager.sendToClient(client, message as never)

      expect(result).toBe(false)
      expect(socket.send).not.toHaveBeenCalled()
    })
  })

  describe('broadcastToAgentSubscribers', () => {
    it('should broadcast to all subscribers', () => {
      const socket1 = createMockSocket()
      const socket2 = createMockSocket()

      clientManager.addClient(socket1)
      clientManager.addClient(socket2)

      clientManager.subscribeToAgent(socket1, 'ag_test123')
      clientManager.subscribeToAgent(socket2, 'ag_test123')

      const message = {
        type: 'agent:status' as const,
        payload: { agentId: 'ag_test123', status: 'running', previousStatus: 'waiting' },
        timestamp: new Date().toISOString(),
      }
      const sent = clientManager.broadcastToAgentSubscribers('ag_test123', message as never)

      expect(sent).toBe(2)
      expect(socket1.send).toHaveBeenCalled()
      expect(socket2.send).toHaveBeenCalled()
    })
  })

  describe('broadcast', () => {
    it('should broadcast to all clients', () => {
      const socket1 = createMockSocket()
      const socket2 = createMockSocket()

      clientManager.addClient(socket1)
      clientManager.addClient(socket2)

      const message = { type: 'pong' as const, timestamp: new Date().toISOString() }
      const sent = clientManager.broadcast(message as never)

      expect(sent).toBe(2)
    })
  })

  describe('getStaleClients', () => {
    it('should return clients that have not pinged recently', () => {
      const socket = createMockSocket()
      const client = clientManager.addClient(socket)

      // Manually set lastPing to the past
      client.lastPing = Date.now() - 100000

      const staleClients = clientManager.getStaleClients(90000)

      expect(staleClients.length).toBe(1)
      expect(staleClients[0]).toBe(client)
    })

    it('should not return recently active clients', () => {
      const socket = createMockSocket()
      clientManager.addClient(socket)

      const staleClients = clientManager.getStaleClients(90000)

      expect(staleClients.length).toBe(0)
    })
  })

  describe('updatePing', () => {
    it('should update lastPing time', () => {
      const socket = createMockSocket()
      const client = clientManager.addClient(socket)

      // Set ping to the past
      client.lastPing = Date.now() - 10000
      const oldPing = client.lastPing

      clientManager.updatePing(socket)

      expect(client.lastPing).toBeGreaterThan(oldPing)
    })
  })

  describe('cleanup', () => {
    it('should close all sockets and clear clients', () => {
      const socket1 = createMockSocket()
      const socket2 = createMockSocket()

      clientManager.addClient(socket1)
      clientManager.addClient(socket2)

      clientManager.cleanup()

      expect(socket1.close).toHaveBeenCalled()
      expect(socket2.close).toHaveBeenCalled()
      expect(clientManager.getClientCount()).toBe(0)
    })
  })
})
