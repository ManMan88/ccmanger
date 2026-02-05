import { buildApp } from './app.js'
import { config } from './config/index.js'
import { initDatabase, closeDatabase } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { logger } from './utils/logger.js'
import { getProcessManager, resetProcessManager } from './services/process.service.js'
import { AgentRepository } from './db/repositories/agent.repository.js'
import { cleanupWebSocket } from './websocket/index.js'

async function main() {
  // Initialize database and run migrations
  const db = initDatabase()
  runMigrations(db)

  // Clean up orphaned processes from previous runs
  // (agents marked as running/waiting but the process is gone)
  const agentRepo = new AgentRepository(db)
  const orphanedCount = agentRepo.clearPidForRunningAgents()
  if (orphanedCount > 0) {
    logger.info({ count: orphanedCount }, 'Cleared orphaned agent processes from previous run')
  }

  // Build and start the server
  const app = await buildApp()

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received')

    try {
      // Clean up WebSocket connections first
      cleanupWebSocket()

      // Stop all running agent processes
      const processManager = getProcessManager()
      const runningCount = processManager.getRunningCount()
      if (runningCount > 0) {
        logger.info({ count: runningCount }, 'Stopping running agent processes')
        await processManager.stopAllAgents()
      }

      // Cleanup process manager
      resetProcessManager()

      await app.close()
      logger.info('Server closed')

      closeDatabase()
      logger.info('Database connection closed')

      process.exit(0)
    } catch (error) {
      logger.error({ error }, 'Error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception')
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection')
    process.exit(1)
  })

  try {
    await app.listen({ host: config.host, port: config.port })
    logger.info(
      { host: config.host, port: config.port },
      `Server listening at http://${config.host}:${config.port}`
    )
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server')
    process.exit(1)
  }
}

main()
