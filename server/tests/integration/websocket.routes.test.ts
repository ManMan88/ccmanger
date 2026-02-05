import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import { buildApp } from '../../src/app.js'
import { initDatabase, closeDatabase, getDatabase } from '../../src/db/index.js'
import { runMigrations } from '../../src/db/migrate.js'
import { cleanupWebSocket, resetClientManager } from '../../src/websocket/index.js'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

let app: FastifyInstance
let testDbDir: string
let serverUrl: string
let wsUrl: string

async function createWebSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
    // Set a timeout for connection
    setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000)
  })
}

async function receiveMessage(ws: WebSocket, timeout = 2000): Promise<object> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeout)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(JSON.parse(data.toString()))
    })
  })
}

describe('WebSocket Routes', () => {
  beforeAll(async () => {
    // Create temp db directory
    testDbDir = mkdtempSync(join(tmpdir(), 'claude-manager-ws-test-'))
    const testDbPath = join(testDbDir, 'test.db')

    // Initialize database
    initDatabase(testDbPath)
    runMigrations()

    // Build app
    app = await buildApp()

    // Start server on random port
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const port = (app.server.address() as { port: number }).port
    serverUrl = `http://127.0.0.1:${port}`
    wsUrl = `ws://127.0.0.1:${port}/ws`
  })

  beforeEach(() => {
    // Reset client manager between tests
    resetClientManager()

    // Clear database tables
    const db = getDatabase()
    db.exec(`
      DELETE FROM agent_sessions;
      DELETE FROM messages;
      DELETE FROM agents;
      DELETE FROM worktrees;
      DELETE FROM workspaces;
      DELETE FROM usage_stats;
    `)
  })

  afterAll(async () => {
    cleanupWebSocket()
    await app.close()
    closeDatabase()

    try {
      rmSync(testDbDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('WebSocket connection', () => {
    it('should accept WebSocket connections', async () => {
      const ws = await createWebSocket()
      expect(ws.readyState).toBe(WebSocket.OPEN)
      ws.close()
    })

    it('should respond to ping with pong', async () => {
      const ws = await createWebSocket()

      ws.send(JSON.stringify({ type: 'ping' }))

      const response = (await receiveMessage(ws)) as { type: string; timestamp: string }
      expect(response.type).toBe('pong')
      expect(response.timestamp).toBeDefined()

      ws.close()
    })
  })

  describe('Agent subscriptions', () => {
    it('should confirm subscription to agent', async () => {
      const ws = await createWebSocket()

      ws.send(
        JSON.stringify({
          type: 'subscribe:agent',
          payload: { agentId: 'ag_test123abc' },
        })
      )

      const response = (await receiveMessage(ws)) as {
        type: string
        payload: { type: string; id: string }
      }
      expect(response.type).toBe('subscribed')
      expect(response.payload.type).toBe('agent')
      expect(response.payload.id).toBe('ag_test123abc')

      ws.close()
    })

    it('should confirm unsubscription from agent', async () => {
      const ws = await createWebSocket()

      // Subscribe first
      ws.send(
        JSON.stringify({
          type: 'subscribe:agent',
          payload: { agentId: 'ag_test123abc' },
        })
      )
      await receiveMessage(ws)

      // Unsubscribe
      ws.send(
        JSON.stringify({
          type: 'unsubscribe:agent',
          payload: { agentId: 'ag_test123abc' },
        })
      )

      const response = (await receiveMessage(ws)) as {
        type: string
        payload: { type: string; id: string }
      }
      expect(response.type).toBe('unsubscribed')

      ws.close()
    })

    it('should reject invalid agent ID', async () => {
      const ws = await createWebSocket()

      ws.send(
        JSON.stringify({
          type: 'subscribe:agent',
          payload: { agentId: 'invalid' },
        })
      )

      const response = (await receiveMessage(ws)) as {
        type: string
        payload: { code: string; message: string }
      }
      expect(response.type).toBe('error')
      expect(response.payload.code).toBe('INVALID_MESSAGE')

      ws.close()
    })
  })

  describe('Workspace subscriptions', () => {
    it('should confirm subscription to workspace', async () => {
      const ws = await createWebSocket()

      ws.send(
        JSON.stringify({
          type: 'subscribe:workspace',
          payload: { workspaceId: 'ws_test123abc' },
        })
      )

      const response = (await receiveMessage(ws)) as {
        type: string
        payload: { type: string; id: string }
      }
      expect(response.type).toBe('subscribed')
      expect(response.payload.type).toBe('workspace')
      expect(response.payload.id).toBe('ws_test123abc')

      ws.close()
    })

    it('should confirm unsubscription from workspace', async () => {
      const ws = await createWebSocket()

      // Subscribe first
      ws.send(
        JSON.stringify({
          type: 'subscribe:workspace',
          payload: { workspaceId: 'ws_test123abc' },
        })
      )
      await receiveMessage(ws)

      // Unsubscribe
      ws.send(
        JSON.stringify({
          type: 'unsubscribe:workspace',
          payload: { workspaceId: 'ws_test123abc' },
        })
      )

      const response = (await receiveMessage(ws)) as {
        type: string
        payload: { type: string; id: string }
      }
      expect(response.type).toBe('unsubscribed')

      ws.close()
    })
  })

  describe('Error handling', () => {
    it('should handle invalid JSON', async () => {
      const ws = await createWebSocket()

      ws.send('not valid json')

      const response = (await receiveMessage(ws)) as {
        type: string
        payload: { code: string }
      }
      expect(response.type).toBe('error')
      expect(response.payload.code).toBe('INVALID_JSON')

      ws.close()
    })

    it('should handle unknown message types', async () => {
      const ws = await createWebSocket()

      ws.send(JSON.stringify({ type: 'unknown:type' }))

      const response = (await receiveMessage(ws)) as {
        type: string
        payload: { code: string }
      }
      expect(response.type).toBe('error')

      ws.close()
    })

    it('should handle missing payload', async () => {
      const ws = await createWebSocket()

      ws.send(JSON.stringify({ type: 'subscribe:agent' }))

      const response = (await receiveMessage(ws)) as {
        type: string
        payload: { code: string }
      }
      expect(response.type).toBe('error')
      expect(response.payload.code).toBe('INVALID_MESSAGE')

      ws.close()
    })
  })

  describe('Multiple clients', () => {
    it('should handle multiple concurrent connections', async () => {
      const ws1 = await createWebSocket()
      const ws2 = await createWebSocket()

      // Both should be connected
      expect(ws1.readyState).toBe(WebSocket.OPEN)
      expect(ws2.readyState).toBe(WebSocket.OPEN)

      // Both should respond to ping
      ws1.send(JSON.stringify({ type: 'ping' }))
      ws2.send(JSON.stringify({ type: 'ping' }))

      const [response1, response2] = await Promise.all([receiveMessage(ws1), receiveMessage(ws2)])

      expect((response1 as { type: string }).type).toBe('pong')
      expect((response2 as { type: string }).type).toBe('pong')

      ws1.close()
      ws2.close()
    })
  })
})
