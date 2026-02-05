import { logger } from '../utils/logger.js'
import type { ProcessManager, ProcessManagerEvents } from '../services/process.service.js'
import type { ClientManager } from './client-manager.js'
import type {
  AgentOutputMessage,
  AgentStatusMessage,
  AgentContextMessage,
  AgentErrorMessage,
  AgentTerminatedMessage,
  WorkspaceUpdatedMessage,
  UsageUpdatedMessage,
} from './types.js'
import type { AgentStatus } from '@claude-manager/shared'

export class EventBroadcaster {
  private previousStatuses: Map<string, AgentStatus> = new Map()
  private boundHandlers: {
    output: ProcessManagerEvents['agent:output']
    status: ProcessManagerEvents['agent:status']
    context: ProcessManagerEvents['agent:context']
    error: ProcessManagerEvents['agent:error']
    exit: ProcessManagerEvents['agent:exit']
    waiting: ProcessManagerEvents['agent:waiting']
  }

  constructor(
    private processManager: ProcessManager,
    private clientManager: ClientManager
  ) {
    // Bind handlers so we can remove them later
    this.boundHandlers = {
      output: this.handleAgentOutput.bind(this),
      status: this.handleAgentStatus.bind(this),
      context: this.handleAgentContext.bind(this),
      error: this.handleAgentError.bind(this),
      exit: this.handleAgentExit.bind(this),
      waiting: this.handleAgentWaiting.bind(this),
    }
  }

  start(): void {
    this.processManager.on('agent:output', this.boundHandlers.output)
    this.processManager.on('agent:status', this.boundHandlers.status)
    this.processManager.on('agent:context', this.boundHandlers.context)
    this.processManager.on('agent:error', this.boundHandlers.error)
    this.processManager.on('agent:exit', this.boundHandlers.exit)
    this.processManager.on('agent:waiting', this.boundHandlers.waiting)

    logger.info('WebSocket event broadcaster started')
  }

  stop(): void {
    this.processManager.off('agent:output', this.boundHandlers.output)
    this.processManager.off('agent:status', this.boundHandlers.status)
    this.processManager.off('agent:context', this.boundHandlers.context)
    this.processManager.off('agent:error', this.boundHandlers.error)
    this.processManager.off('agent:exit', this.boundHandlers.exit)
    this.processManager.off('agent:waiting', this.boundHandlers.waiting)

    this.previousStatuses.clear()
    logger.info('WebSocket event broadcaster stopped')
  }

  private handleAgentOutput(agentId: string, data: string, isStreaming: boolean): void {
    const message: AgentOutputMessage = {
      type: 'agent:output',
      payload: {
        agentId,
        content: data,
        role: 'assistant',
        isStreaming,
      },
      timestamp: new Date().toISOString(),
    }

    const sent = this.clientManager.broadcastToAgentSubscribers(agentId, message)
    logger.debug(
      { agentId, contentLength: data.length, isStreaming, sent },
      'Broadcast agent output'
    )
  }

  private handleAgentStatus(agentId: string, status: AgentStatus): void {
    const previousStatus = this.previousStatuses.get(agentId) || 'finished'
    this.previousStatuses.set(agentId, status)

    // Don't broadcast if status hasn't changed
    if (previousStatus === status) return

    const message: AgentStatusMessage = {
      type: 'agent:status',
      payload: {
        agentId,
        previousStatus,
        status,
        reason: this.getStatusReason(status),
      },
      timestamp: new Date().toISOString(),
    }

    const sent = this.clientManager.broadcastToAgentSubscribers(agentId, message)
    logger.debug({ agentId, previousStatus, status, sent }, 'Broadcast agent status change')
  }

  private handleAgentContext(agentId: string, level: number): void {
    const message: AgentContextMessage = {
      type: 'agent:context',
      payload: {
        agentId,
        contextLevel: level,
      },
      timestamp: new Date().toISOString(),
    }

    const sent = this.clientManager.broadcastToAgentSubscribers(agentId, message)
    logger.debug({ agentId, level, sent }, 'Broadcast agent context update')
  }

  private handleAgentError(agentId: string, error: Error): void {
    const message: AgentErrorMessage = {
      type: 'agent:error',
      payload: {
        agentId,
        error: {
          code: 'PROCESS_ERROR',
          message: error.message,
        },
      },
      timestamp: new Date().toISOString(),
    }

    const sent = this.clientManager.broadcastToAgentSubscribers(agentId, message)
    logger.debug({ agentId, errorMessage: error.message, sent }, 'Broadcast agent error')

    // Clean up previous status tracking
    this.previousStatuses.delete(agentId)
  }

  private handleAgentExit(agentId: string, code: number | null, signal: string | null): void {
    const previousStatus = this.previousStatuses.get(agentId)
    const reason = this.getExitReason(code, signal, previousStatus)

    const message: AgentTerminatedMessage = {
      type: 'agent:terminated',
      payload: {
        agentId,
        exitCode: code,
        signal,
        reason,
      },
      timestamp: new Date().toISOString(),
    }

    const sent = this.clientManager.broadcastToAgentSubscribers(agentId, message)
    logger.debug({ agentId, code, signal, reason, sent }, 'Broadcast agent terminated')

    // Clean up previous status tracking
    this.previousStatuses.delete(agentId)
  }

  private handleAgentWaiting(agentId: string): void {
    // Waiting state is handled through status change, but we can also emit a specific event
    // This is mainly for logging/debugging purposes
    logger.debug({ agentId }, 'Agent waiting for input')
  }

  // Workspace-level broadcasts (called externally)
  broadcastWorkspaceUpdate(
    workspaceId: string,
    change: WorkspaceUpdatedMessage['payload']['change'],
    data: Record<string, unknown>
  ): void {
    const message: WorkspaceUpdatedMessage = {
      type: 'workspace:updated',
      payload: {
        workspaceId,
        change,
        data,
      },
      timestamp: new Date().toISOString(),
    }

    const sent = this.clientManager.broadcastToWorkspaceSubscribers(workspaceId, message)
    logger.debug({ workspaceId, change, sent }, 'Broadcast workspace update')
  }

  // Usage update broadcasts (called externally)
  broadcastUsageUpdate(payload: UsageUpdatedMessage['payload']): void {
    const message: UsageUpdatedMessage = {
      type: 'usage:updated',
      payload,
      timestamp: new Date().toISOString(),
    }

    // Broadcast to all connected clients since usage is global
    const sent = this.clientManager.broadcast(message)
    logger.debug({ sent }, 'Broadcast usage update')
  }

  private getStatusReason(status: AgentStatus): string | undefined {
    switch (status) {
      case 'waiting':
        return 'awaiting_input'
      case 'error':
        return 'process_error'
      case 'finished':
        return 'completed'
      default:
        return undefined
    }
  }

  private getExitReason(
    code: number | null,
    signal: string | null,
    previousStatus?: AgentStatus
  ): 'user_stopped' | 'error' | 'completed' {
    // If signal is SIGTERM or SIGINT, user stopped it
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      return 'user_stopped'
    }

    // If exit code is 0, completed successfully
    if (code === 0) {
      return 'completed'
    }

    // If previous status was error, it's an error
    if (previousStatus === 'error') {
      return 'error'
    }

    // Default to error for non-zero exit codes
    if (code !== null && code !== 0) {
      return 'error'
    }

    // Fallback
    return 'completed'
  }
}
