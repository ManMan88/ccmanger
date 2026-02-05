export const queryKeys = {
  workspaces: {
    all: ['workspaces'] as const,
    detail: (id: string) => ['workspaces', id] as const,
  },
  worktrees: {
    all: (workspaceId: string) => ['worktrees', workspaceId] as const,
    detail: (workspaceId: string, id: string) => ['worktrees', workspaceId, id] as const,
    status: (workspaceId: string, id: string) => ['worktrees', workspaceId, id, 'status'] as const,
    branches: (workspaceId: string, id: string) =>
      ['worktrees', workspaceId, id, 'branches'] as const,
  },
  agents: {
    all: ['agents'] as const,
    byWorktree: (worktreeId: string) => ['agents', 'worktree', worktreeId] as const,
    detail: (id: string) => ['agents', id] as const,
    messages: (id: string) => ['agents', id, 'messages'] as const,
    status: (id: string) => ['agents', id, 'status'] as const,
  },
  usage: {
    current: ['usage'] as const,
    today: ['usage', 'today'] as const,
    limits: ['usage', 'limits'] as const,
    history: (period: string) => ['usage', 'history', period] as const,
  },
}
