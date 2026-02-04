import type { FastifyInstance } from 'fastify'
import { getDatabase } from '../db/index.js'

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string
  version: string
  checks: {
    database: boolean
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_request, reply) => {
    let databaseOk = false

    try {
      const db = getDatabase()
      db.prepare('SELECT 1').get()
      databaseOk = true
    } catch {
      // Database check failed
    }

    const status = databaseOk ? 'ok' : 'degraded'

    const response: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: '0.0.1',
      checks: {
        database: databaseOk,
      },
    }

    reply.status(status === 'ok' ? 200 : 503).send(response)
  })

  // Simple liveness probe
  app.get('/api/health/live', async (_request, reply) => {
    reply.status(200).send({ status: 'ok' })
  })

  // Readiness probe (checks dependencies)
  app.get('/api/health/ready', async (_request, reply) => {
    try {
      const db = getDatabase()
      db.prepare('SELECT 1').get()
      reply.status(200).send({ status: 'ready' })
    } catch {
      reply.status(503).send({ status: 'not ready' })
    }
  })
}
