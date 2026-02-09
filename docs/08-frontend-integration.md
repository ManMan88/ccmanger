# Frontend Integration Guide

## Overview

This document provides detailed guidance for integrating the React frontend with the new backend API. It covers the API client, state management with React Query, WebSocket integration, and component updates.

## Current Frontend State

The frontend currently uses:

- **Mock data** in `useWorkspace.ts` hook
- **In-memory state** with React `useState`
- **No persistence** - data lost on refresh
- **React Query installed** but not used

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        React Application                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │   Components    │────▶│     Hooks       │────▶│  React Query    │   │
│  │   (UI Layer)    │     │  (Data Access)  │     │  (Cache/Sync)   │   │
│  └─────────────────┘     └─────────────────┘     └────────┬────────┘   │
│                                                            │            │
│  ┌─────────────────────────────────────────────────────────┼──────────┐│
│  │                    Transport Layer                      │          ││
│  │  ┌─────────────────┐                    ┌───────────────▼────────┐ ││
│  │  │  WebSocket      │◀───────────────────│     API Client        │ ││
│  │  │  (Real-time)    │                    │     (REST)            │ ││
│  │  └────────┬────────┘                    └───────────────┬────────┘ ││
│  └───────────┼─────────────────────────────────────────────┼──────────┘│
└──────────────┼─────────────────────────────────────────────┼───────────┘
               │                                             │
               ▼                                             ▼
        ┌─────────────┐                              ┌─────────────┐
        │ WS Server   │                              │ REST API    │
        │ /ws         │                              │ /api/*      │
        └─────────────┘                              └─────────────┘
```

---

## API Client

### Setup

```typescript
// src/lib/api.ts
import { z } from 'zod'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Error response schema
const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
})

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const parsed = ApiErrorSchema.safeParse(body)

    if (parsed.success) {
      throw new ApiError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
        parsed.data.error.details
      )
    }

    throw new ApiError('UNKNOWN_ERROR', 'An unexpected error occurred', response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

// Generic request function
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  return handleResponse<T>(response)
}

// API Methods
export const api = {
  // Workspaces
  workspaces: {
    list: () => request<{ workspaces: Workspace[] }>('/api/workspaces'),
    get: (id: string) => request<WorkspaceWithDetails>(`/api/workspaces/${id}`),
    create: (path: string) =>
      request<Workspace>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ path }),
      }),
    delete: (id: string) =>
      request<void>(`/api/workspaces/${id}`, {
        method: 'DELETE',
      }),
  },

  // Worktrees
  worktrees: {
    list: (workspaceId: string) =>
      request<{ worktrees: Worktree[] }>(`/api/workspaces/${workspaceId}/worktrees`),
    create: (workspaceId: string, data: CreateWorktreeDto) =>
      request<Worktree>(`/api/workspaces/${workspaceId}/worktrees`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (workspaceId: string, id: string, data: UpdateWorktreeDto) =>
      request<Worktree>(`/api/workspaces/${workspaceId}/worktrees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (workspaceId: string, id: string, force = false) =>
      request<void>(`/api/workspaces/${workspaceId}/worktrees/${id}?force=${force}`, {
        method: 'DELETE',
      }),
    checkout: (workspaceId: string, id: string, branch: string, createBranch = false) =>
      request<Worktree>(`/api/workspaces/${workspaceId}/worktrees/${id}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ branch, createBranch }),
      }),
    reorder: (workspaceId: string, worktreeIds: string[]) =>
      request<void>(`/api/workspaces/${workspaceId}/worktrees/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ worktreeIds }),
      }),
  },

  // Agents
  agents: {
    list: (params?: { worktreeId?: string; status?: string; includeDeleted?: boolean }) => {
      const searchParams = new URLSearchParams()
      if (params?.worktreeId) searchParams.set('worktreeId', params.worktreeId)
      if (params?.status) searchParams.set('status', params.status)
      if (params?.includeDeleted) searchParams.set('includeDeleted', 'true')
      const query = searchParams.toString()
      return request<{ agents: Agent[] }>(`/api/agents${query ? `?${query}` : ''}`)
    },
    get: (id: string) => request<Agent>(`/api/agents/${id}`),
    create: (data: CreateAgentDto) =>
      request<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: UpdateAgentDto) =>
      request<Agent>(`/api/agents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string, archive = true) =>
      request<void>(`/api/agents/${id}?archive=${archive}`, {
        method: 'DELETE',
      }),
    sendMessage: (id: string, content: string) =>
      request<{ messageId: string; status: string }>(`/api/agents/${id}/message`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    stop: (id: string) =>
      request<Agent>(`/api/agents/${id}/stop`, {
        method: 'POST',
      }),
    fork: (id: string, name?: string) =>
      request<Agent>(`/api/agents/${id}/fork`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    reorder: (worktreeId: string, agentIds: string[]) =>
      request<void>('/api/agents/reorder', {
        method: 'PUT',
        body: JSON.stringify({ worktreeId, agentIds }),
      }),
    getMessages: (id: string, limit = 100, offset = 0) =>
      request<{ messages: Message[] }>(
        `/api/agents/${id}/messages?limit=${limit}&offset=${offset}`
      ),
  },

  // Usage
  usage: {
    get: () => request<UsageStats>('/api/usage'),
    getHistory: (period: string, start?: string, end?: string) => {
      const params = new URLSearchParams({ period })
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      return request<{ history: UsageHistoryEntry[] }>(`/api/usage/history?${params}`)
    },
  },
}
```

### Type Definitions (Shared)

```typescript
// shared/types.ts

// API Types (camelCase for frontend)
export interface Workspace {
  id: string
  name: string
  path: string
  worktreeCount: number
  agentCount: number
  createdAt: string
  updatedAt: string
}

export interface WorkspaceWithDetails extends Workspace {
  worktrees: Worktree[]
}

export interface Worktree {
  id: string
  name: string
  branch: string
  path: string
  sortMode: 'free' | 'status' | 'name'
  order: number
  agents: Agent[]
  previousAgents: Agent[]
}

export interface Agent {
  id: string
  name: string
  status: 'running' | 'waiting' | 'error' | 'finished'
  contextLevel: number
  mode: 'auto' | 'plan' | 'regular'
  permissions: string[]
  worktreeId: string
  createdAt: string
  order: number
  pid?: number
  sessionId?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: string
}

export interface UsageStats {
  daily: UsageLimit
  weekly: UsageLimit
  sonnetOnly: UsageLimit
}

export interface UsageLimit {
  used: number
  limit: number
  resetTime: string
}

// DTOs
export interface CreateWorktreeDto {
  name: string
  branch: string
  createBranch?: boolean
}

export interface UpdateWorktreeDto {
  sortMode?: 'free' | 'status' | 'name'
  order?: number
}

export interface CreateAgentDto {
  worktreeId: string
  name?: string
  mode?: 'auto' | 'plan' | 'regular'
  permissions?: string[]
  initialPrompt?: string
}

export interface UpdateAgentDto {
  name?: string
  mode?: 'auto' | 'plan' | 'regular'
  permissions?: string[]
}
```

---

## React Query Integration

### Query Client Setup

```typescript
// src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
```

### Query Keys

```typescript
// src/lib/queryKeys.ts
export const queryKeys = {
  workspaces: {
    all: ['workspaces'] as const,
    detail: (id: string) => ['workspaces', id] as const,
  },
  worktrees: {
    all: (workspaceId: string) => ['worktrees', workspaceId] as const,
  },
  agents: {
    all: ['agents'] as const,
    byWorktree: (worktreeId: string) => ['agents', 'worktree', worktreeId] as const,
    detail: (id: string) => ['agents', id] as const,
    messages: (id: string) => ['agents', id, 'messages'] as const,
  },
  usage: {
    current: ['usage'] as const,
    history: (period: string) => ['usage', 'history', period] as const,
  },
}
```

### Workspace Hooks

```typescript
// src/hooks/useWorkspace.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { WorkspaceWithDetails, CreateWorktreeDto } from '@shared/types'

export function useWorkspace(workspaceId: string | null) {
  const queryClient = useQueryClient()

  // Fetch workspace with details
  const workspaceQuery = useQuery({
    queryKey: queryKeys.workspaces.detail(workspaceId!),
    queryFn: () => api.workspaces.get(workspaceId!),
    enabled: !!workspaceId,
  })

  // Add worktree mutation
  const addWorktreeMutation = useMutation({
    mutationFn: (data: CreateWorktreeDto) => api.worktrees.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  // Remove worktree mutation
  const removeWorktreeMutation = useMutation({
    mutationFn: (worktreeId: string) => api.worktrees.delete(workspaceId!, worktreeId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  // Checkout branch mutation
  const checkoutBranchMutation = useMutation({
    mutationFn: ({
      worktreeId,
      branch,
      createBranch,
    }: {
      worktreeId: string
      branch: string
      createBranch?: boolean
    }) => api.worktrees.checkout(workspaceId!, worktreeId, branch, createBranch),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  // Update worktree (sort mode, order)
  const updateWorktreeMutation = useMutation({
    mutationFn: ({ worktreeId, ...data }: { worktreeId: string } & UpdateWorktreeDto) =>
      api.worktrees.update(workspaceId!, worktreeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  // Reorder worktrees mutation
  const reorderWorktreesMutation = useMutation({
    mutationFn: (worktreeIds: string[]) => api.worktrees.reorder(workspaceId!, worktreeIds),
    onMutate: async (worktreeIds) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })

      // Snapshot previous value
      const previousWorkspace = queryClient.getQueryData<WorkspaceWithDetails>(
        queryKeys.workspaces.detail(workspaceId!)
      )

      // Optimistically update
      if (previousWorkspace) {
        const reorderedWorktrees = worktreeIds.map((id, index) => {
          const wt = previousWorkspace.worktrees.find((w) => w.id === id)!
          return { ...wt, order: index }
        })

        queryClient.setQueryData(queryKeys.workspaces.detail(workspaceId!), {
          ...previousWorkspace,
          worktrees: reorderedWorktrees,
        })
      }

      return { previousWorkspace }
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousWorkspace) {
        queryClient.setQueryData(
          queryKeys.workspaces.detail(workspaceId!),
          context.previousWorkspace
        )
      }
    },
  })

  return {
    workspace: workspaceQuery.data ?? null,
    isLoading: workspaceQuery.isLoading,
    isError: workspaceQuery.isError,
    error: workspaceQuery.error,

    addWorktree: addWorktreeMutation.mutate,
    removeWorktree: removeWorktreeMutation.mutate,
    checkoutBranch: checkoutBranchMutation.mutate,
    updateWorktree: updateWorktreeMutation.mutate,
    reorderWorktrees: reorderWorktreesMutation.mutate,
  }
}
```

### Agent Hooks

```typescript
// src/hooks/useAgents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Agent, CreateAgentDto, UpdateAgentDto } from '@shared/types'

export function useAgents(worktreeId: string) {
  const queryClient = useQueryClient()

  // Fetch agents for worktree
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.byWorktree(worktreeId),
    queryFn: () => api.agents.list({ worktreeId }),
    select: (data) => data.agents,
  })

  // Create agent
  const createAgentMutation = useMutation({
    mutationFn: (data: Omit<CreateAgentDto, 'worktreeId'>) =>
      api.agents.create({ ...data, worktreeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.byWorktree(worktreeId),
      })
    },
  })

  // Update agent
  const updateAgentMutation = useMutation({
    mutationFn: ({ agentId, ...data }: { agentId: string } & UpdateAgentDto) =>
      api.agents.update(agentId, data),
    onMutate: async ({ agentId, ...updates }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.agents.byWorktree(worktreeId),
      })

      const previousAgents = queryClient.getQueryData<{ agents: Agent[] }>(
        queryKeys.agents.byWorktree(worktreeId)
      )

      if (previousAgents) {
        queryClient.setQueryData(queryKeys.agents.byWorktree(worktreeId), {
          agents: previousAgents.agents.map((a) => (a.id === agentId ? { ...a, ...updates } : a)),
        })
      }

      return { previousAgents }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData(queryKeys.agents.byWorktree(worktreeId), context.previousAgents)
      }
    },
  })

  // Delete agent
  const deleteAgentMutation = useMutation({
    mutationFn: ({ agentId, archive = true }: { agentId: string; archive?: boolean }) =>
      api.agents.delete(agentId, archive),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.byWorktree(worktreeId),
      })
    },
  })

  // Fork agent
  const forkAgentMutation = useMutation({
    mutationFn: ({ agentId, name }: { agentId: string; name?: string }) =>
      api.agents.fork(agentId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.byWorktree(worktreeId),
      })
    },
  })

  // Reorder agents
  const reorderAgentsMutation = useMutation({
    mutationFn: (agentIds: string[]) => api.agents.reorder(worktreeId, agentIds),
    onMutate: async (agentIds) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.agents.byWorktree(worktreeId),
      })

      const previousAgents = queryClient.getQueryData<{ agents: Agent[] }>(
        queryKeys.agents.byWorktree(worktreeId)
      )

      if (previousAgents) {
        const reordered = agentIds.map((id, index) => {
          const agent = previousAgents.agents.find((a) => a.id === id)!
          return { ...agent, order: index }
        })

        queryClient.setQueryData(queryKeys.agents.byWorktree(worktreeId), { agents: reordered })
      }

      return { previousAgents }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData(queryKeys.agents.byWorktree(worktreeId), context.previousAgents)
      }
    },
  })

  return {
    agents: agentsQuery.data ?? [],
    isLoading: agentsQuery.isLoading,
    isError: agentsQuery.isError,

    createAgent: createAgentMutation.mutate,
    updateAgent: updateAgentMutation.mutate,
    deleteAgent: deleteAgentMutation.mutate,
    forkAgent: forkAgentMutation.mutate,
    reorderAgents: reorderAgentsMutation.mutate,
  }
}

// Hook for single agent with messages
export function useAgent(agentId: string | null) {
  const queryClient = useQueryClient()

  const agentQuery = useQuery({
    queryKey: queryKeys.agents.detail(agentId!),
    queryFn: () => api.agents.get(agentId!),
    enabled: !!agentId,
  })

  const messagesQuery = useQuery({
    queryKey: queryKeys.agents.messages(agentId!),
    queryFn: () => api.agents.getMessages(agentId!),
    enabled: !!agentId,
    select: (data) => data.messages,
  })

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => api.agents.sendMessage(agentId!, content),
    onSuccess: () => {
      // Messages will be updated via WebSocket
    },
  })

  const stopAgentMutation = useMutation({
    mutationFn: () => api.agents.stop(agentId!),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.agents.detail(agentId!), data)
    },
  })

  return {
    agent: agentQuery.data ?? null,
    messages: messagesQuery.data ?? [],
    isLoading: agentQuery.isLoading || messagesQuery.isLoading,

    sendMessage: sendMessageMutation.mutate,
    stopAgent: stopAgentMutation.mutate,
    isSending: sendMessageMutation.isPending,
  }
}
```

### Usage Hook

```typescript
// src/hooks/useUsage.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

export function useUsage() {
  const usageQuery = useQuery({
    queryKey: queryKeys.usage.current,
    queryFn: () => api.usage.get(),
    refetchInterval: 60000, // Refetch every minute
  })

  return {
    stats: usageQuery.data ?? null,
    isLoading: usageQuery.isLoading,
    isError: usageQuery.isError,
  }
}
```

---

## WebSocket Integration

### WebSocket Client

```typescript
// src/lib/websocket.ts
import { queryClient } from './queryClient'
import { queryKeys } from './queryKeys'
import type { Agent } from '@shared/types'

type MessageHandler = (data: any) => void

interface WebSocketMessage {
  type: string
  payload: any
  timestamp: string
}

class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private subscriptions = new Map<string, Set<string>>() // type -> Set<id>
  private handlers = new Map<string, Set<MessageHandler>>()
  private pingInterval: number | null = null

  constructor(url: string) {
    this.url = url
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.reconnectAttempts = 0
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
          this.stopPing()
          this.scheduleReconnect()
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }
      } catch (err) {
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
        this.handleAgentOutput(message.payload)
        break

      case 'agent:status':
        this.handleAgentStatus(message.payload)
        break

      case 'agent:context':
        this.handleAgentContext(message.payload)
        break

      case 'agent:error':
        this.handleAgentError(message.payload)
        break

      case 'usage:updated':
        this.handleUsageUpdate(message.payload)
        break
    }

    // Notify registered handlers
    const handlers = this.handlers.get(message.type)
    if (handlers) {
      handlers.forEach((handler) => handler(message.payload))
    }
  }

  private handleAgentOutput(payload: { agentId: string; content: string; role: string }): void {
    // Append message to agent's message cache
    const currentMessages = queryClient.getQueryData<{ messages: any[] }>(
      queryKeys.agents.messages(payload.agentId)
    )

    if (currentMessages) {
      queryClient.setQueryData(queryKeys.agents.messages(payload.agentId), {
        messages: [
          ...currentMessages.messages,
          {
            id: `msg_${Date.now()}`,
            role: payload.role,
            content: payload.content,
            timestamp: new Date().toISOString(),
          },
        ],
      })
    }
  }

  private handleAgentStatus(payload: { agentId: string; status: string }): void {
    // Update agent status in cache
    queryClient.setQueryData<Agent>(queryKeys.agents.detail(payload.agentId), (old) =>
      old ? { ...old, status: payload.status as Agent['status'] } : old
    )

    // Also update in worktree agents list
    // This requires knowing the worktreeId, which we can get from the agent
    const agent = queryClient.getQueryData<Agent>(queryKeys.agents.detail(payload.agentId))
    if (agent) {
      queryClient.setQueryData<{ agents: Agent[] }>(
        queryKeys.agents.byWorktree(agent.worktreeId),
        (old) =>
          old
            ? {
                agents: old.agents.map((a) =>
                  a.id === payload.agentId ? { ...a, status: payload.status as Agent['status'] } : a
                ),
              }
            : old
      )
    }
  }

  private handleAgentContext(payload: { agentId: string; contextLevel: number }): void {
    queryClient.setQueryData<Agent>(queryKeys.agents.detail(payload.agentId), (old) =>
      old ? { ...old, contextLevel: payload.contextLevel } : old
    )
  }

  private handleAgentError(payload: { agentId: string; error: any }): void {
    console.error('Agent error:', payload.agentId, payload.error)
    // Could show a toast notification here
  }

  private handleUsageUpdate(payload: any): void {
    queryClient.setQueryData(queryKeys.usage.current, (old: any) => ({
      ...old,
      ...payload,
    }))
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
    this.pingInterval = window.setInterval(() => {
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
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton instance
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'
export const wsClient = new WebSocketClient(WS_URL)
```

### WebSocket React Hook

```typescript
// src/hooks/useWebSocket.ts
import { useEffect, useState, useCallback } from 'react'
import { wsClient } from '@/lib/websocket'

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(wsClient.isConnected)

  useEffect(() => {
    // Connect on mount
    if (!wsClient.isConnected) {
      wsClient
        .connect()
        .then(() => {
          setIsConnected(true)
        })
        .catch((err) => {
          console.error('WebSocket connection failed:', err)
          setIsConnected(false)
        })
    }

    // Check connection status periodically
    const interval = setInterval(() => {
      setIsConnected(wsClient.isConnected)
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  const subscribeToAgent = useCallback((agentId: string) => {
    wsClient.subscribeToAgent(agentId)
    return () => wsClient.unsubscribeFromAgent(agentId)
  }, [])

  const subscribeToWorkspace = useCallback((workspaceId: string) => {
    wsClient.subscribeToWorkspace(workspaceId)
    return () => wsClient.unsubscribeFromWorkspace(workspaceId)
  }, [])

  return {
    isConnected,
    subscribeToAgent,
    subscribeToWorkspace,
    on: wsClient.on.bind(wsClient),
  }
}

// Hook for subscribing to a specific agent
export function useAgentSubscription(agentId: string | null) {
  const { subscribeToAgent } = useWebSocket()

  useEffect(() => {
    if (!agentId) return

    const unsubscribe = subscribeToAgent(agentId)
    return unsubscribe
  }, [agentId, subscribeToAgent])
}
```

---

## Component Updates

### AgentModal Updates

The agent modal now uses a terminal-style interface instead of chat bubbles. Output streams
in real-time on a dark background with monospace font. The input is always enabled regardless
of agent status — when idle, typing a message starts the agent with that prompt.

```typescript
// src/components/AgentModal.tsx (key changes)
import { useAgent } from '@/hooks/useAgents'
import { useAgentSubscription, useWebSocket } from '@/hooks/useWebSocket'
import { useTerminalOutput } from '@/hooks/useTerminalOutput'

export function AgentModal({ agentId, open, onClose }: AgentModalProps) {
  const { agent, sendMessage, startAgent, stopAgent, isSending } = useAgent(agentId)
  const { isConnected } = useWebSocket()
  const { lines, addUserInput } = useTerminalOutput(open ? agentId : null)

  // Subscribe to agent updates when modal is open
  useAgentSubscription(open ? agentId : null)

  const handleSend = (content: string) => {
    if (!content.trim() || !agent) return
    addUserInput(content)
    if (agent.status === 'finished' || agent.status === 'error') {
      startAgent(content) // Start agent with input as initial prompt
    } else {
      sendMessage(content) // Write to stdin
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        {/* Terminal output area */}
        <div className="flex-1 overflow-y-auto bg-[#300a24] p-4 font-mono text-sm">
          {lines.map((line) => (
            <div key={line.id} className={
              line.type === 'user-input' ? 'text-green-400' :
              line.type === 'stderr' ? 'text-red-400' :
              line.type === 'system' ? 'text-yellow-500 italic' :
              'text-gray-200'
            }>
              {line.type === 'user-input' ? `$ ${line.content}` : line.content}
            </div>
          ))}
        </div>

        {/* Terminal-style input — always enabled */}
        <div className="bg-[#300a24] px-4 py-3 font-mono">
          <div className="flex items-center gap-2">
            <span className="text-green-400">$</span>
            <input
              type="text"
              placeholder="Type a message..."
              className="flex-1 bg-transparent text-gray-200 outline-none"
              disabled={isSending}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSend(e.currentTarget.value)
                  e.currentTarget.value = ''
                }
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### Index Page Updates

```typescript
// src/pages/Index.tsx (key changes)
import { useWorkspace } from '@/hooks/useWorkspace'
import { useUsage } from '@/hooks/useUsage'
import { useWebSocket } from '@/hooks/useWebSocket'

export default function Index() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const { workspace, isLoading, addWorktree, removeWorktree, ... } = useWorkspace(workspaceId)
  const { stats: usageStats } = useUsage()
  const { isConnected, subscribeToWorkspace } = useWebSocket()

  // Subscribe to workspace updates
  useEffect(() => {
    if (workspaceId) {
      return subscribeToWorkspace(workspaceId)
    }
  }, [workspaceId, subscribeToWorkspace])

  if (isLoading) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen">
      <Toolbar
        workspaceName={workspace?.name}
        isConnected={isConnected}
        // ...
      />

      {workspace?.worktrees.map((worktree) => (
        <WorktreeRow
          key={worktree.id}
          worktree={worktree}
          onAddAgent={() => addAgent(worktree.id)}
          // ... pass real handlers
        />
      ))}

      <UsageBar stats={usageStats} />
    </div>
  )
}
```

---

## Environment Configuration

### Frontend Environment Variables

```bash
# .env.development
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001/ws

# .env.production
VITE_API_URL=https://api.claude-manager.example.com
VITE_WS_URL=wss://api.claude-manager.example.com/ws
```

### Vite Configuration Update

```typescript
// vite.config.ts
export default defineConfig({
  // ...existing config
  define: {
    // Ensure env vars are available
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL),
    'import.meta.env.VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
```

---

## Migration Checklist

### Files to Create

- [ ] `src/lib/api.ts`
- [ ] `src/lib/queryClient.ts`
- [ ] `src/lib/queryKeys.ts`
- [ ] `src/lib/websocket.ts`
- [ ] `src/hooks/useAgents.ts`
- [ ] `src/hooks/useUsage.ts`
- [ ] `src/hooks/useWebSocket.ts`

### Files to Update

- [ ] `src/hooks/useWorkspace.ts` - Replace mock with React Query
- [ ] `src/pages/Index.tsx` - Use new hooks
- [ ] `src/components/AgentBox.tsx` - Add data-testid, use real handlers
- [ ] `src/components/AgentModal.tsx` - Connect to API + WebSocket
- [ ] `src/components/WorktreeRow.tsx` - Use new hooks
- [ ] `src/components/UsageBar.tsx` - Use useUsage hook
- [ ] `src/App.tsx` - Initialize WebSocket

### Files to Delete (after migration)

- [ ] Mock data in `useWorkspace.ts`

### Testing

- [ ] All existing UI interactions work
- [ ] Data persists after refresh
- [ ] Real-time updates appear
- [ ] Error states handled gracefully
- [ ] Loading states displayed

This integration guide provides a complete roadmap for connecting the frontend to the new backend API while maintaining the existing UI behavior and adding real-time capabilities.
