import { useState } from 'react';
import { Worktree, Agent, AgentStatus, AgentMode } from '@/types/agent';
import { AgentBox } from './AgentBox';
import {
  Plus,
  GitBranch,
  Trash2,
  History,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
}

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
}: WorktreeRowProps) {
  const [draggedAgent, setDraggedAgent] = useState<string | null>(null);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [newBranch, setNewBranch] = useState(worktree.branch);

  const handleDragStart = (agentId: string) => {
    setDraggedAgent(agentId);
  };

  const handleDragOver = (e: React.DragEvent, targetAgentId: string) => {
    e.preventDefault();
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

  return (
    <>
      <div className="worktree-row animate-slide-in">
        {/* Header */}
        <div className="worktree-header">
          <div className="flex items-center gap-3">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <div>
              <h3 className="font-medium text-sm">{worktree.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">
                {worktree.branch}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
                {worktree.agents.map(agent => (
                  <div
                    key={agent.id}
                    draggable
                    onDragStart={() => handleDragStart(agent.id)}
                    onDragOver={e => handleDragOver(e, agent.id)}
                    onDragEnd={handleDragEnd}
                    className="flex-shrink-0 w-56"
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
