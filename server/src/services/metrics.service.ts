/**
 * Metrics Service
 *
 * Collects and exposes application metrics including:
 * - Request counts and response times
 * - Active connections (HTTP, WebSocket)
 * - Process/agent statistics
 * - Memory and uptime information
 */

export interface RequestMetrics {
  totalRequests: number
  requestsByMethod: Record<string, number>
  requestsByRoute: Record<string, number>
  requestsByStatus: Record<string, number>
  averageResponseTime: number
  maxResponseTime: number
  minResponseTime: number
  responseTimePercentiles: {
    p50: number
    p90: number
    p95: number
    p99: number
  }
}

export interface ConnectionMetrics {
  activeHttpConnections: number
  activeWebSocketConnections: number
  totalWebSocketConnections: number
  webSocketSubscriptions: number
}

export interface ProcessMetrics {
  runningAgents: number
  totalAgentsSpawned: number
  totalAgentsCrashed: number
  totalMessagesProcessed: number
}

export interface SystemMetrics {
  uptimeSeconds: number
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
  }
  nodeVersion: string
  platform: string
}

export interface ApplicationMetrics {
  timestamp: string
  requests: RequestMetrics
  connections: ConnectionMetrics
  processes: ProcessMetrics
  system: SystemMetrics
}

// Response time samples for percentile calculations
const MAX_SAMPLES = 10000
const responseTimes: number[] = []

// Counters
let totalRequests = 0
const requestsByMethod: Record<string, number> = {}
const requestsByRoute: Record<string, number> = {}
const requestsByStatus: Record<string, number> = {}
let totalResponseTime = 0
let maxResponseTime = 0
let minResponseTime = Infinity

// Connection counters
let activeHttpConnections = 0
let activeWebSocketConnections = 0
let totalWebSocketConnections = 0
let webSocketSubscriptions = 0

// Process counters
let runningAgents = 0
let totalAgentsSpawned = 0
let totalAgentsCrashed = 0
let totalMessagesProcessed = 0

// Start time for uptime calculation
const startTime = Date.now()

/**
 * Record an HTTP request
 */
export function recordRequest(
  method: string,
  route: string,
  statusCode: number,
  responseTimeMs: number
): void {
  totalRequests++

  // By method
  requestsByMethod[method] = (requestsByMethod[method] || 0) + 1

  // By route (normalize to pattern)
  const normalizedRoute = normalizeRoute(route)
  requestsByRoute[normalizedRoute] = (requestsByRoute[normalizedRoute] || 0) + 1

  // By status code category
  const statusCategory = `${Math.floor(statusCode / 100)}xx`
  requestsByStatus[statusCategory] = (requestsByStatus[statusCategory] || 0) + 1

  // Response time tracking
  totalResponseTime += responseTimeMs
  maxResponseTime = Math.max(maxResponseTime, responseTimeMs)
  minResponseTime = Math.min(minResponseTime, responseTimeMs)

  // Store sample for percentiles (circular buffer)
  if (responseTimes.length >= MAX_SAMPLES) {
    responseTimes.shift()
  }
  responseTimes.push(responseTimeMs)
}

/**
 * Normalize route paths (replace IDs with :id)
 */
function normalizeRoute(route: string): string {
  return route
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id') // UUIDs
    .replace(/\/\d+/g, '/:id') // Numeric IDs
    .replace(/\?.*$/, '') // Remove query strings
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0
  const index = Math.ceil((p / 100) * sortedArray.length) - 1
  return sortedArray[Math.max(0, index)]
}

/**
 * Record HTTP connection change
 */
export function recordHttpConnection(delta: number): void {
  activeHttpConnections = Math.max(0, activeHttpConnections + delta)
}

/**
 * Record WebSocket connection
 */
export function recordWebSocketConnection(connected: boolean): void {
  if (connected) {
    activeWebSocketConnections++
    totalWebSocketConnections++
  } else {
    activeWebSocketConnections = Math.max(0, activeWebSocketConnections - 1)
  }
}

/**
 * Update WebSocket subscription count
 */
export function updateWebSocketSubscriptions(count: number): void {
  webSocketSubscriptions = count
}

/**
 * Record agent spawn
 */
export function recordAgentSpawn(): void {
  runningAgents++
  totalAgentsSpawned++
}

/**
 * Record agent termination
 */
export function recordAgentTermination(crashed: boolean = false): void {
  runningAgents = Math.max(0, runningAgents - 1)
  if (crashed) {
    totalAgentsCrashed++
  }
}

/**
 * Record message processed
 */
export function recordMessageProcessed(): void {
  totalMessagesProcessed++
}

/**
 * Update running agent count (for sync)
 */
export function setRunningAgentCount(count: number): void {
  runningAgents = count
}

/**
 * Get all metrics
 */
export function getMetrics(): ApplicationMetrics {
  const sortedTimes = [...responseTimes].sort((a, b) => a - b)

  return {
    timestamp: new Date().toISOString(),
    requests: {
      totalRequests,
      requestsByMethod: { ...requestsByMethod },
      requestsByRoute: { ...requestsByRoute },
      requestsByStatus: { ...requestsByStatus },
      averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      maxResponseTime: maxResponseTime === 0 ? 0 : maxResponseTime,
      minResponseTime: minResponseTime === Infinity ? 0 : minResponseTime,
      responseTimePercentiles: {
        p50: percentile(sortedTimes, 50),
        p90: percentile(sortedTimes, 90),
        p95: percentile(sortedTimes, 95),
        p99: percentile(sortedTimes, 99),
      },
    },
    connections: {
      activeHttpConnections,
      activeWebSocketConnections,
      totalWebSocketConnections,
      webSocketSubscriptions,
    },
    processes: {
      runningAgents,
      totalAgentsSpawned,
      totalAgentsCrashed,
      totalMessagesProcessed,
    },
    system: {
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      memoryUsage: {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
        rss: process.memoryUsage().rss,
      },
      nodeVersion: process.version,
      platform: process.platform,
    },
  }
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  totalRequests = 0
  Object.keys(requestsByMethod).forEach((key) => delete requestsByMethod[key])
  Object.keys(requestsByRoute).forEach((key) => delete requestsByRoute[key])
  Object.keys(requestsByStatus).forEach((key) => delete requestsByStatus[key])
  totalResponseTime = 0
  maxResponseTime = 0
  minResponseTime = Infinity
  responseTimes.length = 0

  activeHttpConnections = 0
  activeWebSocketConnections = 0
  totalWebSocketConnections = 0
  webSocketSubscriptions = 0

  runningAgents = 0
  totalAgentsSpawned = 0
  totalAgentsCrashed = 0
  totalMessagesProcessed = 0
}
