import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getMetrics, type ApplicationMetrics } from '../services/metrics.service.js'

/**
 * Metrics Routes
 *
 * GET /api/metrics - Get application metrics
 * GET /api/metrics/prometheus - Get metrics in Prometheus format (optional)
 */
export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/metrics
   * Returns application metrics in JSON format
   */
  app.get<{
    Reply: ApplicationMetrics
  }>('/api/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = getMetrics()
    return reply.send(metrics)
  })

  /**
   * GET /api/metrics/prometheus
   * Returns metrics in Prometheus exposition format
   */
  app.get('/api/metrics/prometheus', async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = getMetrics()

    const lines: string[] = [
      '# HELP claude_manager_requests_total Total number of HTTP requests',
      '# TYPE claude_manager_requests_total counter',
      `claude_manager_requests_total ${metrics.requests.totalRequests}`,
      '',
      '# HELP claude_manager_requests_by_method HTTP requests by method',
      '# TYPE claude_manager_requests_by_method counter',
      ...Object.entries(metrics.requests.requestsByMethod).map(
        ([method, count]) => `claude_manager_requests_by_method{method="${method}"} ${count}`
      ),
      '',
      '# HELP claude_manager_requests_by_status HTTP requests by status code category',
      '# TYPE claude_manager_requests_by_status counter',
      ...Object.entries(metrics.requests.requestsByStatus).map(
        ([status, count]) => `claude_manager_requests_by_status{status="${status}"} ${count}`
      ),
      '',
      '# HELP claude_manager_response_time_seconds Response time statistics',
      '# TYPE claude_manager_response_time_seconds summary',
      `claude_manager_response_time_seconds{quantile="0.5"} ${metrics.requests.responseTimePercentiles.p50 / 1000}`,
      `claude_manager_response_time_seconds{quantile="0.9"} ${metrics.requests.responseTimePercentiles.p90 / 1000}`,
      `claude_manager_response_time_seconds{quantile="0.95"} ${metrics.requests.responseTimePercentiles.p95 / 1000}`,
      `claude_manager_response_time_seconds{quantile="0.99"} ${metrics.requests.responseTimePercentiles.p99 / 1000}`,
      `claude_manager_response_time_seconds_sum ${(metrics.requests.averageResponseTime * metrics.requests.totalRequests) / 1000}`,
      `claude_manager_response_time_seconds_count ${metrics.requests.totalRequests}`,
      '',
      '# HELP claude_manager_websocket_connections_active Active WebSocket connections',
      '# TYPE claude_manager_websocket_connections_active gauge',
      `claude_manager_websocket_connections_active ${metrics.connections.activeWebSocketConnections}`,
      '',
      '# HELP claude_manager_websocket_connections_total Total WebSocket connections',
      '# TYPE claude_manager_websocket_connections_total counter',
      `claude_manager_websocket_connections_total ${metrics.connections.totalWebSocketConnections}`,
      '',
      '# HELP claude_manager_agents_running Currently running agents',
      '# TYPE claude_manager_agents_running gauge',
      `claude_manager_agents_running ${metrics.processes.runningAgents}`,
      '',
      '# HELP claude_manager_agents_spawned_total Total agents spawned',
      '# TYPE claude_manager_agents_spawned_total counter',
      `claude_manager_agents_spawned_total ${metrics.processes.totalAgentsSpawned}`,
      '',
      '# HELP claude_manager_agents_crashed_total Total agents crashed',
      '# TYPE claude_manager_agents_crashed_total counter',
      `claude_manager_agents_crashed_total ${metrics.processes.totalAgentsCrashed}`,
      '',
      '# HELP claude_manager_messages_processed_total Total messages processed',
      '# TYPE claude_manager_messages_processed_total counter',
      `claude_manager_messages_processed_total ${metrics.processes.totalMessagesProcessed}`,
      '',
      '# HELP claude_manager_uptime_seconds Application uptime in seconds',
      '# TYPE claude_manager_uptime_seconds gauge',
      `claude_manager_uptime_seconds ${metrics.system.uptimeSeconds}`,
      '',
      '# HELP claude_manager_memory_bytes Memory usage in bytes',
      '# TYPE claude_manager_memory_bytes gauge',
      `claude_manager_memory_bytes{type="heap_used"} ${metrics.system.memoryUsage.heapUsed}`,
      `claude_manager_memory_bytes{type="heap_total"} ${metrics.system.memoryUsage.heapTotal}`,
      `claude_manager_memory_bytes{type="external"} ${metrics.system.memoryUsage.external}`,
      `claude_manager_memory_bytes{type="rss"} ${metrics.system.memoryUsage.rss}`,
      '',
    ]

    return reply.header('Content-Type', 'text/plain; charset=utf-8').send(lines.join('\n'))
  })
}
