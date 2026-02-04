import { buildApp } from './app.js'
import { config } from './config/index.js'
import { initDatabase, closeDatabase } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { logger } from './utils/logger.js'

async function main() {
  // Initialize database and run migrations
  const db = initDatabase()
  runMigrations(db)

  // Build and start the server
  const app = await buildApp()

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received')

    try {
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
