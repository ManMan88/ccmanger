import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  getRecentErrors,
  getErrorById,
  getErrorStats,
  type ErrorReport,
} from '../services/error-tracking.service.js'

/**
 * Error Tracking Routes
 *
 * GET /api/errors - Get recent errors
 * GET /api/errors/stats - Get error statistics
 * GET /api/errors/:id - Get specific error by ID
 */
export async function errorsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/errors
   * Returns recent tracked errors
   */
  app.get<{
    Querystring: { limit?: string }
    Reply: ErrorReport[]
  }>(
    '/api/errors',
    async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
      const limit = Math.min(parseInt(request.query.limit || '20', 10), 100)
      const errors = getRecentErrors(limit)
      return reply.send(errors)
    }
  )

  /**
   * GET /api/errors/stats
   * Returns error statistics
   */
  app.get('/api/errors/stats', async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = getErrorStats()
    return reply.send(stats)
  })

  /**
   * GET /api/errors/:id
   * Returns a specific error by ID
   */
  app.get<{
    Params: { id: string }
    Reply: ErrorReport | { error: string }
  }>(
    '/api/errors/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const error = getErrorById(request.params.id)

      if (!error) {
        return reply.status(404).send({ error: 'Error not found' })
      }

      return reply.send(error)
    }
  )
}
