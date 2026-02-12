import type {
  Workspace,
  Worktree,
  Agent,
  SortMode,
  AgentStatus,
  AgentMode,
  Permission,
} from '@claude-manager/shared'

// Tauri invoke function
async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
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

interface ReorderAgentsInput {
  agentIds: string[]
}

// API Methods
export const api = {
  // Workspaces
  workspaces: {
    list: async () => {
      return tauriInvoke<{ workspaces: Workspace[] }>('list_workspaces')
    },

    get: async (id: string) => {
      return tauriInvoke<WorkspaceWithDetails>('get_workspace', { id })
    },

    create: async (path: string, name?: string) => {
      const input: CreateWorkspaceInput = { path, name }
      return tauriInvoke<Workspace>('create_workspace', { input })
    },

    delete: async (id: string) => {
      return tauriInvoke<void>('delete_workspace', { id })
    },

    refresh: async (id: string) => {
      return tauriInvoke<WorkspaceWithDetails>('refresh_workspace', { id })
    },
  },

  // Worktrees
  worktrees: {
    list: async (workspaceId: string) => {
      return tauriInvoke<{ worktrees: Worktree[] }>('list_worktrees', { workspaceId })
    },

    get: async (_workspaceId: string, id: string) => {
      return tauriInvoke<WorktreeWithAgents>('get_worktree', { id })
    },

    create: async (workspaceId: string, data: CreateWorktreeDto) => {
      const input: CreateWorktreeInput = {
        workspaceId,
        name: data.name,
        branch: data.branch,
        createBranch: data.createBranch,
      }
      return tauriInvoke<Worktree>('create_worktree', { input })
    },

    update: async (_workspaceId: string, id: string, data: UpdateWorktreeDto) => {
      const input: UpdateWorktreeInput = {
        name: data.name,
        sortMode: data.sortMode,
        displayOrder: data.order,
      }
      return tauriInvoke<Worktree>('update_worktree', { id, input })
    },

    delete: async (_workspaceId: string, id: string) => {
      return tauriInvoke<void>('delete_worktree', { id })
    },

    checkout: async (_workspaceId: string, id: string, branch: string, createBranch = false) => {
      const input: CheckoutBranchInput = { branch, create: createBranch }
      return tauriInvoke<Worktree>('checkout_branch', { id, input })
    },

    reorder: async (workspaceId: string, worktreeIds: string[]) => {
      const input: ReorderWorktreesInput = { worktreeIds }
      return tauriInvoke<Worktree[]>('reorder_worktrees', { workspaceId, input }).then(
        (worktrees) => ({
          worktrees: worktrees.map((w, i) => ({ id: w.id, order: i })),
        })
      )
    },

    getStatus: async (_workspaceId: string, id: string) => {
      return tauriInvoke<{
        branch: string
        ahead: number
        behind: number
        modified: string[]
        staged: string[]
        untracked: string[]
      }>('get_git_status', { id })
    },

    getBranches: async (_workspaceId: string, id: string) => {
      return tauriInvoke<{ current: string; local: string[]; remote: string[] }>('list_branches', {
        id,
      })
    },
  },

  // Agents
  agents: {
    list: async (params?: {
      worktreeId?: string
      status?: AgentStatus
      includeDeleted?: boolean
    }) => {
      return tauriInvoke<{ agents: Agent[] }>('list_agents', {
        worktreeId: params?.worktreeId,
        includeDeleted: params?.includeDeleted ?? false,
      })
    },

    get: async (id: string) => {
      return tauriInvoke<Agent>('get_agent', { id })
    },

    create: async (data: CreateAgentDto) => {
      const input: CreateAgentInput = {
        worktreeId: data.worktreeId,
        name: data.name,
        mode: data.mode,
        permissions: data.permissions,
      }
      return tauriInvoke<Agent>('create_agent', { input })
    },

    update: async (id: string, data: UpdateAgentDto) => {
      const input: UpdateAgentInput = {
        name: data.name,
        mode: data.mode,
        permissions: data.permissions,
      }
      return tauriInvoke<Agent>('update_agent', { id, input })
    },

    delete: async (id: string, archive = true) => {
      return tauriInvoke<void>('delete_agent', { id, archive })
    },

    restore: async (id: string) => {
      return tauriInvoke<Agent>('restore_agent', { id })
    },

    reorder: async (worktreeId: string, agentIds: string[]) => {
      const input: ReorderAgentsInput = { agentIds }
      return tauriInvoke<Agent[]>('reorder_agents', { worktreeId, input }).then((agents) => ({
        agents: agents.map((a, i) => ({ id: a.id, order: i })),
      }))
    },

    // Process control
    start: async (id: string, initialPrompt?: string) => {
      return tauriInvoke<Agent>('start_agent', { id, initialPrompt })
    },

    stop: async (id: string, force = false) => {
      return tauriInvoke<Agent>('stop_agent', { id, force })
    },

    resume: async (id: string) => {
      return tauriInvoke<Agent>('start_agent', { id, initialPrompt: null })
    },

    // Status
    getStatus: async (id: string) => {
      const agent = await tauriInvoke<Agent>('get_agent', { id })
      return {
        id: agent.id,
        status: agent.status,
        processStatus: null,
        isRunning: agent.status === 'running',
        contextLevel: agent.contextLevel,
        pid: agent.pid ?? null,
      }
    },
  },

  // Usage
  usage: {
    get: async () => {
      return tauriInvoke<UsageSummary>('get_claude_usage')
    },

    getHistory: async (period: 'daily' | 'weekly' | 'monthly', _start?: string, _end?: string) => {
      return tauriInvoke<{ history: UsageHistoryEntry[] }>('get_usage_history', {
        period,
        limit: 30,
      })
    },

    getToday: async () => {
      return tauriInvoke<{
        date: string
        tokensUsed: number
        requestCount: number
        inputTokens: number
        outputTokens: number
        errorCount: number
        modelUsage: Record<string, number> | null
      }>('get_usage_today')
    },

    getLimits: async () => {
      return tauriInvoke<UsageLimits>('get_usage_limits')
    },
  },
}

// Dialog utilities
export async function openDirectoryPicker(): Promise<string | null> {
  try {
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
  } catch (error) {
    console.error('Failed to open directory picker:', error)
    return null
  }
}
