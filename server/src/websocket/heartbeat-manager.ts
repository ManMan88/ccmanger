import { logger } from '../utils/logger.js'
import type { ClientManager } from './client-manager.js'

const HEARTBEAT_INTERVAL = 30000 // 30 seconds
const STALE_THRESHOLD = 90000 // 90 seconds (3 missed heartbeats)

export class HeartbeatManager {
  private intervalId: NodeJS.Timeout | null = null

  constructor(
    private clientManager: ClientManager,
    private interval: number = HEARTBEAT_INTERVAL,
    private staleThreshold: number = STALE_THRESHOLD
  ) {}

  start(): void {
    if (this.intervalId) {
      return // Already running
    }

    this.intervalId = setInterval(() => {
      this.checkStaleClients()
    }, this.interval)

    logger.info(
      { interval: this.interval, staleThreshold: this.staleThreshold },
      'WebSocket heartbeat manager started'
    )
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      logger.info('WebSocket heartbeat manager stopped')
    }
  }

  private checkStaleClients(): void {
    const staleClients = this.clientManager.getStaleClients(this.staleThreshold)

    for (const client of staleClients) {
      logger.warn(
        {
          clientId: client.id,
          lastPing: new Date(client.lastPing).toISOString(),
          subscribedAgents: Array.from(client.subscribedAgents),
        },
        'Disconnecting stale WebSocket client'
      )

      try {
        // Close the connection with a going away status
        client.socket.close(1001, 'Connection timed out')
      } catch {
        // Ignore errors during close
      }

      // The socket close event will trigger cleanup in the handler
    }

    if (staleClients.length > 0) {
      logger.info({ count: staleClients.length }, 'Disconnected stale WebSocket clients')
    }
  }
}
