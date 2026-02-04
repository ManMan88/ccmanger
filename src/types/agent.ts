export type AgentStatus = 'running' | 'waiting' | 'error' | 'finished';
export type AgentMode = 'auto' | 'plan' | 'regular';
export type AgentSortMode = 'free' | 'status' | 'name';

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  contextLevel: number; // 0-100
  mode: AgentMode;
  permissions: string[];
  worktreeId: string;
  createdAt: Date;
  order: number;
}

export interface Worktree {
  id: string;
  name: string;
  branch: string;
  path: string;
  agents: Agent[];
  previousAgents: Agent[];
  sortMode: AgentSortMode;
  order: number;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  worktrees: Worktree[];
}

export interface UsageLimit {
  used: number;
  limit: number;
  resetTime: Date;
}

export interface UsageStats {
  daily: UsageLimit;
  weekly: UsageLimit;
  sonnetOnly: UsageLimit;
}
