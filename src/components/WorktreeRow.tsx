import { useState, useMemo, useRef, useEffect } from 'react'
import type { Agent, SortMode } from '@claude-manager/shared'
import { AgentBox } from './AgentBox'
import {
  Plus,
  GitBranch,
  Trash2,
  History,
  ChevronDown,
  MoreHorizontal,
  ArrowUpDown,
  GripVertical,
  Check,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

// Worktree type compatible with both old frontend types and shared types
interface WorktreeCompat {
  id: string
  name: string
  branch: string
  path: string
  agents: Agent[]
  previousAgents: Agent[]
  sortMode: SortMode
  order: number
}

interface WorktreeRowProps {
  worktree: WorktreeCompat
  onAddAgent: () => void
  onRemoveAgent: (agentId: string) => void
  onSelectAgent: (agent: Agent) => void
  onReorderAgents: (agentIds: string[]) => void
  onRemoveWorktree: () => void
  onCheckoutBranch: (branch: string, createBranch: boolean) => void
  onLoadPreviousAgent: (agentId: string) => void
  onSetSortMode: (sortMode: SortMode) => void
  usedBranches: string[]
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onDrop?: (e: React.DragEvent) => void
}

const statusOrder: Record<AgentStatus, number> = {
  running: 0,
  waiting: 1,
  error: 2,
  idle: 3,
}

export function WorktreeRow({
  worktree,
  onAddAgent,
  onRemoveAgent,
  onSelectAgent,
  onReorderAgents,
  onRemoveWorktree,
  onCheckoutBranch,
  onLoadPreviousAgent,
  onSetSortMode,
  usedBranches,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: WorktreeRowProps) {
  const [draggedAgent, setDraggedAgent] = useState<string | null>(null)
  const draggedAgentRef = useRef<string | null>(null)
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'select' | 'create'>('select')
  const [newBranchName, setNewBranchName] = useState('')
  const [branches, setBranches] = useState<{ local: string[]; remote: string[] } | null>(null)
  const [branchesLoading, setBranchesLoading] = useState(false)

  useEffect(() => {
    if (checkoutDialogOpen) {
      setBranchesLoading(true)
      setDialogMode('select')
      setNewBranchName('')
      api.worktrees
        .getBranches('', worktree.id)
        .then((info) => setBranches({ local: info.local, remote: info.remote }))
        .catch(() => setBranches({ local: [], remote: [] }))
        .finally(() => setBranchesLoading(false))
    } else {
      setBranches(null)
    }
  }, [checkoutDialogOpen, worktree.id])

  const sortedAgents = useMemo(() => {
    const agents = [...worktree.agents]
    switch (worktree.sortMode) {
      case 'status':
        return agents.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
      case 'name':
        return agents.sort((a, b) => a.name.localeCompare(b.name))
      case 'free':
      default:
        return agents.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    }
  }, [worktree.agents, worktree.sortMode])

  const handleDragStart = (e: React.DragEvent, agentId: string) => {
    if (worktree.sortMode !== 'free') return
    e.dataTransfer.setData('text/plain', agentId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedAgent(agentId)
    draggedAgentRef.current = agentId
  }

  const handleDragOver = (e: React.DragEvent, targetAgentId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (worktree.sortMode !== 'free') return
    const dragged = draggedAgentRef.current
    if (!dragged || dragged === targetAgentId) return

    const currentOrder = worktree.agents.map((a) => a.id)
    const draggedIndex = currentOrder.indexOf(dragged)
    const targetIndex = currentOrder.indexOf(targetAgentId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newOrder = [...currentOrder]
    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, dragged)

    onReorderAgents(newOrder)
  }

  const handleDragEnd = () => {
    setDraggedAgent(null)
    draggedAgentRef.current = null
  }

  const handleSelectBranch = (branch: string) => {
    onCheckoutBranch(branch, false)
    setCheckoutDialogOpen(false)
  }

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return
    onCheckoutBranch(newBranchName.trim(), true)
    setCheckoutDialogOpen(false)
  }

  const sortModeLabels: Record<SortMode, string> = {
    free: 'Free Arrangement',
    status: 'By Status',
    name: 'By Name',
  }

  return (
    <>
      <div
        data-testid={`worktree-row-${worktree.id}`}
        className={`worktree-row animate-slide-in ${isDragging ? 'scale-[0.98] opacity-50' : ''}`}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
      >
        {/* Header */}
        <div className="worktree-header">
          <div className="flex items-center gap-3">
            <div className="cursor-grab rounded p-1 hover:bg-secondary">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-medium">{worktree.name}</h3>
              <p className="font-mono text-xs text-muted-foreground">{worktree.branch}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sort Mode Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5"
                  data-testid={`worktree-sort-${worktree.id}`}
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span className="text-xs">{sortModeLabels[worktree.sortMode]}</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-popover">
                <DropdownMenuLabel className="text-xs">Sort Agents</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={worktree.sortMode}
                  onValueChange={(value) => onSetSortMode(value as SortMode)}
                >
                  <DropdownMenuRadioItem value="free">Free Arrangement</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="status">By Status</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name">By Name</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Previous Agents Dropdown */}
            {worktree.previousAgents.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
                    data-testid={`worktree-history-${worktree.id}`}
                  >
                    <History className="h-3.5 w-3.5" />
                    <span className="text-xs">History</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover">
                  {worktree.previousAgents.map((agent) => (
                    <DropdownMenuItem key={agent.id} onClick={() => onLoadPreviousAgent(agent.id)}>
                      <div className="flex w-full items-center justify-between">
                        <span className="truncate">{agent.name}</span>
                        <span className="text-xs text-muted-foreground">{agent.contextLevel}%</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Add Agent Button */}
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5"
              onClick={onAddAgent}
              data-testid={`worktree-add-agent-${worktree.id}`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="text-xs">Agent</span>
            </Button>

            {/* More Options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  data-testid={`worktree-more-${worktree.id}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={() => setCheckoutDialogOpen(true)}>
                  <GitBranch className="mr-2 h-4 w-4" />
                  Checkout branch
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onRemoveWorktree}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove worktree
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Agents Grid */}
        <div className="p-4">
          {worktree.agents.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-border">
              <p className="text-sm text-muted-foreground">
                No agents. Click "+ Agent" to spawn one.
              </p>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-3">
                {sortedAgents.map((agent) => (
                  <div
                    key={agent.id}
                    draggable={worktree.sortMode === 'free'}
                    onDragStart={(e) => {
                      e.stopPropagation()
                      handleDragStart(e, agent.id)
                    }}
                    onDragOver={(e) => handleDragOver(e, agent.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => e.preventDefault()}
                    className={`w-56 flex-shrink-0 ${worktree.sortMode !== 'free' ? 'cursor-default' : ''}`}
                  >
                    <AgentBox
                      agent={agent}
                      onSelect={() => onSelectAgent(agent)}
                      onDelete={() => onRemoveAgent(agent.id)}
                      isDragging={draggedAgent === agent.id}
                    />
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Checkout Branch Dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="bg-card p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>
              {dialogMode === 'create' ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setDialogMode('select')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  Create New Branch
                </div>
              ) : (
                'Checkout Branch'
              )}
            </DialogTitle>
          </DialogHeader>

          {dialogMode === 'select' ? (
            branchesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Command className="border-t">
                <CommandInput placeholder="Search branches..." />
                <CommandList>
                  <CommandEmpty>No branches found.</CommandEmpty>
                  {branches && branches.local.length > 0 && (
                    <CommandGroup heading="Local Branches">
                      {branches.local
                        .filter((b) => b !== worktree.branch)
                        .map((branch) => {
                          const inUse = usedBranches.includes(branch)
                          return (
                            <CommandItem
                              key={`local-${branch}`}
                              value={branch}
                              disabled={inUse}
                              onSelect={() => handleSelectBranch(branch)}
                              className="font-mono text-sm"
                            >
                              <GitBranch className="mr-2 h-3.5 w-3.5" />
                              {branch}
                              {inUse && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  in use
                                </span>
                              )}
                            </CommandItem>
                          )
                        })}
                      {branches.local.includes(worktree.branch) && (
                        <CommandItem
                          key={`local-${worktree.branch}`}
                          value={worktree.branch}
                          disabled
                          className="font-mono text-sm"
                        >
                          <Check className="mr-2 h-3.5 w-3.5 text-green-500" />
                          {worktree.branch}
                          <span className="ml-auto text-xs text-muted-foreground">current</span>
                        </CommandItem>
                      )}
                    </CommandGroup>
                  )}
                  {branches && branches.remote.length > 0 && (
                    <CommandGroup heading="Remote Branches">
                      {branches.remote
                        .filter((b) => !branches.local.includes(b) && b !== worktree.branch)
                        .map((branch) => {
                          const inUse = usedBranches.includes(branch)
                          return (
                            <CommandItem
                              key={`remote-${branch}`}
                              value={`remote/${branch}`}
                              disabled={inUse}
                              onSelect={() => handleSelectBranch(branch)}
                              className="font-mono text-sm"
                            >
                              <GitBranch className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                              {branch}
                              {inUse && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  in use
                                </span>
                              )}
                            </CommandItem>
                          )
                        })}
                    </CommandGroup>
                  )}
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem onSelect={() => setDialogMode('create')} className="text-sm">
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Create new branch
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            )
          ) : (
            <>
              <div className="px-4 py-4">
                <Label htmlFor="new-branch-name">Branch name</Label>
                <Input
                  id="new-branch-name"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="mt-2 font-mono"
                  placeholder="feature/my-branch"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateBranch()
                  }}
                />
              </div>
              <DialogFooter className="px-4 pb-4">
                <Button variant="ghost" onClick={() => setDialogMode('select')}>
                  Back
                </Button>
                <Button onClick={handleCreateBranch} disabled={!newBranchName.trim()}>
                  Create & Checkout
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
