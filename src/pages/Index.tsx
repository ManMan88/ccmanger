import { useState, useEffect, useRef } from 'react'
import { Toolbar } from '@/components/Toolbar'
import { WorktreeRow } from '@/components/WorktreeRow'
import { UsageBar } from '@/components/UsageBar'
import { AgentModal } from '@/components/AgentModal'
import { AddWorktreeDialog } from '@/components/AddWorktreeDialog'
import { SettingsDialog } from '@/components/SettingsDialog'
import { useTheme } from '@/hooks/useTheme'
import { useWorkspace, useWorkspaces, type WorktreeWithAgentsCompat } from '@/hooks/useWorkspace'
import { useUsage, formatUsageForDisplay } from '@/hooks/useUsage'
import { useWebSocket, useWorkspaceSubscription } from '@/hooks/useWebSocket'
import { Button } from '@/components/ui/button'
import { Plus, FolderOpen, Loader2, WifiOff, RefreshCw } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Agent } from '@claude-manager/shared'
import { openDirectoryPicker } from '@/lib/api'

const Index = () => {
  const { theme, toggleTheme } = useTheme()

  // Workspace list and selection
  const { workspaces, isLoading: isLoadingWorkspaces, createWorkspace } = useWorkspaces()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)

  // Selected workspace data
  const {
    workspace,
    isLoading: isLoadingWorkspace,
    isError,
    error,
    addWorktree,
    removeWorktree,
    checkoutBranch,
    addAgent,
    removeAgent,
    updateAgent,
    reorderAgents,
    loadPreviousAgent,
    setSortMode,
    reorderWorktrees,
    refresh,
    isRefreshing,
  } = useWorkspace(selectedWorkspaceId)

  // Usage stats
  const { stats: usageStats, isLoading: isLoadingUsage } = useUsage()
  const formattedUsage = formatUsageForDisplay(usageStats)

  // WebSocket connection
  const { isConnected, status: wsStatus, reconnect } = useWebSocket()

  // Subscribe to workspace updates when selected
  useWorkspaceSubscription(selectedWorkspaceId)

  // UI state
  const [selectedWorktree, setSelectedWorktree] = useState<WorktreeWithAgentsCompat | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [addWorktreeOpen, setAddWorktreeOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draggedWorktreeId, setDraggedWorktreeId] = useState<string | null>(null)
  const draggedWorktreeIdRef = useRef<string | null>(null)
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)

  // Auto-select first workspace if none selected
  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].id)
    }
  }, [selectedWorkspaceId, workspaces])

  const handleOpenWorkspace = async () => {
    const path = await openDirectoryPicker()
    if (path) {
      try {
        createWorkspace(path)
      } catch (err) {
        console.error('Failed to open workspace:', err)
      }
    }
  }

  const handleSelectAgent = (agent: Agent, worktree: WorktreeWithAgentsCompat) => {
    setSelectedWorktree(worktree)
    setSelectedAgentId(agent.id)
  }

  const handleWorktreeDragStart = (e: React.DragEvent, worktreeId: string) => {
    e.dataTransfer.setData('text/plain', worktreeId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedWorktreeId(worktreeId)
    draggedWorktreeIdRef.current = worktreeId
    if (workspace) {
      setDragOrder(workspace.worktrees.map((wt) => wt.id))
    }
  }

  const handleWorktreeDragOver = (e: React.DragEvent, targetWorktreeId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const dragged = draggedWorktreeIdRef.current
    if (!dragged || dragged === targetWorktreeId) return

    setDragOrder((prev) => {
      if (!prev) return prev
      const draggedIndex = prev.indexOf(dragged)
      const targetIndex = prev.indexOf(targetWorktreeId)
      if (draggedIndex === -1 || targetIndex === -1) return prev
      const newOrder = [...prev]
      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, dragged)
      return newOrder
    })
  }

  const handleWorktreeDrop = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleWorktreeDragEnd = () => {
    setDraggedWorktreeId(null)
    draggedWorktreeIdRef.current = null
    if (dragOrder && workspace) {
      const originalOrder = workspace.worktrees.map((wt) => wt.id)
      const orderChanged = dragOrder.some((id, i) => id !== originalOrder[i])
      if (orderChanged) {
        reorderWorktrees(dragOrder)
        return // keep dragOrder set — effects handle cleanup
      }
    }
    setDragOrder(null)
  }

  // Clear dragOrder once the workspace cache reflects the new order
  const workspaceOrder = workspace?.worktrees.map((wt) => wt.id).join(',') ?? ''

  useEffect(() => {
    if (dragOrder && !draggedWorktreeId && workspaceOrder === dragOrder.join(',')) {
      setDragOrder(null)
    }
  }, [dragOrder, draggedWorktreeId, workspaceOrder])

  // Safety timeout: clear dragOrder after 1s if the cache never catches up
  useEffect(() => {
    if (dragOrder && !draggedWorktreeId) {
      const timer = setTimeout(() => setDragOrder(null), 1000)
      return () => clearTimeout(timer)
    }
  }, [dragOrder, draggedWorktreeId])

  // Keep selectedWorktree in sync with workspace updates
  const currentWorktree = selectedWorktree
    ? workspace?.worktrees.find((wt) => wt.id === selectedWorktree.id) || null
    : null

  // Loading state
  const isLoading = isLoadingWorkspaces || isLoadingWorkspace

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Toolbar */}
      <Toolbar
        workspaceName={workspace?.name || null}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenWorkspace={handleOpenWorkspace}
        onOpenSettings={() => setSettingsOpen(true)}
        isConnected={isConnected}
      />

      {/* Connection Status Banner */}
      {!isConnected && wsStatus !== 'connecting' && (
        <Alert variant="destructive" className="mx-6 mt-2">
          <WifiOff className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Disconnected from server. Real-time updates unavailable.</span>
            <Button variant="outline" size="sm" onClick={reconnect}>
              Reconnect
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Error Banner */}
      {isError && error && (
        <Alert variant="destructive" className="mx-6 mt-2">
          <AlertDescription>
            {error instanceof Error ? error.message : 'An error occurred loading the workspace.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-6">
          {isLoading ? (
            /* Loading State */
            <div className="flex h-[60vh] flex-col items-center justify-center">
              <Loader2 className="mb-4 h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading workspace...</p>
            </div>
          ) : workspace ? (
            <>
              {/* Refresh Button */}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refresh()}
                  disabled={isRefreshing}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>

              {/* Worktree Rows */}
              {(dragOrder
                ? dragOrder
                    .map((id) => workspace.worktrees.find((wt) => wt.id === id)!)
                    .filter(Boolean)
                : workspace.worktrees
              ).map((worktree) => (
                <WorktreeRow
                  key={worktree.id}
                  worktree={worktree}
                  onAddAgent={() => addAgent(worktree.id)}
                  onRemoveAgent={(agentId) => removeAgent(worktree.id, agentId)}
                  onSelectAgent={(agent) => handleSelectAgent(agent, worktree)}
                  onReorderAgents={(agentIds) => reorderAgents(worktree.id, agentIds)}
                  onRemoveWorktree={() => removeWorktree(worktree.id)}
                  onCheckoutBranch={(branch, createBranch) =>
                    checkoutBranch(worktree.id, branch, createBranch)
                  }
                  usedBranches={workspace.worktrees
                    .filter((wt) => wt.id !== worktree.id)
                    .map((wt) => wt.branch)}
                  onLoadPreviousAgent={(agentId) => loadPreviousAgent(worktree.id, agentId)}
                  onSetSortMode={(sortMode) => setSortMode(worktree.id, sortMode)}
                  isDragging={draggedWorktreeId === worktree.id}
                  onDragStart={(e) => handleWorktreeDragStart(e, worktree.id)}
                  onDragOver={(e) => handleWorktreeDragOver(e, worktree.id)}
                  onDragEnd={handleWorktreeDragEnd}
                  onDrop={handleWorktreeDrop}
                />
              ))}

              {/* Add Worktree Button */}
              <Button
                variant="outline"
                className="h-16 w-full gap-2 border-dashed"
                onClick={() => setAddWorktreeOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Worktree
              </Button>
            </>
          ) : (
            /* Empty State */
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="mb-2 text-xl font-semibold">No Workspace Open</h2>
              <p className="mb-6 max-w-sm text-muted-foreground">
                Open a Git workspace to start managing your Claude Code agents.
              </p>
              <Button onClick={handleOpenWorkspace} className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Open Workspace
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Usage Bar */}
      <UsageBar stats={formattedUsage} isLoading={isLoadingUsage} />

      {/* Agent Modal with Tabs */}
      <AgentModal
        agents={currentWorktree?.agents || []}
        selectedAgentId={selectedAgentId}
        open={!!selectedAgentId && !!currentWorktree}
        onClose={() => {
          setSelectedAgentId(null)
          setSelectedWorktree(null)
        }}
        onUpdateAgent={(agentId, updates) => {
          if (currentWorktree) {
            updateAgent(currentWorktree.id, agentId, updates)
          }
        }}
        onSelectAgent={setSelectedAgentId}
      />

      {/* Add Worktree Dialog */}
      <AddWorktreeDialog
        open={addWorktreeOpen}
        onClose={() => setAddWorktreeOpen(false)}
        onAdd={addWorktree}
      />

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default Index
