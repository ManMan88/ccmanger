import { z } from 'zod'
import type {
  Workspace,
  Worktree,
  Agent,
  Message,
  SortMode,
  AgentStatus,
  AgentMode,
} from '@claude-manager/shared'

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

// Extended Worktree type that includes agents (from workspace details endpoint)
export interface WorktreeWithAgents extends Worktree {
  agents: Agent[]
  previousAgents: Agent[]
}

// Extended Workspace type that includes worktrees with agents
export interface WorkspaceWithDetails extends Workspace {
  worktrees: WorktreeWithAgents[]
}

// Usage types
export interface UsageSummary {
  daily: {
    used: number
    limit: number
    resetTime: string
  }
  weekly: {
    used: number
    limit: number
    resetTime: string
  }
  sonnetOnly: {
    used: number
    limit: number
    resetTime: string
  }
}

export interface UsageLimits {
  daily: number
  weekly: number
  sonnetOnly: number
}

export interface UsageHistoryEntry {
  date: string
  tokensUsed: number
  requestCount: number
  inputTokens: number
  outputTokens: number
  errorCount: number
}

// DTOs
export interface CreateWorktreeDto {
  name: string
  branch: string
  createBranch?: boolean
}

export interface UpdateWorktreeDto {
  name?: string
  sortMode?: SortMode
  order?: number
}

export interface CreateAgentDto {
  worktreeId: string
  name?: string
  mode?: AgentMode
  permissions?: string[]
  initialPrompt?: string
}

export interface UpdateAgentDto {
  name?: string
  mode?: AgentMode
  permissions?: string[]
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

    update: (id: string, name: string) =>
      request<Workspace>(`/api/workspaces/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),

    delete: (id: string) =>
      request<void>(`/api/workspaces/${id}`, {
        method: 'DELETE',
      }),

    refresh: (id: string) =>
      request<WorkspaceWithDetails>(`/api/workspaces/${id}/refresh`, {
        method: 'POST',
      }),
  },

  // Worktrees
  worktrees: {
    list: (workspaceId: string) =>
      request<{ worktrees: Worktree[] }>(`/api/workspaces/${workspaceId}/worktrees`),

    get: (workspaceId: string, id: string) =>
      request<WorktreeWithAgents>(`/api/workspaces/${workspaceId}/worktrees/${id}`),

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
      request<{ worktrees: { id: string; order: number }[] }>(
        `/api/workspaces/${workspaceId}/worktrees/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ worktreeIds }),
        }
      ),

    getStatus: (workspaceId: string, id: string) =>
      request<{
        branch: string
        ahead: number
        behind: number
        modified: string[]
        staged: string[]
        untracked: string[]
      }>(`/api/workspaces/${workspaceId}/worktrees/${id}/status`),

    getBranches: (workspaceId: string, id: string) =>
      request<{ current: string; local: string[]; remote: string[] }>(
        `/api/workspaces/${workspaceId}/worktrees/${id}/branches`
      ),
  },

  // Agents
  agents: {
    list: (params?: { worktreeId?: string; status?: AgentStatus; includeDeleted?: boolean }) => {
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

    fork: (id: string, name?: string) =>
      request<Agent>(`/api/agents/${id}/fork`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),

    restore: (id: string) =>
      request<Agent>(`/api/agents/${id}/restore`, {
        method: 'POST',
      }),

    reorder: (worktreeId: string, agentIds: string[]) =>
      request<{ agents: { id: string; order: number }[] }>('/api/agents/reorder', {
        method: 'PUT',
        body: JSON.stringify({ worktreeId, agentIds }),
      }),

    // Process control
    start: (id: string, initialPrompt?: string) =>
      request<Agent>(`/api/agents/${id}/start`, {
        method: 'POST',
        body: JSON.stringify({ initialPrompt }),
      }),

    stop: (id: string, force = false) =>
      request<Agent>(`/api/agents/${id}/stop?force=${force}`, {
        method: 'POST',
      }),

    resume: (id: string) =>
      request<Agent>(`/api/agents/${id}/resume`, {
        method: 'POST',
      }),

    // Messages
    getMessages: (id: string, limit = 100, before?: string) => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (before) params.set('before', before)
      return request<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>(
        `/api/agents/${id}/messages?${params}`
      )
    },

    sendMessage: (id: string, content: string) =>
      request<{ messageId: string; status: 'sent' | 'queued'; running: boolean }>(
        `/api/agents/${id}/message`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        }
      ),

    // Status
    getStatus: (id: string) =>
      request<{
        id: string
        status: AgentStatus
        processStatus: string | null
        isRunning: boolean
        contextLevel: number
        pid: number | null
      }>(`/api/agents/${id}/status`),
  },

  // Usage
  usage: {
    get: () => request<UsageSummary>('/api/usage'),

    getHistory: (period: 'daily' | 'weekly' | 'monthly', start?: string, end?: string) => {
      const params = new URLSearchParams({ period })
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      return request<{ history: UsageHistoryEntry[] }>(`/api/usage/history?${params}`)
    },

    getToday: () =>
      request<{
        date: string
        tokensUsed: number
        requestCount: number
        inputTokens: number
        outputTokens: number
        errorCount: number
        modelUsage: Record<string, number> | null
      }>('/api/usage/today'),

    getLimits: () => request<UsageLimits>('/api/usage/limits'),
  },
}
