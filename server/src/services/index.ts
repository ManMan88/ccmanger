export { WorkspaceService, type WorkspaceWithDetails } from './workspace.service.js'
export {
  WorktreeService,
  type WorktreeWithAgents,
  type CreateWorktreeOptions,
} from './worktree.service.js'
export { AgentService, type CreateAgentOptions, type UpdateAgentOptions } from './agent.service.js'
export { GitService, GitError, type WorktreeInfo, type BranchInfo } from './git.service.js'
export {
  ProcessManager,
  getProcessManager,
  resetProcessManager,
  type AgentProcess,
  type SpawnAgentOptions,
  type ProcessManagerEvents,
} from './process.service.js'
export {
  UsageService,
  type UsageLimits,
  type CurrentUsage,
  type UsageHistoryQuery,
} from './usage.service.js'
export {
  getMetrics,
  recordRequest,
  recordWebSocketConnection,
  recordAgentSpawn,
  recordAgentTermination,
  recordMessageProcessed,
  setRunningAgentCount,
  updateWebSocketSubscriptions,
  resetMetrics,
  type ApplicationMetrics,
  type RequestMetrics,
  type ConnectionMetrics,
  type ProcessMetrics,
  type SystemMetrics,
} from './metrics.service.js'
export {
  initializeErrorTracking,
  captureError,
  captureMessage,
  setUserContext,
  addBreadcrumb,
  getRecentErrors,
  getErrorById,
  getErrorStats,
  clearErrors,
  flushErrors,
  type ErrorContext,
  type ErrorReport,
} from './error-tracking.service.js'
