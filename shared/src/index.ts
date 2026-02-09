// Database row types (snake_case, matches DB)
export interface WorkspaceRow {
  id: string
  name: string
  path: string
  created_at: string
  updated_at: string
  worktree_count: number
  agent_count: number
}

export interface WorktreeRow {
  id: string
  workspace_id: string
  name: string
  branch: string
  path: string
  sort_mode: 'free' | 'status' | 'name'
  display_order: number
  is_main: number // SQLite boolean
  created_at: string
  updated_at: string
}

export interface AgentRow {
  id: string
  worktree_id: string
  name: string
  status: AgentStatus
  context_level: number
  mode: AgentMode
  permissions: string // JSON array
  display_order: number
  pid: number | null
  session_id: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  stopped_at: string | null
  deleted_at: string | null
  parent_agent_id: string | null
}

export interface MessageRow {
  id: string
  agent_id: string
  role: MessageRole
  content: string
  token_count: number | null
  tool_name: string | null
  tool_input: string | null
  tool_output: string | null
  created_at: string
  is_complete: number
}

export interface UsageStatsRow {
  id: number
  date: string
  period: UsagePeriod
  input_tokens: number
  output_tokens: number
  total_tokens: number
  request_count: number
  error_count: number
  model_usage: string | null
  created_at: string
  updated_at: string
}

export interface SettingRow {
  key: string
  value: string
  type: SettingType
  description: string | null
  updated_at: string
}

export interface AgentSessionRow {
  id: string
  agent_id: string
  session_data: string
  context_snapshot: string | null
  created_at: string
  updated_at: string
}

// Enums and union types
export type AgentStatus = 'running' | 'waiting' | 'error' | 'idle'
export type AgentMode = 'auto' | 'plan' | 'regular'
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type UsagePeriod = 'daily' | 'weekly' | 'monthly'
export type SettingType = 'string' | 'number' | 'boolean' | 'json'
export type SortMode = 'free' | 'status' | 'name'

// API types (camelCase, for frontend use)
export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: string
  updatedAt: string
  worktreeCount: number
  agentCount: number
}

export interface Worktree {
  id: string
  workspaceId: string
  name: string
  branch: string
  path: string
  sortMode: SortMode
  displayOrder: number
  isMain: boolean
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: string
  worktreeId: string
  name: string
  status: AgentStatus
  contextLevel: number
  mode: AgentMode
  permissions: string[]
  displayOrder: number
  pid: number | null
  sessionId: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  stoppedAt: string | null
  deletedAt: string | null
  parentAgentId: string | null
}

export interface Message {
  id: string
  agentId: string
  role: MessageRole
  content: string
  tokenCount: number | null
  toolName: string | null
  toolInput: unknown | null
  toolOutput: unknown | null
  createdAt: string
  isComplete: boolean
}

export interface UsageStats {
  id: number
  date: string
  period: UsagePeriod
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requestCount: number
  errorCount: number
  modelUsage: Record<string, number> | null
  createdAt: string
  updatedAt: string
}

export interface Setting {
  key: string
  value: string
  type: SettingType
  description: string | null
  updatedAt: string
}

// Helper functions for converting between row and API types
export function workspaceRowToApi(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    worktreeCount: row.worktree_count,
    agentCount: row.agent_count,
  }
}

export function worktreeRowToApi(row: WorktreeRow): Worktree {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    branch: row.branch,
    path: row.path,
    sortMode: row.sort_mode,
    displayOrder: row.display_order,
    isMain: row.is_main === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function agentRowToApi(row: AgentRow): Agent {
  return {
    id: row.id,
    worktreeId: row.worktree_id,
    name: row.name,
    status: row.status,
    contextLevel: row.context_level,
    mode: row.mode,
    permissions: JSON.parse(row.permissions),
    displayOrder: row.display_order,
    pid: row.pid,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    deletedAt: row.deleted_at,
    parentAgentId: row.parent_agent_id,
  }
}

export function messageRowToApi(row: MessageRow): Message {
  return {
    id: row.id,
    agentId: row.agent_id,
    role: row.role,
    content: row.content,
    tokenCount: row.token_count,
    toolName: row.tool_name,
    toolInput: row.tool_input ? JSON.parse(row.tool_input) : null,
    toolOutput: row.tool_output ? JSON.parse(row.tool_output) : null,
    createdAt: row.created_at,
    isComplete: row.is_complete === 1,
  }
}

export function usageStatsRowToApi(row: UsageStatsRow): UsageStats {
  return {
    id: row.id,
    date: row.date,
    period: row.period,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    requestCount: row.request_count,
    errorCount: row.error_count,
    modelUsage: row.model_usage ? JSON.parse(row.model_usage) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ID generation utility
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `${prefix}_${timestamp}${random}`
}
