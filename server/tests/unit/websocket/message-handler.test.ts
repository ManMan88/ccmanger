import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { MessageHandler } from '../../../src/websocket/message-handler.js'
import { ClientManager } from '../../../src/websocket/client-manager.js'

// Mock WebSocket
function createMockSocket(readyState = 1): WebSocket {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket
}

describe('MessageHandler', () => {
  let clientManager: ClientManager
  let messageHandler: MessageHandler
  let socket: WebSocket

  beforeEach(() => {
    clientManager = new ClientManager()
    messageHandler = new MessageHandler(clientManager)
    socket = createMockSocket()
    clientManager.addClient(socket)
  })

  describe('subscribe:agent', () => {
    it('should subscribe client to agent', () => {
      const message = JSON.stringify({
        type: 'subscribe:agent',
        payload: { agentId: 'ag_test123abc' },
      })

      messageHandler.handleMessage(socket, message)

      const client = clientManager.getClient(socket)
      expect(client?.subscribedAgents.has('ag_test123abc')).toBe(true)

      // Should send confirmation
      expect(socket.send).toHaveBeenCalled()
      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('subscribed')
      expect(response.payload.type).toBe('agent')
      expect(response.payload.id).toBe('ag_test123abc')
    })

    it('should reject invalid agent ID', () => {
      const message = JSON.stringify({
        type: 'subscribe:agent',
        payload: { agentId: 'invalid_id' },
      })

      messageHandler.handleMessage(socket, message)

      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('error')
      expect(response.payload.code).toBe('INVALID_MESSAGE')
    })
  })

  describe('unsubscribe:agent', () => {
    it('should unsubscribe client from agent', () => {
      clientManager.subscribeToAgent(socket, 'ag_test123abc')

      const message = JSON.stringify({
        type: 'unsubscribe:agent',
        payload: { agentId: 'ag_test123abc' },
      })

      messageHandler.handleMessage(socket, message)

      const client = clientManager.getClient(socket)
      expect(client?.subscribedAgents.has('ag_test123abc')).toBe(false)

      // Should send confirmation
      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('unsubscribed')
    })
  })

  describe('subscribe:workspace', () => {
    it('should subscribe client to workspace', () => {
      const message = JSON.stringify({
        type: 'subscribe:workspace',
        payload: { workspaceId: 'ws_test123abc' },
      })

      messageHandler.handleMessage(socket, message)

      const client = clientManager.getClient(socket)
      expect(client?.subscribedWorkspaces.has('ws_test123abc')).toBe(true)

      // Should send confirmation
      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('subscribed')
      expect(response.payload.type).toBe('workspace')
    })

    it('should reject invalid workspace ID', () => {
      const message = JSON.stringify({
        type: 'subscribe:workspace',
        payload: { workspaceId: 'bad' },
      })

      messageHandler.handleMessage(socket, message)

      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('error')
    })
  })

  describe('unsubscribe:workspace', () => {
    it('should unsubscribe client from workspace', () => {
      clientManager.subscribeToWorkspace(socket, 'ws_test123abc')

      const message = JSON.stringify({
        type: 'unsubscribe:workspace',
        payload: { workspaceId: 'ws_test123abc' },
      })

      messageHandler.handleMessage(socket, message)

      const client = clientManager.getClient(socket)
      expect(client?.subscribedWorkspaces.has('ws_test123abc')).toBe(false)
    })
  })

  describe('ping', () => {
    it('should respond with pong', () => {
      const message = JSON.stringify({ type: 'ping' })

      messageHandler.handleMessage(socket, message)

      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('pong')
      expect(response.timestamp).toBeDefined()
    })

    it('should update client lastPing', () => {
      const client = clientManager.getClient(socket)!
      const originalPing = client.lastPing

      // Set ping to past
      client.lastPing = originalPing - 10000

      const message = JSON.stringify({ type: 'ping' })
      messageHandler.handleMessage(socket, message)

      expect(client.lastPing).toBeGreaterThan(originalPing - 10000)
    })
  })

  describe('error handling', () => {
    it('should handle invalid JSON', () => {
      messageHandler.handleMessage(socket, 'not valid json')

      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('error')
      expect(response.payload.code).toBe('INVALID_JSON')
    })

    it('should handle missing type', () => {
      const message = JSON.stringify({ payload: {} })

      messageHandler.handleMessage(socket, message)

      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('error')
      expect(response.payload.code).toBe('INVALID_MESSAGE')
    })

    it('should handle unknown message type', () => {
      const message = JSON.stringify({ type: 'unknown:type' })

      messageHandler.handleMessage(socket, message)

      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('error')
    })

    it('should handle missing payload', () => {
      const message = JSON.stringify({ type: 'subscribe:agent' })

      messageHandler.handleMessage(socket, message)

      const response = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(response.type).toBe('error')
    })
  })
})
