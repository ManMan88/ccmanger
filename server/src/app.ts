import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config/index.js'
import { logger } from './utils/logger.js'
import { errorHandler } from './middleware/error-handler.js'
import { registerRoutes } from './routes/index.js'
import { registerWebSocketHandler } from './websocket/index.js'
import { recordRequest } from './services/metrics.service.js'

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own logger
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  })

  // Register CORS
  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  })

  // Register WebSocket handler
  await registerWebSocketHandler(app)

  // Request logging
  app.addHook('onRequest', async (request) => {
    logger.debug(
      {
        method: request.method,
        url: request.url,
        requestId: request.id,
      },
      'Incoming request'
    )
  })

  app.addHook('onResponse', async (request, reply) => {
    // Record metrics (skip WebSocket upgrade requests and metrics endpoint itself)
    if (!request.url.includes('/ws') && !request.url.includes('/api/metrics')) {
      recordRequest(request.method, request.url, reply.statusCode, reply.elapsedTime)
    }

    logger.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
        requestId: request.id,
      },
      'Request completed'
    )
  })

  // Error handler
  app.setErrorHandler(errorHandler)

  // Register routes
  await registerRoutes(app)

  return app
}
