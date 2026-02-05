import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  api,
  type WorkspaceWithDetails,
  type CreateWorktreeDto,
  type UpdateWorktreeDto,
  type CreateAgentDto,
  type UpdateAgentDto,
} from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Agent, Workspace, SortMode } from '@claude-manager/shared'

// Re-export types that components might need
export type { WorkspaceWithDetails } from '@/lib/api'

// Adapter type to match old frontend interface
export interface WorktreeWithAgentsCompat {
  id: string
  name: string
  branch: string
  path: string
  agents: Agent[]
  previousAgents: Agent[]
  sortMode: SortMode
  order: number
}

export interface WorkspaceCompat {
  id: string
  name: string
  path: string
  worktrees: WorktreeWithAgentsCompat[]
}

/**
 * Transform API workspace data to the format expected by existing components
 */
function transformWorkspace(workspace: WorkspaceWithDetails | null): WorkspaceCompat | null {
  if (!workspace) return null

  return {
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    worktrees: workspace.worktrees.map((wt) => ({
      id: wt.id,
      name: wt.name,
      branch: wt.branch,
      path: wt.path,
      agents: wt.agents.map((a) => ({
        ...a,
        createdAt: a.createdAt,
        order: a.displayOrder,
      })),
      previousAgents: wt.previousAgents.map((a) => ({
        ...a,
        createdAt: a.createdAt,
        order: a.displayOrder,
      })),
      sortMode: wt.sortMode,
      order: wt.displayOrder,
    })),
  }
}

/**
 * Hook for listing all workspaces
 */
export function useWorkspaces() {
  const queryClient = useQueryClient()

  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces.all,
    queryFn: () => api.workspaces.list(),
    select: (data) => data.workspaces,
  })

  const createWorkspaceMutation = useMutation({
    mutationFn: (path: string) => api.workspaces.create(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all })
    },
  })

  const deleteWorkspaceMutation = useMutation({
    mutationFn: (id: string) => api.workspaces.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all })
    },
  })

  return {
    workspaces: workspacesQuery.data ?? [],
    isLoading: workspacesQuery.isLoading,
    isError: workspacesQuery.isError,
    error: workspacesQuery.error,

    createWorkspace: createWorkspaceMutation.mutate,
    deleteWorkspace: deleteWorkspaceMutation.mutate,
    isCreating: createWorkspaceMutation.isPending,
    isDeleting: deleteWorkspaceMutation.isPending,
  }
}

/**
 * Main hook for workspace state management (replacement for mock useWorkspace)
 */
export function useWorkspace(workspaceId: string | null) {
  const queryClient = useQueryClient()

  // Fetch workspace with details
  const workspaceQuery = useQuery({
    queryKey: workspaceId ? queryKeys.workspaces.detail(workspaceId) : ['workspaces', 'none'],
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
    mutationFn: ({ worktreeId, force = false }: { worktreeId: string; force?: boolean }) =>
      api.worktrees.delete(workspaceId!, worktreeId, force),
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
          return { ...wt, displayOrder: index }
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

  // Refresh workspace (re-sync with git)
  const refreshWorkspaceMutation = useMutation({
    mutationFn: () => api.workspaces.refresh(workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  // Agent mutations
  const addAgentMutation = useMutation({
    mutationFn: (data: CreateAgentDto) => api.agents.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  const removeAgentMutation = useMutation({
    mutationFn: ({ agentId, archive = true }: { agentId: string; archive?: boolean }) =>
      api.agents.delete(agentId, archive),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  const updateAgentMutation = useMutation({
    mutationFn: ({ agentId, ...data }: { agentId: string } & UpdateAgentDto) =>
      api.agents.update(agentId, data),
    onMutate: async ({ agentId, ...updates }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })

      const previousWorkspace = queryClient.getQueryData<WorkspaceWithDetails>(
        queryKeys.workspaces.detail(workspaceId!)
      )

      if (previousWorkspace) {
        const updatedWorktrees = previousWorkspace.worktrees.map((wt) => ({
          ...wt,
          agents: wt.agents.map((a) => (a.id === agentId ? { ...a, ...updates } : a)),
        }))

        queryClient.setQueryData(queryKeys.workspaces.detail(workspaceId!), {
          ...previousWorkspace,
          worktrees: updatedWorktrees,
        })
      }

      return { previousWorkspace }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousWorkspace) {
        queryClient.setQueryData(
          queryKeys.workspaces.detail(workspaceId!),
          context.previousWorkspace
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  const forkAgentMutation = useMutation({
    mutationFn: ({ agentId, name }: { agentId: string; name?: string }) =>
      api.agents.fork(agentId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  const restoreAgentMutation = useMutation({
    mutationFn: (agentId: string) => api.agents.restore(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })
    },
  })

  const reorderAgentsMutation = useMutation({
    mutationFn: ({ worktreeId, agentIds }: { worktreeId: string; agentIds: string[] }) =>
      api.agents.reorder(worktreeId, agentIds),
    onMutate: async ({ worktreeId, agentIds }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.workspaces.detail(workspaceId!),
      })

      const previousWorkspace = queryClient.getQueryData<WorkspaceWithDetails>(
        queryKeys.workspaces.detail(workspaceId!)
      )

      if (previousWorkspace) {
        const updatedWorktrees = previousWorkspace.worktrees.map((wt) => {
          if (wt.id !== worktreeId) return wt

          const reorderedAgents = agentIds.map((id, index) => {
            const agent = wt.agents.find((a) => a.id === id)!
            return { ...agent, displayOrder: index }
          })

          return { ...wt, agents: reorderedAgents }
        })

        queryClient.setQueryData(queryKeys.workspaces.detail(workspaceId!), {
          ...previousWorkspace,
          worktrees: updatedWorktrees,
        })
      }

      return { previousWorkspace }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousWorkspace) {
        queryClient.setQueryData(
          queryKeys.workspaces.detail(workspaceId!),
          context.previousWorkspace
        )
      }
    },
  })

  // Transform workspace data to match old interface
  const workspace = transformWorkspace(workspaceQuery.data ?? null)

  // Wrapper functions to match old interface
  const addWorktree = (name: string, branch: string) => {
    addWorktreeMutation.mutate({ name, branch })
  }

  const removeWorktree = (worktreeId: string) => {
    removeWorktreeMutation.mutate({ worktreeId })
  }

  const checkoutBranch = (worktreeId: string, branch: string) => {
    checkoutBranchMutation.mutate({ worktreeId, branch })
  }

  const addAgent = (worktreeId: string) => {
    addAgentMutation.mutate({ worktreeId })
  }

  const removeAgent = (_worktreeId: string, agentId: string) => {
    removeAgentMutation.mutate({ agentId })
  }

  const updateAgent = (_worktreeId: string, agentId: string, updates: Partial<Agent>) => {
    updateAgentMutation.mutate({ agentId, ...updates })
  }

  const forkAgent = (_worktreeId: string, agentId: string) => {
    forkAgentMutation.mutate({ agentId })
  }

  const reorderAgents = (worktreeId: string, agentIds: string[]) => {
    reorderAgentsMutation.mutate({ worktreeId, agentIds })
  }

  const loadPreviousAgent = (_worktreeId: string, agentId: string) => {
    restoreAgentMutation.mutate(agentId)
  }

  const setSortMode = (worktreeId: string, sortMode: SortMode) => {
    updateWorktreeMutation.mutate({ worktreeId, sortMode })
  }

  const reorderWorktrees = (worktreeIds: string[]) => {
    reorderWorktreesMutation.mutate(worktreeIds)
  }

  return {
    workspace,
    isLoading: workspaceQuery.isLoading,
    isError: workspaceQuery.isError,
    error: workspaceQuery.error,

    // Worktree operations
    addWorktree,
    removeWorktree,
    checkoutBranch,
    setSortMode,
    reorderWorktrees,

    // Agent operations
    addAgent,
    removeAgent,
    updateAgent,
    forkAgent,
    reorderAgents,
    loadPreviousAgent,

    // Raw API data
    workspaceData: workspaceQuery.data ?? null,

    // Mutation states
    isAddingWorktree: addWorktreeMutation.isPending,
    isRemovingWorktree: removeWorktreeMutation.isPending,
    isAddingAgent: addAgentMutation.isPending,
    isRefreshing: refreshWorkspaceMutation.isPending,

    // Refresh
    refresh: refreshWorkspaceMutation.mutate,
  }
}
