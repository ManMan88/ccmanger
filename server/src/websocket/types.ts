import type { WebSocket } from 'ws'
import type { AgentStatus } from '@claude-manager/shared'

// Client-to-Server message types
export type ClientMessageType =
  | 'subscribe:agent'
  | 'unsubscribe:agent'
  | 'subscribe:workspace'
  | 'unsubscribe:workspace'
  | 'ping'

// Server-to-Client message types
export type ServerMessageType =
  | 'agent:output'
  | 'agent:status'
  | 'agent:context'
  | 'agent:error'
  | 'agent:terminated'
  | 'workspace:updated'
  | 'usage:updated'
  | 'pong'
  | 'error'
  | 'subscribed'
  | 'unsubscribed'

// Base message interface
export interface BaseMessage<T extends string, P = unknown> {
  type: T
  payload?: P
  timestamp: string
}

// Client messages
export interface SubscribeAgentMessage extends BaseMessage<'subscribe:agent'> {
  payload: { agentId: string }
}

export interface UnsubscribeAgentMessage extends BaseMessage<'unsubscribe:agent'> {
  payload: { agentId: string }
}

export interface SubscribeWorkspaceMessage extends BaseMessage<'subscribe:workspace'> {
  payload: { workspaceId: string }
}

export interface UnsubscribeWorkspaceMessage extends BaseMessage<'unsubscribe:workspace'> {
  payload: { workspaceId: string }
}

export type PingMessage = BaseMessage<'ping'>

export type ClientMessage =
  | SubscribeAgentMessage
  | UnsubscribeAgentMessage
  | SubscribeWorkspaceMessage
  | UnsubscribeWorkspaceMessage
  | PingMessage

// Server messages
export interface AgentOutputMessage extends BaseMessage<'agent:output'> {
  payload: {
    agentId: string
    content: string
    role: 'assistant'
    isStreaming: boolean
  }
}

export interface AgentStatusMessage extends BaseMessage<'agent:status'> {
  payload: {
    agentId: string
    previousStatus: AgentStatus
    status: AgentStatus
    reason?: string
  }
}

export interface AgentContextMessage extends BaseMessage<'agent:context'> {
  payload: {
    agentId: string
    contextLevel: number
    tokensUsed?: number
    tokensLimit?: number
  }
}

export interface AgentErrorMessage extends BaseMessage<'agent:error'> {
  payload: {
    agentId: string
    error: {
      code: string
      message: string
    }
  }
}

export interface AgentTerminatedMessage extends BaseMessage<'agent:terminated'> {
  payload: {
    agentId: string
    exitCode: number | null
    signal?: string | null
    reason: 'user_stopped' | 'error' | 'completed'
  }
}

export interface WorkspaceUpdatedMessage extends BaseMessage<'workspace:updated'> {
  payload: {
    workspaceId: string
    change:
      | 'worktree_added'
      | 'worktree_removed'
      | 'agent_added'
      | 'agent_removed'
      | 'agent_updated'
    data: Record<string, unknown>
  }
}

export interface UsageUpdatedMessage extends BaseMessage<'usage:updated'> {
  payload: {
    daily: {
      used: number
      limit: number
    }
    weekly?: {
      used: number
      limit: number
    }
  }
}

export type PongMessage = BaseMessage<'pong'>

export interface ErrorMessage extends BaseMessage<'error'> {
  payload: {
    code: string
    message: string
  }
}

export interface SubscribedMessage extends BaseMessage<'subscribed'> {
  payload: {
    type: 'agent' | 'workspace'
    id: string
  }
}

export interface UnsubscribedMessage extends BaseMessage<'unsubscribed'> {
  payload: {
    type: 'agent' | 'workspace'
    id: string
  }
}

export type ServerMessage =
  | AgentOutputMessage
  | AgentStatusMessage
  | AgentContextMessage
  | AgentErrorMessage
  | AgentTerminatedMessage
  | WorkspaceUpdatedMessage
  | UsageUpdatedMessage
  | PongMessage
  | ErrorMessage
  | SubscribedMessage
  | UnsubscribedMessage

// Connected client tracking
export interface ConnectedClient {
  id: string
  socket: WebSocket
  subscribedAgents: Set<string>
  subscribedWorkspaces: Set<string>
  lastPing: number
  connectedAt: Date
}
