import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { HeartbeatManager } from '../../../src/websocket/heartbeat-manager.js'
import { ClientManager } from '../../../src/websocket/client-manager.js'

// Mock WebSocket
function createMockSocket(readyState = 1): WebSocket {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket
}

describe('HeartbeatManager', () => {
  let clientManager: ClientManager
  let heartbeatManager: HeartbeatManager

  beforeEach(() => {
    vi.useFakeTimers()
    clientManager = new ClientManager()
  })

  afterEach(() => {
    heartbeatManager?.stop()
    vi.useRealTimers()
  })

  describe('start/stop', () => {
    it('should start checking for stale clients', () => {
      heartbeatManager = new HeartbeatManager(clientManager, 1000, 3000)

      const socket = createMockSocket()
      const client = clientManager.addClient(socket)

      // Make client stale
      client.lastPing = Date.now() - 5000

      heartbeatManager.start()

      // Advance timer to trigger check
      vi.advanceTimersByTime(1000)

      expect(socket.close).toHaveBeenCalledWith(1001, 'Connection timed out')
    })

    it('should not close non-stale clients', () => {
      heartbeatManager = new HeartbeatManager(clientManager, 1000, 3000)

      const socket = createMockSocket()
      clientManager.addClient(socket)

      heartbeatManager.start()

      // Advance timer to trigger check
      vi.advanceTimersByTime(1000)

      expect(socket.close).not.toHaveBeenCalled()
    })

    it('should stop checking on stop', () => {
      heartbeatManager = new HeartbeatManager(clientManager, 1000, 3000)

      const socket = createMockSocket()
      const client = clientManager.addClient(socket)

      heartbeatManager.start()
      heartbeatManager.stop()

      // Make client stale after stop
      client.lastPing = Date.now() - 5000

      // Advance timer
      vi.advanceTimersByTime(2000)

      // Should not close because manager is stopped
      expect(socket.close).not.toHaveBeenCalled()
    })
  })

  describe('multiple check cycles', () => {
    it('should run checks repeatedly', () => {
      heartbeatManager = new HeartbeatManager(clientManager, 1000, 3000)

      const socket1 = createMockSocket()
      const client1 = clientManager.addClient(socket1)

      const socket2 = createMockSocket()
      const client2 = clientManager.addClient(socket2)

      heartbeatManager.start()

      // First cycle - no stale clients
      vi.advanceTimersByTime(1000)
      expect(socket1.close).not.toHaveBeenCalled()
      expect(socket2.close).not.toHaveBeenCalled()

      // Make client1 stale
      client1.lastPing = Date.now() - 5000

      // Second cycle - client1 should be closed
      vi.advanceTimersByTime(1000)
      expect(socket1.close).toHaveBeenCalled()
      expect(socket2.close).not.toHaveBeenCalled()

      // Make client2 stale
      client2.lastPing = Date.now() - 5000

      // Third cycle - client2 should be closed
      vi.advanceTimersByTime(1000)
      expect(socket2.close).toHaveBeenCalled()
    })
  })

  describe('double start prevention', () => {
    it('should not start multiple timers', () => {
      heartbeatManager = new HeartbeatManager(clientManager, 1000, 3000)

      const socket = createMockSocket()
      const client = clientManager.addClient(socket)
      client.lastPing = Date.now() - 5000

      heartbeatManager.start()
      heartbeatManager.start() // Second start should be no-op

      // Advance timer
      vi.advanceTimersByTime(1000)

      // Should only close once
      expect(socket.close).toHaveBeenCalledTimes(1)
    })
  })
})
