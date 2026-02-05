import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getDatabase } from '../db/index.js'
import { UsageStatsRepository } from '../db/repositories/usage-stats.repository.js'
import { UsageService } from '../services/usage.service.js'
import { UsageQuerySchema } from '../validation/schemas.js'
import { usageStatsRowToApi } from '@claude-manager/shared'

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  const db = getDatabase()
  const usageStatsRepo = new UsageStatsRepository(db)
  const usageService = new UsageService(usageStatsRepo)

  // GET /api/usage - Get current usage statistics
  app.get('/api/usage', async (_request: FastifyRequest, reply: FastifyReply) => {
    const usage = usageService.getCurrentUsage()

    return reply.code(200).send(usage)
  })

  // GET /api/usage/history - Get usage history
  app.get(
    '/api/usage/history',
    async (
      request: FastifyRequest<{
        Querystring: { period?: string; start?: string; end?: string; limit?: string }
      }>,
      reply: FastifyReply
    ) => {
      const query = UsageQuerySchema.parse(request.query)

      const history = usageService.getHistory({
        period: query.period,
        start: query.start,
        end: query.end,
      })

      return reply.code(200).send({
        history: history.map((row) => ({
          date: row.date,
          tokensUsed: row.total_tokens,
          requestCount: row.request_count,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          errorCount: row.error_count,
        })),
      })
    }
  )

  // GET /api/usage/today - Get today's detailed stats
  app.get('/api/usage/today', async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = usageService.getTodayStats()

    if (!stats) {
      return reply.code(200).send({
        date: new Date().toISOString().split('T')[0],
        tokensUsed: 0,
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        errorCount: 0,
        modelUsage: null,
      })
    }

    return reply.code(200).send(usageStatsRowToApi(stats))
  })

  // GET /api/usage/limits - Get current usage limits
  app.get('/api/usage/limits', async (_request: FastifyRequest, reply: FastifyReply) => {
    const limits = usageService.getLimits()
    return reply.code(200).send(limits)
  })
}
