import { useState, useMemo } from 'react';
import { Worktree, Agent, AgentStatus, AgentMode, AgentSortMode } from '@/types/agent';
import { AgentBox } from './AgentBox';
import {
  Plus,
  GitBranch,
  Trash2,
  History,
  ChevronDown,
  MoreHorizontal,
  ArrowUpDown,
  GripVertical,
} from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface WorktreeRowProps {
  worktree: Worktree;
  onAddAgent: () => void;
  onRemoveAgent: (agentId: string) => void;
  onUpdateAgent: (agentId: string, updates: Partial<Agent>) => void;
  onForkAgent: (agentId: string) => void;
  onSelectAgent: (agent: Agent) => void;
  onReorderAgents: (agentIds: string[]) => void;
  onRemoveWorktree: () => void;
  onCheckoutBranch: (branch: string) => void;
  onLoadPreviousAgent: (agentId: string) => void;
  onSetSortMode: (sortMode: AgentSortMode) => void;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

const statusOrder: Record<AgentStatus, number> = {
  running: 0,
  waiting: 1,
  error: 2,
  finished: 3,
};

export function WorktreeRow({
  worktree,
  onAddAgent,
  onRemoveAgent,
  onUpdateAgent,
  onForkAgent,
  onSelectAgent,
  onReorderAgents,
  onRemoveWorktree,
  onCheckoutBranch,
  onLoadPreviousAgent,
  onSetSortMode,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
}: WorktreeRowProps) {
  const [draggedAgent, setDraggedAgent] = useState<string | null>(null);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [newBranch, setNewBranch] = useState(worktree.branch);

  const sortedAgents = useMemo(() => {
    const agents = [...worktree.agents];
    switch (worktree.sortMode) {
      case 'status':
        return agents.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
      case 'name':
        return agents.sort((a, b) => a.name.localeCompare(b.name));
      case 'free':
      default:
        return agents.sort((a, b) => a.order - b.order);
    }
  }, [worktree.agents, worktree.sortMode]);

  const handleDragStart = (agentId: string) => {
    if (worktree.sortMode !== 'free') return;
    setDraggedAgent(agentId);
  };

  const handleDragOver = (e: React.DragEvent, targetAgentId: string) => {
    e.preventDefault();
    if (worktree.sortMode !== 'free') return;
    if (!draggedAgent || draggedAgent === targetAgentId) return;

    const currentOrder = worktree.agents.map(a => a.id);
    const draggedIndex = currentOrder.indexOf(draggedAgent);
    const targetIndex = currentOrder.indexOf(targetAgentId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedAgent);

    onReorderAgents(newOrder);
  };

  const handleDragEnd = () => {
    setDraggedAgent(null);
  };

  const handleCheckout = () => {
    onCheckoutBranch(newBranch);
    setCheckoutDialogOpen(false);
  };

  const sortModeLabels: Record<AgentSortMode, string> = {
    free: 'Free Arrangement',
    status: 'By Status',
    name: 'By Name',
  };

  return (
    <>
      <div 
        className={`worktree-row animate-slide-in ${isDragging ? 'opacity-50 scale-[0.98]' : ''}`}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {/* Header */}
        <div className="worktree-header">
          <div className="flex items-center gap-3">
            <div className="cursor-grab hover:bg-secondary p-1 rounded">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <div>
              <h3 className="font-medium text-sm">{worktree.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">
                {worktree.branch}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sort Mode Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 h-8">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span className="text-xs">{sortModeLabels[worktree.sortMode]}</span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-popover">
                <DropdownMenuLabel className="text-xs">Sort Agents</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup 
                  value={worktree.sortMode} 
                  onValueChange={(value) => onSetSortMode(value as AgentSortMode)}
                >
                  <DropdownMenuRadioItem value="free">
                    Free Arrangement
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="status">
                    By Status
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name">
                    By Name
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Previous Agents Dropdown */}
            {worktree.previousAgents.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-8">
                    <History className="w-3.5 h-3.5" />
                    <span className="text-xs">History</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover">
                  {worktree.previousAgents.map(agent => (
                    <DropdownMenuItem
                      key={agent.id}
                      onClick={() => onLoadPreviousAgent(agent.id)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate">{agent.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {agent.contextLevel}%
                        </span>
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
              className="gap-1.5 h-8"
              onClick={onAddAgent}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="text-xs">Agent</span>
            </Button>

            {/* More Options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-8 h-8">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={() => setCheckoutDialogOpen(true)}>
                  <GitBranch className="w-4 h-4 mr-2" />
                  Checkout branch
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onRemoveWorktree}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove worktree
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Agents Grid */}
        <div className="p-4">
          {worktree.agents.length === 0 ? (
            <div className="flex items-center justify-center h-24 border-2 border-dashed border-border rounded-lg">
              <p className="text-sm text-muted-foreground">
                No agents. Click "+ Agent" to spawn one.
              </p>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-3">
                {sortedAgents.map(agent => (
                  <div
                    key={agent.id}
                    draggable={worktree.sortMode === 'free'}
                    onDragStart={() => handleDragStart(agent.id)}
                    onDragOver={e => handleDragOver(e, agent.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex-shrink-0 w-56 ${worktree.sortMode !== 'free' ? 'cursor-default' : ''}`}
                  >
                    <AgentBox
                      agent={agent}
                      onSelect={() => onSelectAgent(agent)}
                      onUpdateName={name => onUpdateAgent(agent.id, { name })}
                      onUpdateStatus={(status: AgentStatus) =>
                        onUpdateAgent(agent.id, { status })
                      }
                      onUpdateMode={(mode: AgentMode) =>
                        onUpdateAgent(agent.id, { mode })
                      }
                      onDelete={() => onRemoveAgent(agent.id)}
                      onFork={() => onForkAgent(agent.id)}
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
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Checkout Branch</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="branch">Branch name</Label>
            <Input
              id="branch"
              value={newBranch}
              onChange={e => setNewBranch(e.target.value)}
              className="mt-2 font-mono"
              placeholder="main"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCheckoutDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCheckout}>Checkout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
