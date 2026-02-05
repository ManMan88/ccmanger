/**
 * Error Tracking Service
 *
 * Provides error tracking and reporting capabilities.
 * Can integrate with external services like Sentry, or use local logging.
 *
 * Configuration via environment variables:
 * - ERROR_TRACKING_ENABLED: Enable/disable error tracking (default: true)
 * - ERROR_TRACKING_DSN: Sentry DSN or other service endpoint (optional)
 * - ERROR_TRACKING_ENVIRONMENT: Environment name (default: NODE_ENV)
 * - ERROR_TRACKING_RELEASE: Release/version identifier (optional)
 */

import { logger } from '../utils/logger.js'
import { config } from '../config/index.js'

export interface ErrorContext {
  userId?: string
  agentId?: string
  workspaceId?: string
  worktreeId?: string
  requestId?: string
  operation?: string
  extra?: Record<string, unknown>
}

export interface ErrorReport {
  id: string
  timestamp: string
  error: {
    name: string
    message: string
    stack?: string
  }
  context: ErrorContext
  environment: string
  release?: string
  tags: Record<string, string>
}

// In-memory error store (for local tracking when no external service is configured)
const MAX_STORED_ERRORS = 100
const errorStore: ErrorReport[] = []

// Configuration
const errorTrackingConfig = {
  enabled: process.env.ERROR_TRACKING_ENABLED !== 'false',
  dsn: process.env.ERROR_TRACKING_DSN || null,
  environment:
    process.env.ERROR_TRACKING_ENVIRONMENT ||
    (config.isProduction ? 'production' : config.isTest ? 'test' : 'development'),
  release: process.env.ERROR_TRACKING_RELEASE || process.env.npm_package_version,
}

// Sentry-like client (placeholder for actual Sentry integration)
let sentryClient: { captureException: (err: Error, ctx?: unknown) => string } | null = null

/**
 * Initialize error tracking service
 *
 * If a DSN is provided, attempts to initialize Sentry.
 * Otherwise, uses local error storage.
 */
export async function initializeErrorTracking(): Promise<void> {
  if (!errorTrackingConfig.enabled) {
    logger.info('Error tracking is disabled')
    return
  }

  if (errorTrackingConfig.dsn) {
    try {
      // Dynamic import of Sentry (optional dependency)
      // Use Function constructor to avoid TypeScript resolving the module at compile time
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string
      ) => Promise<unknown>
      const SentryModule = await dynamicImport('@sentry/node').catch((): null => null)

      // Type guard for Sentry module
      const isSentryModule = (
        mod: unknown
      ): mod is {
        init: (config: Record<string, unknown>) => void
        captureException: (err: Error, ctx?: Record<string, unknown>) => string
      } => {
        return (
          mod !== null &&
          typeof mod === 'object' &&
          'init' in mod &&
          typeof (mod as Record<string, unknown>).init === 'function'
        )
      }

      if (isSentryModule(SentryModule)) {
        SentryModule.init({
          dsn: errorTrackingConfig.dsn,
          environment: errorTrackingConfig.environment,
          release: errorTrackingConfig.release,
          tracesSampleRate: 0.1,
        })

        sentryClient = {
          captureException: (err: Error, ctx?: unknown) => {
            return SentryModule.captureException(err, ctx as Record<string, unknown>)
          },
        }

        logger.info(
          { dsn: errorTrackingConfig.dsn.replace(/[^@]+@/, '***@') },
          'Sentry error tracking initialized'
        )
      } else {
        logger.warn(
          'Sentry DSN provided but @sentry/node is not installed. Using local error tracking.'
        )
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize Sentry. Using local error tracking.')
    }
  } else {
    logger.info('Using local error tracking (no DSN configured)')
  }
}

/**
 * Generate a unique error ID
 */
function generateErrorId(): string {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Capture and track an error
 */
export function captureError(error: Error, context: ErrorContext = {}): string {
  if (!errorTrackingConfig.enabled) {
    return ''
  }

  const errorId = generateErrorId()

  // Create error report
  const report: ErrorReport = {
    id: errorId,
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
    environment: errorTrackingConfig.environment,
    release: errorTrackingConfig.release,
    tags: {
      errorType: error.name,
      ...(context.operation && { operation: context.operation }),
      ...(context.agentId && { agentId: context.agentId }),
    },
  }

  // Log the error
  logger.error(
    {
      errorId,
      error: error.message,
      stack: error.stack,
      ...context,
    },
    'Error captured'
  )

  // Send to Sentry if available
  if (sentryClient) {
    try {
      sentryClient.captureException(error, {
        extra: context,
        tags: report.tags,
      })
    } catch (sentryErr) {
      logger.warn({ err: sentryErr }, 'Failed to send error to Sentry')
    }
  }

  // Store locally
  errorStore.unshift(report)
  if (errorStore.length > MAX_STORED_ERRORS) {
    errorStore.pop()
  }

  return errorId
}

/**
 * Capture a message (non-error event)
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context: ErrorContext = {}
): string {
  if (!errorTrackingConfig.enabled) {
    return ''
  }

  const errorId = generateErrorId()

  const report: ErrorReport = {
    id: errorId,
    timestamp: new Date().toISOString(),
    error: {
      name: 'Message',
      message,
    },
    context,
    environment: errorTrackingConfig.environment,
    release: errorTrackingConfig.release,
    tags: {
      level,
      ...(context.operation && { operation: context.operation }),
    },
  }

  // Log based on level
  const logFn = level === 'error' ? logger.error : level === 'warning' ? logger.warn : logger.info
  logFn.call(logger, { errorId, ...context }, message)

  // Store locally
  errorStore.unshift(report)
  if (errorStore.length > MAX_STORED_ERRORS) {
    errorStore.pop()
  }

  return errorId
}

/**
 * Set user context for error tracking
 */
export function setUserContext(userId: string): void {
  if (sentryClient) {
    // Sentry.setUser would be called here
    logger.debug({ userId }, 'User context set for error tracking')
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
): void {
  if (sentryClient) {
    // Sentry.addBreadcrumb would be called here
  }
  logger.debug({ category, data }, `Breadcrumb: ${message}`)
}

/**
 * Get recent errors (local tracking)
 */
export function getRecentErrors(limit: number = 20): ErrorReport[] {
  return errorStore.slice(0, limit)
}

/**
 * Get error by ID
 */
export function getErrorById(errorId: string): ErrorReport | undefined {
  return errorStore.find((e) => e.id === errorId)
}

/**
 * Get error statistics
 */
export function getErrorStats(): {
  totalErrors: number
  errorsByType: Record<string, number>
  recentErrorCount: number
  oldestError?: string
  newestError?: string
} {
  const errorsByType: Record<string, number> = {}

  for (const report of errorStore) {
    const type = report.error.name
    errorsByType[type] = (errorsByType[type] || 0) + 1
  }

  // Count errors in last hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  const recentErrorCount = errorStore.filter(
    (e) => new Date(e.timestamp).getTime() > oneHourAgo
  ).length

  return {
    totalErrors: errorStore.length,
    errorsByType,
    recentErrorCount,
    oldestError: errorStore.length > 0 ? errorStore[errorStore.length - 1].timestamp : undefined,
    newestError: errorStore.length > 0 ? errorStore[0].timestamp : undefined,
  }
}

/**
 * Clear error store (for testing)
 */
export function clearErrors(): void {
  errorStore.length = 0
}

/**
 * Flush pending errors to external service
 */
export async function flushErrors(): Promise<void> {
  if (sentryClient) {
    // Sentry.flush() would be called here
    logger.debug('Flushing errors to Sentry')
  }
}
