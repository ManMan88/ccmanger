import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import websocket from '@fastify/websocket'
import { logger } from '../utils/logger.js'
import { getProcessManager } from '../services/process.service.js'
import { getClientManager, resetClientManager } from './client-manager.js'
import { MessageHandler } from './message-handler.js'
import { EventBroadcaster } from './event-broadcaster.js'
import { HeartbeatManager } from './heartbeat-manager.js'

let eventBroadcaster: EventBroadcaster | null = null
let heartbeatManager: HeartbeatManager | null = null

export async function registerWebSocketHandler(app: FastifyInstance): Promise<void> {
  // Register the WebSocket plugin
  await app.register(websocket, {
    options: {
      // Maximum message size (1MB)
      maxPayload: 1024 * 1024,
    },
  })

  const clientManager = getClientManager()
  const messageHandler = new MessageHandler(clientManager)

  // Set up event broadcaster
  const processManager = getProcessManager()
  eventBroadcaster = new EventBroadcaster(processManager, clientManager)
  eventBroadcaster.start()

  // Set up heartbeat manager
  heartbeatManager = new HeartbeatManager(clientManager)
  heartbeatManager.start()

  // Register WebSocket route
  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    // Add client to manager
    const client = clientManager.addClient(socket)

    logger.info({ clientId: client.id }, 'New WebSocket connection established')

    // Handle incoming messages
    socket.on('message', (data: Buffer | string) => {
      try {
        const message = typeof data === 'string' ? data : data.toString('utf-8')
        messageHandler.handleMessage(socket, message)
      } catch (error) {
        logger.error({ clientId: client.id, error }, 'Error handling WebSocket message')
      }
    })

    // Handle connection close
    socket.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString('utf-8')
      logger.info({ clientId: client.id, code, reason: reasonStr }, 'WebSocket connection closed')
      clientManager.removeClient(socket)
    })

    // Handle errors
    socket.on('error', (error: Error) => {
      logger.error({ clientId: client.id, error }, 'WebSocket error')
      clientManager.removeClient(socket)
    })
  })

  logger.info('WebSocket handler registered at /ws')
}

// Get the event broadcaster for external use (e.g., workspace updates)
export function getEventBroadcaster(): EventBroadcaster | null {
  return eventBroadcaster
}

// Cleanup function for graceful shutdown
export function cleanupWebSocket(): void {
  if (heartbeatManager) {
    heartbeatManager.stop()
    heartbeatManager = null
  }

  if (eventBroadcaster) {
    eventBroadcaster.stop()
    eventBroadcaster = null
  }

  resetClientManager()
  logger.info('WebSocket resources cleaned up')
}
