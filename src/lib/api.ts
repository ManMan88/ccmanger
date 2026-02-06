import { z } from 'zod'
import type {
  Workspace,
  Worktree,
  Agent,
  Message,
  SortMode,
  AgentStatus,
  AgentMode,
  Permission,
} from '@claude-manager/shared'

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Tauri invoke function - dynamically imported to avoid issues in non-Tauri environments
async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error('Tauri not available')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

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

// Generic HTTP request function
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
  permissions?: Permission[]
  initialPrompt?: string
}

export interface UpdateAgentDto {
  name?: string
  mode?: AgentMode
  permissions?: Permission[]
}

// Tauri-specific input types (matching Rust struct names)
interface CreateWorkspaceInput {
  path: string
  name?: string
}

interface CreateWorktreeInput {
  workspaceId: string
  name: string
  branch: string
  path?: string
  createBranch?: boolean
}

interface UpdateWorktreeInput {
  name?: string
  sortMode?: SortMode
  displayOrder?: number
}

interface CheckoutBranchInput {
  branch: string
  create?: boolean
}

interface ReorderWorktreesInput {
  worktreeIds: string[]
}

interface CreateAgentInput {
  worktreeId: string
  name?: string
  mode?: AgentMode
  permissions?: Permission[]
}

interface UpdateAgentInput {
  name?: string
  mode?: AgentMode
  permissions?: Permission[]
  displayOrder?: number
}

interface SendMessageInput {
  content: string
}

interface ReorderAgentsInput {
  agentIds: string[]
}

// API Methods
export const api = {
  // Workspaces
  workspaces: {
    list: async () => {
      if (isTauri) {
        return tauriInvoke<{ workspaces: Workspace[] }>('list_workspaces')
      }
      return request<{ workspaces: Workspace[] }>('/api/workspaces')
    },

    get: async (id: string) => {
      if (isTauri) {
        return tauriInvoke<WorkspaceWithDetails>('get_workspace', { id })
      }
      return request<WorkspaceWithDetails>(`/api/workspaces/${id}`)
    },

    create: async (path: string, name?: string) => {
      if (isTauri) {
        const input: CreateWorkspaceInput = { path, name }
        return tauriInvoke<Workspace>('create_workspace', { input })
      }
      return request<Workspace>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ path }),
      })
    },

    update: async (id: string, name: string) => {
      if (isTauri) {
        // Note: Rust backend may not have update_workspace command yet
        // Falling back to HTTP for now
        return request<Workspace>(`/api/workspaces/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name }),
        })
      }
      return request<Workspace>(`/api/workspaces/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      })
    },

    delete: async (id: string) => {
      if (isTauri) {
        return tauriInvoke<void>('delete_workspace', { id })
      }
      return request<void>(`/api/workspaces/${id}`, {
        method: 'DELETE',
      })
    },

    refresh: async (id: string) => {
      if (isTauri) {
        return tauriInvoke<WorkspaceWithDetails>('refresh_workspace', { id })
      }
      return request<WorkspaceWithDetails>(`/api/workspaces/${id}/refresh`, {
        method: 'POST',
      })
    },
  },

  // Worktrees
  worktrees: {
    list: async (workspaceId: string) => {
      if (isTauri) {
        return tauriInvoke<{ worktrees: Worktree[] }>('list_worktrees', { workspaceId })
      }
      return request<{ worktrees: Worktree[] }>(`/api/workspaces/${workspaceId}/worktrees`)
    },

    get: async (workspaceId: string, id: string) => {
      if (isTauri) {
        return tauriInvoke<WorktreeWithAgents>('get_worktree', { id })
      }
      return request<WorktreeWithAgents>(`/api/workspaces/${workspaceId}/worktrees/${id}`)
    },

    create: async (workspaceId: string, data: CreateWorktreeDto) => {
      if (isTauri) {
        const input: CreateWorktreeInput = {
          workspaceId,
          name: data.name,
          branch: data.branch,
          createBranch: data.createBranch,
        }
        return tauriInvoke<Worktree>('create_worktree', { input })
      }
      return request<Worktree>(`/api/workspaces/${workspaceId}/worktrees`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    update: async (workspaceId: string, id: string, data: UpdateWorktreeDto) => {
      if (isTauri) {
        const input: UpdateWorktreeInput = {
          name: data.name,
          sortMode: data.sortMode,
          displayOrder: data.order,
        }
        return tauriInvoke<Worktree>('update_worktree', { id, input })
      }
      return request<Worktree>(`/api/workspaces/${workspaceId}/worktrees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    },

    delete: async (workspaceId: string, id: string, force = false) => {
      if (isTauri) {
        return tauriInvoke<void>('delete_worktree', { id })
      }
      return request<void>(`/api/workspaces/${workspaceId}/worktrees/${id}?force=${force}`, {
        method: 'DELETE',
      })
    },

    checkout: async (workspaceId: string, id: string, branch: string, createBranch = false) => {
      if (isTauri) {
        const input: CheckoutBranchInput = { branch, create: createBranch }
        return tauriInvoke<Worktree>('checkout_branch', { id, input })
      }
      return request<Worktree>(`/api/workspaces/${workspaceId}/worktrees/${id}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ branch, createBranch }),
      })
    },

    reorder: async (workspaceId: string, worktreeIds: string[]) => {
      if (isTauri) {
        const input: ReorderWorktreesInput = { worktreeIds }
        return tauriInvoke<Worktree[]>('reorder_worktrees', { workspaceId, input }).then(
          (worktrees) => ({
            worktrees: worktrees.map((w, i) => ({ id: w.id, order: i })),
          })
        )
      }
      return request<{ worktrees: { id: string; order: number }[] }>(
        `/api/workspaces/${workspaceId}/worktrees/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ worktreeIds }),
        }
      )
    },

    getStatus: async (workspaceId: string, id: string) => {
      if (isTauri) {
        return tauriInvoke<{
          branch: string
          ahead: number
          behind: number
          modified: string[]
          staged: string[]
          untracked: string[]
        }>('get_git_status', { id })
      }
      return request<{
        branch: string
        ahead: number
        behind: number
        modified: string[]
        staged: string[]
        untracked: string[]
      }>(`/api/workspaces/${workspaceId}/worktrees/${id}/status`)
    },

    getBranches: async (workspaceId: string, id: string) => {
      if (isTauri) {
        return tauriInvoke<{ current: string; local: string[]; remote: string[] }>(
          'list_branches',
          {
            id,
          }
        )
      }
      return request<{ current: string; local: string[]; remote: string[] }>(
        `/api/workspaces/${workspaceId}/worktrees/${id}/branches`
      )
    },
  },

  // Agents
  agents: {
    list: async (params?: {
      worktreeId?: string
      status?: AgentStatus
      includeDeleted?: boolean
    }) => {
      if (isTauri && params?.worktreeId) {
        return tauriInvoke<{ agents: Agent[] }>('list_agents', {
          worktreeId: params.worktreeId,
          includeDeleted: params.includeDeleted ?? false,
        })
      }
      const searchParams = new URLSearchParams()
      if (params?.worktreeId) searchParams.set('worktreeId', params.worktreeId)
      if (params?.status) searchParams.set('status', params.status)
      if (params?.includeDeleted) searchParams.set('includeDeleted', 'true')
      const query = searchParams.toString()
      return request<{ agents: Agent[] }>(`/api/agents${query ? `?${query}` : ''}`)
    },

    get: async (id: string) => {
      if (isTauri) {
        return tauriInvoke<Agent>('get_agent', { id })
      }
      return request<Agent>(`/api/agents/${id}`)
    },

    create: async (data: CreateAgentDto) => {
      if (isTauri) {
        const input: CreateAgentInput = {
          worktreeId: data.worktreeId,
          name: data.name,
          mode: data.mode,
          permissions: data.permissions,
        }
        return tauriInvoke<Agent>('create_agent', { input })
      }
      return request<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    update: async (id: string, data: UpdateAgentDto) => {
      if (isTauri) {
        const input: UpdateAgentInput = {
          name: data.name,
          mode: data.mode,
          permissions: data.permissions,
        }
        return tauriInvoke<Agent>('update_agent', { id, input })
      }
      return request<Agent>(`/api/agents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    },

    delete: async (id: string, archive = true) => {
      if (isTauri) {
        return tauriInvoke<void>('delete_agent', { id, archive })
      }
      return request<void>(`/api/agents/${id}?archive=${archive}`, {
        method: 'DELETE',
      })
    },

    fork: async (id: string, name?: string) => {
      if (isTauri) {
        return tauriInvoke<Agent>('fork_agent', { id, name })
      }
      return request<Agent>(`/api/agents/${id}/fork`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
    },

    restore: async (id: string) => {
      if (isTauri) {
        return tauriInvoke<Agent>('restore_agent', { id })
      }
      return request<Agent>(`/api/agents/${id}/restore`, {
        method: 'POST',
      })
    },

    reorder: async (worktreeId: string, agentIds: string[]) => {
      if (isTauri) {
        const input: ReorderAgentsInput = { agentIds }
        return tauriInvoke<Agent[]>('reorder_agents', { worktreeId, input }).then((agents) => ({
          agents: agents.map((a, i) => ({ id: a.id, order: i })),
        }))
      }
      return request<{ agents: { id: string; order: number }[] }>('/api/agents/reorder', {
        method: 'PUT',
        body: JSON.stringify({ worktreeId, agentIds }),
      })
    },

    // Process control
    start: async (id: string, worktreePath: string, initialPrompt?: string) => {
      if (isTauri) {
        return tauriInvoke<Agent>('start_agent', { id, worktreePath, initialPrompt })
      }
      return request<Agent>(`/api/agents/${id}/start`, {
        method: 'POST',
        body: JSON.stringify({ initialPrompt }),
      })
    },

    stop: async (id: string, force = false) => {
      if (isTauri) {
        return tauriInvoke<Agent>('stop_agent', { id, force })
      }
      return request<Agent>(`/api/agents/${id}/stop?force=${force}`, {
        method: 'POST',
      })
    },

    resume: async (id: string) => {
      // Resume uses the same start command with session_id
      if (isTauri) {
        // Get agent to retrieve worktree path for resume
        const agent = await tauriInvoke<Agent>('get_agent', { id })
        // Note: We need worktree path here - may need to fetch it
        return tauriInvoke<Agent>('start_agent', { id, worktreePath: '', initialPrompt: null })
      }
      return request<Agent>(`/api/agents/${id}/resume`, {
        method: 'POST',
      })
    },

    // Messages
    getMessages: async (id: string, limit = 100, before?: string) => {
      if (isTauri) {
        return tauriInvoke<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>(
          'get_agent_messages',
          { id, limit, before }
        )
      }
      const params = new URLSearchParams({ limit: String(limit) })
      if (before) params.set('before', before)
      return request<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>(
        `/api/agents/${id}/messages?${params}`
      )
    },

    sendMessage: async (id: string, content: string) => {
      if (isTauri) {
        const input: SendMessageInput = { content }
        return tauriInvoke<{ messageId: string; status: 'sent' | 'queued'; running: boolean }>(
          'send_message_to_agent',
          { id, input }
        )
      }
      return request<{ messageId: string; status: 'sent' | 'queued'; running: boolean }>(
        `/api/agents/${id}/message`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        }
      )
    },

    // Status
    getStatus: async (id: string) => {
      if (isTauri) {
        // Get full agent and extract status fields
        const agent = await tauriInvoke<Agent>('get_agent', { id })
        return {
          id: agent.id,
          status: agent.status,
          processStatus: null,
          isRunning: agent.status === 'running',
          contextLevel: agent.contextLevel,
          pid: agent.pid ?? null,
        }
      }
      return request<{
        id: string
        status: AgentStatus
        processStatus: string | null
        isRunning: boolean
        contextLevel: number
        pid: number | null
      }>(`/api/agents/${id}/status`)
    },
  },

  // Usage
  usage: {
    get: async () => {
      if (isTauri) {
        return tauriInvoke<UsageSummary>('get_usage')
      }
      return request<UsageSummary>('/api/usage')
    },

    getHistory: async (period: 'daily' | 'weekly' | 'monthly', start?: string, end?: string) => {
      if (isTauri) {
        return tauriInvoke<{ history: UsageHistoryEntry[] }>('get_usage_history', {
          period,
          limit: 30,
        })
      }
      const params = new URLSearchParams({ period })
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      return request<{ history: UsageHistoryEntry[] }>(`/api/usage/history?${params}`)
    },

    getToday: async () => {
      if (isTauri) {
        return tauriInvoke<{
          date: string
          tokensUsed: number
          requestCount: number
          inputTokens: number
          outputTokens: number
          errorCount: number
          modelUsage: Record<string, number> | null
        }>('get_usage_today')
      }
      return request<{
        date: string
        tokensUsed: number
        requestCount: number
        inputTokens: number
        outputTokens: number
        errorCount: number
        modelUsage: Record<string, number> | null
      }>('/api/usage/today')
    },

    getLimits: async () => {
      if (isTauri) {
        return tauriInvoke<UsageLimits>('get_usage_limits')
      }
      return request<UsageLimits>('/api/usage/limits')
    },
  },
}

// Dialog utilities
export async function openDirectoryPicker(): Promise<string | null> {
  if (!isTauri) {
    // Fallback for non-Tauri environments
    return prompt('Enter the path to a Git repository:')
  }
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { homeDir } = await import('@tauri-apps/api/path')

  const home = await homeDir()
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath: home,
    title: 'Select Git Repository',
  })

  return selected as string | null
}

// Export isTauri check for other modules
export { isTauri }
