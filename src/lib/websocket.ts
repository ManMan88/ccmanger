import { queryClient } from './queryClient'
import { queryKeys } from './queryKeys'
import type { Agent, Message, AgentStatus } from '@claude-manager/shared'

type MessageHandler = (data: unknown) => void

interface WebSocketMessage {
  type: string
  payload: unknown
  timestamp?: string
}

interface AgentOutputPayload {
  agentId: string
  content: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  isComplete?: boolean
}

interface AgentStatusPayload {
  agentId: string
  status: AgentStatus
}

interface AgentContextPayload {
  agentId: string
  contextLevel: number
}

interface AgentErrorPayload {
  agentId: string
  error: string
  code?: string
}

interface AgentTerminatedPayload {
  agentId: string
  exitCode: number
  reason?: string
}

interface WorkspaceUpdatedPayload {
  workspaceId: string
  action: string
  data: unknown
}

interface UsageUpdatedPayload {
  daily: { used: number; limit: number; resetTime: string }
  weekly: { used: number; limit: number; resetTime: string }
  sonnetOnly: { used: number; limit: number; resetTime: string }
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
    // Handle built-in message types
    switch (message.type) {
      case 'pong':
        // Heartbeat received
        break

      case 'agent:output':
        this.handleAgentOutput(message.payload as AgentOutputPayload)
        break

      case 'agent:status':
        this.handleAgentStatus(message.payload as AgentStatusPayload)
        break

      case 'agent:context':
        this.handleAgentContext(message.payload as AgentContextPayload)
        break

      case 'agent:error':
        this.handleAgentError(message.payload as AgentErrorPayload)
        break

      case 'agent:terminated':
        this.handleAgentTerminated(message.payload as AgentTerminatedPayload)
        break

      case 'workspace:updated':
        this.handleWorkspaceUpdate(message.payload as WorkspaceUpdatedPayload)
        break

      case 'usage:updated':
        this.handleUsageUpdate(message.payload as UsageUpdatedPayload)
        break
    }

    // Notify registered handlers
    const handlers = this.handlers.get(message.type)
    if (handlers) {
      handlers.forEach((handler) => handler(message.payload))
    }
  }

  private handleAgentOutput(payload: AgentOutputPayload): void {
    // Append message to agent's message cache
    const currentData = queryClient.getQueryData<{ messages: Message[]; hasMore: boolean }>(
      queryKeys.agents.messages(payload.agentId)
    )

    if (currentData) {
      const newMessage: Message = {
        id: `msg_${Date.now()}`,
        agentId: payload.agentId,
        role: payload.role,
        content: payload.content,
        tokenCount: null,
        toolName: null,
        toolInput: null,
        toolOutput: null,
        createdAt: new Date().toISOString(),
        isComplete: payload.isComplete ?? true,
      }

      queryClient.setQueryData(queryKeys.agents.messages(payload.agentId), {
        ...currentData,
        messages: [...currentData.messages, newMessage],
      })
    }
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
    queryClient.setQueryData<Agent>(queryKeys.agents.detail(payload.agentId), (old) =>
      old ? { ...old, contextLevel: payload.contextLevel } : old
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
                  a.id === payload.agentId ? { ...a, contextLevel: payload.contextLevel } : a
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
    queryClient.setQueryData(queryKeys.usage.current, payload)
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
