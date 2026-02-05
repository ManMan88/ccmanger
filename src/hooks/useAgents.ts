import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type CreateAgentDto, type UpdateAgentDto } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Agent, Message } from '@claude-manager/shared'

/**
 * Hook for managing agents in a worktree
 */
export function useAgents(worktreeId: string | null) {
  const queryClient = useQueryClient()

  // Fetch agents for worktree
  const agentsQuery = useQuery({
    queryKey: worktreeId ? queryKeys.agents.byWorktree(worktreeId) : ['agents', 'none'],
    queryFn: () => api.agents.list({ worktreeId: worktreeId! }),
    enabled: !!worktreeId,
    select: (data) => data.agents,
  })

  // Create agent
  const createAgentMutation = useMutation({
    mutationFn: (data: Omit<CreateAgentDto, 'worktreeId'>) =>
      api.agents.create({ ...data, worktreeId: worktreeId! }),
    onSuccess: () => {
      if (worktreeId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.byWorktree(worktreeId),
        })
      }
      // Also invalidate workspace to get updated agent counts
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.all,
      })
    },
  })

  // Update agent
  const updateAgentMutation = useMutation({
    mutationFn: ({ agentId, ...data }: { agentId: string } & UpdateAgentDto) =>
      api.agents.update(agentId, data),
    onMutate: async ({ agentId, ...updates }) => {
      if (!worktreeId) return

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
      if (context?.previousAgents && worktreeId) {
        queryClient.setQueryData(queryKeys.agents.byWorktree(worktreeId), context.previousAgents)
      }
    },
    onSettled: () => {
      if (worktreeId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.byWorktree(worktreeId),
        })
      }
    },
  })

  // Delete agent
  const deleteAgentMutation = useMutation({
    mutationFn: ({ agentId, archive = true }: { agentId: string; archive?: boolean }) =>
      api.agents.delete(agentId, archive),
    onSuccess: () => {
      if (worktreeId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.byWorktree(worktreeId),
        })
      }
      // Also invalidate workspace to get updated agent counts
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.all,
      })
    },
  })

  // Fork agent
  const forkAgentMutation = useMutation({
    mutationFn: ({ agentId, name }: { agentId: string; name?: string }) =>
      api.agents.fork(agentId, name),
    onSuccess: () => {
      if (worktreeId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.byWorktree(worktreeId),
        })
      }
      // Also invalidate workspace to get updated agent counts
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.all,
      })
    },
  })

  // Restore agent
  const restoreAgentMutation = useMutation({
    mutationFn: (agentId: string) => api.agents.restore(agentId),
    onSuccess: () => {
      if (worktreeId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.byWorktree(worktreeId),
        })
      }
    },
  })

  // Reorder agents
  const reorderAgentsMutation = useMutation({
    mutationFn: (agentIds: string[]) => api.agents.reorder(worktreeId!, agentIds),
    onMutate: async (agentIds) => {
      if (!worktreeId) return

      await queryClient.cancelQueries({
        queryKey: queryKeys.agents.byWorktree(worktreeId),
      })

      const previousAgents = queryClient.getQueryData<{ agents: Agent[] }>(
        queryKeys.agents.byWorktree(worktreeId)
      )

      if (previousAgents) {
        const reordered = agentIds
          .map((id, index) => {
            const agent = previousAgents.agents.find((a) => a.id === id)
            return agent ? { ...agent, displayOrder: index } : null
          })
          .filter(Boolean) as Agent[]

        queryClient.setQueryData(queryKeys.agents.byWorktree(worktreeId), { agents: reordered })
      }

      return { previousAgents }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAgents && worktreeId) {
        queryClient.setQueryData(queryKeys.agents.byWorktree(worktreeId), context.previousAgents)
      }
    },
  })

  // Start agent
  const startAgentMutation = useMutation({
    mutationFn: ({ agentId, initialPrompt }: { agentId: string; initialPrompt?: string }) =>
      api.agents.start(agentId, initialPrompt),
    onSuccess: (agent) => {
      queryClient.setQueryData(queryKeys.agents.detail(agent.id), agent)
      if (worktreeId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.byWorktree(worktreeId),
        })
      }
    },
  })

  // Stop agent
  const stopAgentMutation = useMutation({
    mutationFn: ({ agentId, force = false }: { agentId: string; force?: boolean }) =>
      api.agents.stop(agentId, force),
    onSuccess: (agent) => {
      queryClient.setQueryData(queryKeys.agents.detail(agent.id), agent)
      if (worktreeId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.byWorktree(worktreeId),
        })
      }
    },
  })

  // Resume agent
  const resumeAgentMutation = useMutation({
    mutationFn: (agentId: string) => api.agents.resume(agentId),
    onSuccess: (agent) => {
      queryClient.setQueryData(queryKeys.agents.detail(agent.id), agent)
      if (worktreeId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.byWorktree(worktreeId),
        })
      }
    },
  })

  return {
    agents: agentsQuery.data ?? [],
    isLoading: agentsQuery.isLoading,
    isError: agentsQuery.isError,
    error: agentsQuery.error,

    createAgent: createAgentMutation.mutate,
    updateAgent: updateAgentMutation.mutate,
    deleteAgent: deleteAgentMutation.mutate,
    forkAgent: forkAgentMutation.mutate,
    restoreAgent: restoreAgentMutation.mutate,
    reorderAgents: reorderAgentsMutation.mutate,

    startAgent: startAgentMutation.mutate,
    stopAgent: stopAgentMutation.mutate,
    resumeAgent: resumeAgentMutation.mutate,

    isCreating: createAgentMutation.isPending,
    isUpdating: updateAgentMutation.isPending,
    isDeleting: deleteAgentMutation.isPending,
  }
}

/**
 * Hook for a single agent with messages
 */
export function useAgent(agentId: string | null) {
  const queryClient = useQueryClient()

  const agentQuery = useQuery({
    queryKey: agentId ? queryKeys.agents.detail(agentId) : ['agents', 'none'],
    queryFn: () => api.agents.get(agentId!),
    enabled: !!agentId,
  })

  const messagesQuery = useQuery({
    queryKey: agentId ? queryKeys.agents.messages(agentId) : ['agents', 'none', 'messages'],
    queryFn: () => api.agents.getMessages(agentId!),
    enabled: !!agentId,
  })

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => api.agents.sendMessage(agentId!, content),
    onMutate: async (content) => {
      if (!agentId) return

      // Optimistically add user message
      const previousMessages = queryClient.getQueryData<{
        messages: Message[]
        hasMore: boolean
      }>(queryKeys.agents.messages(agentId))

      if (previousMessages) {
        const newMessage: Message = {
          id: `temp_${Date.now()}`,
          agentId,
          role: 'user',
          content,
          tokenCount: null,
          toolName: null,
          toolInput: null,
          toolOutput: null,
          createdAt: new Date().toISOString(),
          isComplete: true,
        }

        queryClient.setQueryData(queryKeys.agents.messages(agentId), {
          ...previousMessages,
          messages: [...previousMessages.messages, newMessage],
        })
      }

      return { previousMessages }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousMessages && agentId) {
        queryClient.setQueryData(queryKeys.agents.messages(agentId), context.previousMessages)
      }
    },
    // Messages will be updated via WebSocket, so no need to invalidate
  })

  const stopAgentMutation = useMutation({
    mutationFn: (force = false) => api.agents.stop(agentId!, force),
    onSuccess: (data) => {
      if (agentId) {
        queryClient.setQueryData(queryKeys.agents.detail(agentId), data)
      }
    },
  })

  const startAgentMutation = useMutation({
    mutationFn: (initialPrompt?: string) => api.agents.start(agentId!, initialPrompt),
    onSuccess: (data) => {
      if (agentId) {
        queryClient.setQueryData(queryKeys.agents.detail(agentId), data)
      }
    },
  })

  const resumeAgentMutation = useMutation({
    mutationFn: () => api.agents.resume(agentId!),
    onSuccess: (data) => {
      if (agentId) {
        queryClient.setQueryData(queryKeys.agents.detail(agentId), data)
      }
    },
  })

  return {
    agent: agentQuery.data ?? null,
    messages: messagesQuery.data?.messages ?? [],
    hasMoreMessages: messagesQuery.data?.hasMore ?? false,
    isLoading: agentQuery.isLoading || messagesQuery.isLoading,
    isLoadingMessages: messagesQuery.isLoading,
    isError: agentQuery.isError || messagesQuery.isError,

    sendMessage: sendMessageMutation.mutate,
    stopAgent: stopAgentMutation.mutate,
    startAgent: startAgentMutation.mutate,
    resumeAgent: resumeAgentMutation.mutate,

    isSending: sendMessageMutation.isPending,
    isStopping: stopAgentMutation.isPending,
    isStarting: startAgentMutation.isPending,
    isResuming: resumeAgentMutation.isPending,

    refetchMessages: () =>
      queryClient.invalidateQueries({
        queryKey: agentId ? queryKeys.agents.messages(agentId) : ['none'],
      }),
  }
}
