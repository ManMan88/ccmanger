import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { EventEmitter } from 'events'
import { EventBroadcaster } from '../../../src/websocket/event-broadcaster.js'
import { ClientManager } from '../../../src/websocket/client-manager.js'
import type { ProcessManager } from '../../../src/services/process.service.js'
import type { AgentStatus } from '@claude-manager/shared'

// Mock WebSocket
function createMockSocket(readyState = 1): WebSocket {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket
}

// Create a mock ProcessManager that extends EventEmitter
function createMockProcessManager(): ProcessManager & EventEmitter {
  const emitter = new EventEmitter() as ProcessManager & EventEmitter
  return emitter
}

describe('EventBroadcaster', () => {
  let processManager: ProcessManager & EventEmitter
  let clientManager: ClientManager
  let broadcaster: EventBroadcaster
  let socket: WebSocket

  beforeEach(() => {
    processManager = createMockProcessManager()
    clientManager = new ClientManager()
    broadcaster = new EventBroadcaster(processManager, clientManager)

    socket = createMockSocket()
    clientManager.addClient(socket)
    clientManager.subscribeToAgent(socket, 'ag_test123')
  })

  describe('start/stop', () => {
    it('should register event listeners on start', () => {
      const onSpy = vi.spyOn(processManager, 'on')

      broadcaster.start()

      expect(onSpy).toHaveBeenCalledWith('agent:output', expect.any(Function))
      expect(onSpy).toHaveBeenCalledWith('agent:status', expect.any(Function))
      expect(onSpy).toHaveBeenCalledWith('agent:context', expect.any(Function))
      expect(onSpy).toHaveBeenCalledWith('agent:error', expect.any(Function))
      expect(onSpy).toHaveBeenCalledWith('agent:exit', expect.any(Function))
    })

    it('should remove event listeners on stop', () => {
      broadcaster.start()
      const offSpy = vi.spyOn(processManager, 'off')

      broadcaster.stop()

      expect(offSpy).toHaveBeenCalledWith('agent:output', expect.any(Function))
      expect(offSpy).toHaveBeenCalledWith('agent:status', expect.any(Function))
      expect(offSpy).toHaveBeenCalledWith('agent:context', expect.any(Function))
      expect(offSpy).toHaveBeenCalledWith('agent:error', expect.any(Function))
      expect(offSpy).toHaveBeenCalledWith('agent:exit', expect.any(Function))
    })
  })

  describe('agent:output events', () => {
    it('should broadcast agent output to subscribers', () => {
      broadcaster.start()

      processManager.emit('agent:output', 'ag_test123', 'Hello world', true)

      expect(socket.send).toHaveBeenCalled()
      const message = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(message.type).toBe('agent:output')
      expect(message.payload.agentId).toBe('ag_test123')
      expect(message.payload.content).toBe('Hello world')
      expect(message.payload.isStreaming).toBe(true)
    })

    it('should not broadcast to non-subscribers', () => {
      const otherSocket = createMockSocket()
      clientManager.addClient(otherSocket)
      // Not subscribed to ag_test123

      broadcaster.start()
      processManager.emit('agent:output', 'ag_test123', 'Hello world', true)

      expect(otherSocket.send).not.toHaveBeenCalled()
    })
  })

  describe('agent:status events', () => {
    it('should broadcast status changes', () => {
      broadcaster.start()

      processManager.emit('agent:status', 'ag_test123', 'running' as AgentStatus)

      expect(socket.send).toHaveBeenCalled()
      const message = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(message.type).toBe('agent:status')
      expect(message.payload.agentId).toBe('ag_test123')
      expect(message.payload.status).toBe('running')
    })

    it('should include previous status', () => {
      broadcaster.start()

      // First status change
      processManager.emit('agent:status', 'ag_test123', 'running' as AgentStatus)
      // Second status change
      processManager.emit('agent:status', 'ag_test123', 'waiting' as AgentStatus)

      const calls = (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls
      const lastMessage = JSON.parse(calls[calls.length - 1][0])
      expect(lastMessage.payload.previousStatus).toBe('running')
      expect(lastMessage.payload.status).toBe('waiting')
    })

    it('should not broadcast if status unchanged', () => {
      broadcaster.start()

      processManager.emit('agent:status', 'ag_test123', 'running' as AgentStatus)
      const callCount = (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls
        .length

      processManager.emit('agent:status', 'ag_test123', 'running' as AgentStatus)

      // Should not have sent another message
      expect((socket.send as unknown as { mock: { calls: string[][] } }).mock.calls.length).toBe(
        callCount
      )
    })
  })

  describe('agent:context events', () => {
    it('should broadcast context level updates', () => {
      broadcaster.start()

      processManager.emit('agent:context', 'ag_test123', 75)

      expect(socket.send).toHaveBeenCalled()
      const message = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(message.type).toBe('agent:context')
      expect(message.payload.agentId).toBe('ag_test123')
      expect(message.payload.contextLevel).toBe(75)
    })
  })

  describe('agent:error events', () => {
    it('should broadcast errors', () => {
      broadcaster.start()

      const error = new Error('Test error')
      processManager.emit('agent:error', 'ag_test123', error)

      expect(socket.send).toHaveBeenCalled()
      const message = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(message.type).toBe('agent:error')
      expect(message.payload.agentId).toBe('ag_test123')
      expect(message.payload.error.message).toBe('Test error')
    })
  })

  describe('agent:exit events', () => {
    it('should broadcast termination with exit code', () => {
      broadcaster.start()

      processManager.emit('agent:exit', 'ag_test123', 0, null)

      expect(socket.send).toHaveBeenCalled()
      const message = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(message.type).toBe('agent:terminated')
      expect(message.payload.agentId).toBe('ag_test123')
      expect(message.payload.exitCode).toBe(0)
      expect(message.payload.reason).toBe('completed')
    })

    it('should detect user stop via signal', () => {
      broadcaster.start()

      processManager.emit('agent:exit', 'ag_test123', null, 'SIGTERM')

      const message = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(message.payload.reason).toBe('user_stopped')
    })

    it('should detect error exit', () => {
      broadcaster.start()

      processManager.emit('agent:exit', 'ag_test123', 1, null)

      const message = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(message.payload.reason).toBe('error')
    })
  })

  describe('workspace updates', () => {
    it('should broadcast workspace updates', () => {
      const workspaceSocket = createMockSocket()
      clientManager.addClient(workspaceSocket)
      clientManager.subscribeToWorkspace(workspaceSocket, 'ws_test123')

      broadcaster.broadcastWorkspaceUpdate('ws_test123', 'worktree_added', {
        id: 'wt_new123',
        name: 'feature',
      })

      expect(workspaceSocket.send).toHaveBeenCalled()
      const message = JSON.parse(
        (workspaceSocket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(message.type).toBe('workspace:updated')
      expect(message.payload.workspaceId).toBe('ws_test123')
      expect(message.payload.change).toBe('worktree_added')
    })
  })

  describe('usage updates', () => {
    it('should broadcast usage updates to all clients', () => {
      const socket2 = createMockSocket()
      clientManager.addClient(socket2)

      broadcaster.broadcastUsageUpdate({
        daily: { used: 10000, limit: 500000 },
        weekly: { used: 50000, limit: 2000000 },
      })

      expect(socket.send).toHaveBeenCalled()
      expect(socket2.send).toHaveBeenCalled()

      const message = JSON.parse(
        (socket.send as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
      )
      expect(message.type).toBe('usage:updated')
      expect(message.payload.daily.used).toBe(10000)
    })
  })
})
