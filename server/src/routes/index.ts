import type { FastifyInstance } from 'fastify'
import { healthRoutes } from './health.js'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes)

  // Future route registrations will go here:
  // await app.register(workspaceRoutes)
  // await app.register(worktreeRoutes)
  // await app.register(agentRoutes)
  // await app.register(usageRoutes)
}
