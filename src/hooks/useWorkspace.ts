import { useState, useCallback } from 'react';
import { Workspace, Worktree, Agent, AgentStatus, AgentMode, AgentSortMode } from '@/types/agent';

const generateId = () => Math.random().toString(36).substring(2, 9);

const createDefaultAgent = (worktreeId: string, order: number): Agent => ({
  id: generateId(),
  name: `Agent ${order + 1}`,
  status: 'finished' as AgentStatus,
  contextLevel: Math.floor(Math.random() * 60) + 10,
  mode: 'regular' as AgentMode,
  permissions: ['read', 'write'],
  worktreeId,
  createdAt: new Date(),
  order,
});

const mockWorkspace: Workspace = {
  id: '1',
  name: 'agent-master',
  path: '/Users/dev/projects/agent-master',
  worktrees: [
    {
      id: 'wt1',
      name: 'main',
      branch: 'main',
      path: '/Users/dev/projects/agent-master',
      agents: [
        { ...createDefaultAgent('wt1', 0), name: 'Feature Builder', status: 'running', contextLevel: 45 },
        { ...createDefaultAgent('wt1', 1), name: 'Test Writer', status: 'waiting', contextLevel: 72 },
      ],
      previousAgents: [],
      sortMode: 'free',
      order: 0,
    },
    {
      id: 'wt2',
      name: 'feature/ui-redesign',
      branch: 'feature/ui-redesign',
      path: '/Users/dev/projects/agent-master-ui',
      agents: [
        { ...createDefaultAgent('wt2', 0), name: 'UI Agent', status: 'error', contextLevel: 88 },
      ],
      previousAgents: [
        { ...createDefaultAgent('wt2', 0), name: 'Old Agent 1', status: 'finished', contextLevel: 100 },
      ],
      sortMode: 'free',
      order: 1,
    },
    {
      id: 'wt3',
      name: 'fix/auth-bug',
      branch: 'fix/auth-bug',
      path: '/Users/dev/projects/agent-master-fix',
      agents: [],
      previousAgents: [],
      sortMode: 'free',
      order: 2,
    },
  ],
};

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(mockWorkspace);

  const addWorktree = useCallback((name: string, branch: string) => {
    if (!workspace) return;
    const newWorktree: Worktree = {
      id: generateId(),
      name,
      branch,
      path: `${workspace.path}-${name}`,
      agents: [],
      previousAgents: [],
      sortMode: 'free',
      order: workspace.worktrees.length,
    };
    setWorkspace({
      ...workspace,
      worktrees: [...workspace.worktrees, newWorktree],
    });
  }, [workspace]);

  const removeWorktree = useCallback((worktreeId: string) => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      worktrees: workspace.worktrees.filter(wt => wt.id !== worktreeId),
    });
  }, [workspace]);

  const checkoutBranch = useCallback((worktreeId: string, branch: string) => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      worktrees: workspace.worktrees.map(wt =>
        wt.id === worktreeId ? { ...wt, branch } : wt
      ),
    });
  }, [workspace]);

  const addAgent = useCallback((worktreeId: string) => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      worktrees: workspace.worktrees.map(wt => {
        if (wt.id !== worktreeId) return wt;
        const newAgent = createDefaultAgent(worktreeId, wt.agents.length);
        return { ...wt, agents: [...wt.agents, newAgent] };
      }),
    });
  }, [workspace]);

  const removeAgent = useCallback((worktreeId: string, agentId: string) => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      worktrees: workspace.worktrees.map(wt => {
        if (wt.id !== worktreeId) return wt;
        const agent = wt.agents.find(a => a.id === agentId);
        return {
          ...wt,
          agents: wt.agents.filter(a => a.id !== agentId),
          previousAgents: agent ? [...wt.previousAgents, { ...agent, status: 'finished' as AgentStatus }] : wt.previousAgents,
        };
      }),
    });
  }, [workspace]);

  const updateAgent = useCallback((worktreeId: string, agentId: string, updates: Partial<Agent>) => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      worktrees: workspace.worktrees.map(wt => {
        if (wt.id !== worktreeId) return wt;
        return {
          ...wt,
          agents: wt.agents.map(a =>
            a.id === agentId ? { ...a, ...updates } : a
          ),
        };
      }),
    });
  }, [workspace]);

  const forkAgent = useCallback((worktreeId: string, agentId: string) => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      worktrees: workspace.worktrees.map(wt => {
        if (wt.id !== worktreeId) return wt;
        const agent = wt.agents.find(a => a.id === agentId);
        if (!agent) return wt;
        const forkedAgent: Agent = {
          ...agent,
          id: generateId(),
          name: `${agent.name} (fork)`,
          order: wt.agents.length,
          createdAt: new Date(),
        };
        return { ...wt, agents: [...wt.agents, forkedAgent] };
      }),
    });
  }, [workspace]);

  const reorderAgents = useCallback((worktreeId: string, agentIds: string[]) => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      worktrees: workspace.worktrees.map(wt => {
        if (wt.id !== worktreeId) return wt;
        const reorderedAgents = agentIds.map((id, index) => {
          const agent = wt.agents.find(a => a.id === id);
          return agent ? { ...agent, order: index } : null;
        }).filter(Boolean) as Agent[];
        return { ...wt, agents: reorderedAgents };
      }),
    });
  }, [workspace]);

  const loadPreviousAgent = useCallback((worktreeId: string, agentId: string) => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      worktrees: workspace.worktrees.map(wt => {
        if (wt.id !== worktreeId) return wt;
        const agent = wt.previousAgents.find(a => a.id === agentId);
        if (!agent) return wt;
        const restoredAgent: Agent = {
          ...agent,
          id: generateId(),
          order: wt.agents.length,
          createdAt: new Date(),
        };
        return {
          ...wt,
          agents: [...wt.agents, restoredAgent],
          previousAgents: wt.previousAgents.filter(a => a.id !== agentId),
        };
      }),
    });
  }, [workspace]);

  const setSortMode = useCallback((worktreeId: string, sortMode: AgentSortMode) => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      worktrees: workspace.worktrees.map(wt =>
        wt.id === worktreeId ? { ...wt, sortMode } : wt
      ),
    });
  }, [workspace]);

  const reorderWorktrees = useCallback((worktreeIds: string[]) => {
    if (!workspace) return;
    const reorderedWorktrees = worktreeIds.map((id, index) => {
      const worktree = workspace.worktrees.find(wt => wt.id === id);
      return worktree ? { ...worktree, order: index } : null;
    }).filter(Boolean) as Worktree[];
    setWorkspace({
      ...workspace,
      worktrees: reorderedWorktrees,
    });
  }, [workspace]);

  return {
    workspace,
    setWorkspace,
    addWorktree,
    removeWorktree,
    checkoutBranch,
    addAgent,
    removeAgent,
    updateAgent,
    forkAgent,
    reorderAgents,
    loadPreviousAgent,
    setSortMode,
    reorderWorktrees,
  };
}
