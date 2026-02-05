import type { FastifyInstance } from 'fastify'
import { healthRoutes } from './health.js'
import { workspaceRoutes } from './workspace.routes.js'
import { worktreeRoutes } from './worktree.routes.js'
import { agentRoutes } from './agent.routes.js'
import { usageRoutes } from './usage.routes.js'
import { metricsRoutes } from './metrics.routes.js'
import { errorsRoutes } from './errors.routes.js'
import { docsRoutes } from './docs.routes.js'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes)
  await app.register(workspaceRoutes)
  await app.register(worktreeRoutes)
  await app.register(agentRoutes)
  await app.register(usageRoutes)
  await app.register(metricsRoutes)
  await app.register(errorsRoutes)
  await app.register(docsRoutes)
}
