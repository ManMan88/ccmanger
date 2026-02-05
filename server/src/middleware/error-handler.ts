import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { AppError, isAppError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { captureError } from '../services/error-tracking.service.js'

interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, string[]>
  }
}

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {}
    for (const issue of error.issues) {
      const path = issue.path.join('.')
      if (!details[path]) {
        details[path] = []
      }
      details[path].push(issue.message)
    }

    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
      },
    }

    reply.status(400).send(response)
    return
  }

  // Handle custom AppError
  if (isAppError(error)) {
    const response: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
      },
    }

    if (error instanceof AppError && 'details' in error) {
      response.error.details = (error as AppError & { details?: Record<string, string[]> }).details
    }

    if (!error.isOperational) {
      logger.error({ error, requestId: request.id }, 'Non-operational error')
    }

    reply.status(error.statusCode).send(response)
    return
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
      },
    }

    reply.status(400).send(response)
    return
  }

  // Unknown errors - capture for error tracking
  const errorId = captureError(error instanceof Error ? error : new Error(String(error)), {
    requestId: request.id,
    operation: `${request.method} ${request.url}`,
    extra: {
      headers: request.headers,
      query: request.query,
    },
  })

  logger.error({ error, requestId: request.id, errorId }, 'Unhandled error')

  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  }

  reply.status(500).send(response)
}
