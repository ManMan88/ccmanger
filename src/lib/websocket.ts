import { queryClient } from './queryClient'
import { queryKeys } from './queryKeys'
import type { Agent, Message, AgentStatus } from '@claude-manager/shared'

type MessageHandler = (data: unknown) => void

// WebSocket message format - compatible with both Node.js and Rust backends
// Rust backend uses tagged enums with inline fields (camelCase)
// Node.js backend uses { type, payload } format
interface WebSocketMessage {
  type: string
  payload?: unknown
  // Rust backend fields (camelCase as per serde config)
  agentId?: string
  content?: string
  isComplete?: boolean
  status?: AgentStatus
  contextLevel?: number
  level?: number
  error?: string
  exitCode?: number
  exit_code?: number
  reason?: string
  signal?: string
  workspaceId?: string
  event?: string
  usage?: unknown
  timestamp?: string
}

interface AgentOutputPayload {
  agentId: string
  content: string
  role?: 'user' | 'assistant' | 'system' | 'tool'
  isComplete?: boolean
}

interface AgentStatusPayload {
  agentId: string
  status: AgentStatus
}

interface AgentContextPayload {
  agentId: string
  contextLevel?: number
  level?: number
}

interface AgentErrorPayload {
  agentId: string
  error: string
  code?: string
}

interface AgentTerminatedPayload {
  agentId: string
  exitCode?: number
  reason?: string
  signal?: string
}

interface WorkspaceUpdatedPayload {
  workspaceId: string
  action?: string
  event?: string
  data?: unknown
}

interface UsageUpdatedPayload {
  daily?: { used: number; limit: number; resetTime: string }
  weekly?: { used: number; limit: number; resetTime: string }
  sonnetOnly?: { used: number; limit: number; resetTime: string }
  usage?: unknown
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private subscriptions = new Map<string, Set<string>>() // type -> Set<id>
  private handlers = new Map<string, Set<MessageHandler>>()
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private statusListeners = new Set<(status: ConnectionStatus) => void>()
  private _status: ConnectionStatus = 'disconnected'

  constructor(url: string) {
    this.url = url
  }

  get status(): ConnectionStatus {
    return this._status
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status
    this.statusListeners.forEach((listener) => listener(status))
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      this.setStatus('connecting')

      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.reconnectAttempts = 0
          this.setStatus('connected')
          this.startPing()
          this.resubscribe()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err)
          }
        }

        this.ws.onclose = () => {
          console.log('WebSocket disconnected')
          this.setStatus('disconnected')
          this.stopPing()
          this.scheduleReconnect()
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          this.setStatus('error')
          reject(error)
        }
      } catch (err) {
        this.setStatus('error')
        reject(err)
      }
    })
  }

  private handleMessage(message: WebSocketMessage): void {
    // Extract payload - Rust backend sends inline fields, Node.js uses { type, payload }
    const payload = message.payload || message

    // Handle built-in message types
    switch (message.type) {
      case 'pong':
        // Heartbeat received
        break

      case 'agent:output':
        this.handleAgentOutput(this.extractAgentOutputPayload(payload))
        break

      case 'agent:status':
        this.handleAgentStatus(this.extractAgentStatusPayload(payload))
        break

      case 'agent:context':
        this.handleAgentContext(this.extractAgentContextPayload(payload))
        break

      case 'agent:error':
        this.handleAgentError(this.extractAgentErrorPayload(payload))
        break

      case 'agent:terminated':
        this.handleAgentTerminated(this.extractAgentTerminatedPayload(payload))
        break

      case 'workspace:updated':
        this.handleWorkspaceUpdate(this.extractWorkspaceUpdatedPayload(payload))
        break

      case 'usage:updated':
        this.handleUsageUpdate(payload as UsageUpdatedPayload)
        break
    }

    // Notify registered handlers
    const handlers = this.handlers.get(message.type)
    if (handlers) {
      handlers.forEach((handler) => handler(payload))
    }
  }

  // Extract payload from either format (Node.js or Rust backend)
  private extractAgentOutputPayload(payload: unknown): AgentOutputPayload {
    const p = payload as Record<string, unknown>
    return {
      agentId: (p.agentId as string) || '',
      content: (p.content as string) || '',
      role: p.role as 'user' | 'assistant' | 'system' | 'tool' | undefined,
      isComplete: (p.isComplete as boolean) ?? true,
    }
  }

  private extractAgentStatusPayload(payload: unknown): AgentStatusPayload {
    const p = payload as Record<string, unknown>
    return {
      agentId: (p.agentId as string) || '',
      status: (p.status as AgentStatus) || 'finished',
    }
  }

  private extractAgentContextPayload(payload: unknown): AgentContextPayload {
    const p = payload as Record<string, unknown>
    return {
      agentId: (p.agentId as string) || '',
      contextLevel: (p.contextLevel as number) ?? (p.level as number) ?? 0,
    }
  }

  private extractAgentErrorPayload(payload: unknown): AgentErrorPayload {
    const p = payload as Record<string, unknown>
    return {
      agentId: (p.agentId as string) || '',
      error: (p.error as string) || (p.message as string) || '',
      code: p.code as string | undefined,
    }
  }

  private extractAgentTerminatedPayload(payload: unknown): AgentTerminatedPayload {
    const p = payload as Record<string, unknown>
    return {
      agentId: (p.agentId as string) || '',
      exitCode: (p.exitCode as number) ?? (p.exit_code as number),
      reason: p.reason as string | undefined,
      signal: p.signal as string | undefined,
    }
  }

  private extractWorkspaceUpdatedPayload(payload: unknown): WorkspaceUpdatedPayload {
    const p = payload as Record<string, unknown>
    return {
      workspaceId: (p.workspaceId as string) || '',
      action: (p.action as string) || (p.event as string),
      data: p.data,
    }
  }

  private handleAgentOutput(_payload: AgentOutputPayload): void {
    // Output is now handled by the useTerminalOutput hook via generic event handlers.
    // No longer creating Message objects in the React Query cache.
  }

  private handleAgentStatus(payload: AgentStatusPayload): void {
    // Update agent status in detail cache
    queryClient.setQueryData<Agent>(queryKeys.agents.detail(payload.agentId), (old) =>
      old ? { ...old, status: payload.status } : old
    )

    // Also update in worktree agents list
    const agent = queryClient.getQueryData<Agent>(queryKeys.agents.detail(payload.agentId))
    if (agent) {
      queryClient.setQueryData<{ agents: Agent[] }>(
        queryKeys.agents.byWorktree(agent.worktreeId),
        (old) =>
          old
            ? {
                agents: old.agents.map((a) =>
                  a.id === payload.agentId ? { ...a, status: payload.status } : a
                ),
              }
            : old
      )

      // Invalidate workspace to get updated data
      // We don't have workspace ID here, so we invalidate all workspaces
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all })
    }
  }

  private handleAgentContext(payload: AgentContextPayload): void {
    const contextLevel = payload.contextLevel ?? 0

    queryClient.setQueryData<Agent>(queryKeys.agents.detail(payload.agentId), (old) =>
      old ? { ...old, contextLevel } : old
    )

    // Also update in worktree agents list
    const agent = queryClient.getQueryData<Agent>(queryKeys.agents.detail(payload.agentId))
    if (agent) {
      queryClient.setQueryData<{ agents: Agent[] }>(
        queryKeys.agents.byWorktree(agent.worktreeId),
        (old) =>
          old
            ? {
                agents: old.agents.map((a) =>
                  a.id === payload.agentId ? { ...a, contextLevel } : a
                ),
              }
            : old
      )
    }
  }

  private handleAgentError(payload: AgentErrorPayload): void {
    console.error('Agent error:', payload.agentId, payload.error)

    // Update agent status to error
    queryClient.setQueryData<Agent>(queryKeys.agents.detail(payload.agentId), (old) =>
      old ? { ...old, status: 'error' as AgentStatus } : old
    )
  }

  private handleAgentTerminated(payload: AgentTerminatedPayload): void {
    console.log('Agent terminated:', payload.agentId, 'exit code:', payload.exitCode)

    // Update agent status to finished
    queryClient.setQueryData<Agent>(queryKeys.agents.detail(payload.agentId), (old) =>
      old ? { ...old, status: 'finished' as AgentStatus, pid: null } : old
    )

    // Invalidate workspace to get updated data
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all })
  }

  private handleWorkspaceUpdate(payload: WorkspaceUpdatedPayload): void {
    // Invalidate workspace queries to refetch latest data
    queryClient.invalidateQueries({
      queryKey: queryKeys.workspaces.detail(payload.workspaceId),
    })
  }

  private handleUsageUpdate(payload: UsageUpdatedPayload): void {
    // Handle both formats - Rust sends { usage }, Node.js sends directly
    const usageData = payload.usage || payload
    queryClient.setQueryData(queryKeys.usage.current, usageData)
  }

  // Subscription methods
  subscribeToAgent(agentId: string): void {
    if (!this.subscriptions.has('agent')) {
      this.subscriptions.set('agent', new Set())
    }
    this.subscriptions.get('agent')!.add(agentId)

    this.send({
      type: 'subscribe:agent',
      payload: { agentId },
    })
  }

  unsubscribeFromAgent(agentId: string): void {
    this.subscriptions.get('agent')?.delete(agentId)

    this.send({
      type: 'unsubscribe:agent',
      payload: { agentId },
    })
  }

  subscribeToWorkspace(workspaceId: string): void {
    if (!this.subscriptions.has('workspace')) {
      this.subscriptions.set('workspace', new Set())
    }
    this.subscriptions.get('workspace')!.add(workspaceId)

    this.send({
      type: 'subscribe:workspace',
      payload: { workspaceId },
    })
  }

  unsubscribeFromWorkspace(workspaceId: string): void {
    this.subscriptions.get('workspace')?.delete(workspaceId)

    this.send({
      type: 'unsubscribe:workspace',
      payload: { workspaceId },
    })
  }

  // Event handler registration
  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)

    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  // Private methods
  private send(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' })
    }, 30000)
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      this.setStatus('error')
      return
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts)
    this.reconnectAttempts++

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      this.connect().catch(console.error)
    }, delay)
  }

  private resubscribe(): void {
    // Resubscribe to all previous subscriptions after reconnect
    this.subscriptions.forEach((ids, type) => {
      ids.forEach((id) => {
        if (type === 'agent') {
          this.send({ type: 'subscribe:agent', payload: { agentId: id } })
        } else if (type === 'workspace') {
          this.send({ type: 'subscribe:workspace', payload: { workspaceId: id } })
        }
      })
    })
  }

  disconnect(): void {
    this.stopPing()
    this.ws?.close()
    this.ws = null
    this.setStatus('disconnected')
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton instance
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'
export const wsClient = new WebSocketClient(WS_URL)
