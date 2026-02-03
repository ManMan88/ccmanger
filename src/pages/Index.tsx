import { useState } from 'react';
import { Toolbar } from '@/components/Toolbar';
import { WorktreeRow } from '@/components/WorktreeRow';
import { UsageBar } from '@/components/UsageBar';
import { AgentModal } from '@/components/AgentModal';
import { AddWorktreeDialog } from '@/components/AddWorktreeDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { useTheme } from '@/hooks/useTheme';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Agent, UsageStats } from '@/types/agent';
import { Button } from '@/components/ui/button';
import { Plus, FolderOpen } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const mockUsage: UsageStats = {
  daily: {
    used: 45000,
    limit: 100000,
    resetTime: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours from now
  },
  weekly: {
    used: 320000,
    limit: 500000,
    resetTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
  },
  sonnetOnly: {
    used: 75000,
    limit: 150000,
    resetTime: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
  },
};

const Index = () => {
  const { theme, toggleTheme } = useTheme();
  const {
    workspace,
    addWorktree,
    removeWorktree,
    checkoutBranch,
    addAgent,
    removeAgent,
    updateAgent,
    forkAgent,
    reorderAgents,
    loadPreviousAgent,
  } = useWorkspace();

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [addWorktreeOpen, setAddWorktreeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleOpenWorkspace = () => {
    // In a real app, this would open a file picker
    console.log('Open workspace');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Toolbar */}
      <Toolbar
        workspaceName={workspace?.name || null}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenWorkspace={handleOpenWorkspace}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4">
          {workspace ? (
            <>
              {/* Worktree Rows */}
              {workspace.worktrees.map(worktree => (
                <WorktreeRow
                  key={worktree.id}
                  worktree={worktree}
                  onAddAgent={() => addAgent(worktree.id)}
                  onRemoveAgent={agentId => removeAgent(worktree.id, agentId)}
                  onUpdateAgent={(agentId, updates) =>
                    updateAgent(worktree.id, agentId, updates)
                  }
                  onForkAgent={agentId => forkAgent(worktree.id, agentId)}
                  onSelectAgent={setSelectedAgent}
                  onReorderAgents={agentIds => reorderAgents(worktree.id, agentIds)}
                  onRemoveWorktree={() => removeWorktree(worktree.id)}
                  onCheckoutBranch={branch => checkoutBranch(worktree.id, branch)}
                  onLoadPreviousAgent={agentId =>
                    loadPreviousAgent(worktree.id, agentId)
                  }
                />
              ))}

              {/* Add Worktree Button */}
              <Button
                variant="outline"
                className="w-full h-16 border-dashed gap-2"
                onClick={() => setAddWorktreeOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Add Worktree
              </Button>
            </>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                <FolderOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Workspace Open</h2>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Open a Git workspace to start managing your Claude Code agents.
              </p>
              <Button onClick={handleOpenWorkspace} className="gap-2">
                <FolderOpen className="w-4 h-4" />
                Open Workspace
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Usage Bar */}
      <UsageBar stats={mockUsage} />

      {/* Agent Modal */}
      <AgentModal
        agent={selectedAgent}
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onUpdateAgent={updates => {
          if (selectedAgent) {
            updateAgent(selectedAgent.worktreeId, selectedAgent.id, updates);
            setSelectedAgent({ ...selectedAgent, ...updates });
          }
        }}
      />

      {/* Add Worktree Dialog */}
      <AddWorktreeDialog
        open={addWorktreeOpen}
        onClose={() => setAddWorktreeOpen(false)}
        onAdd={addWorktree}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

export default Index;
