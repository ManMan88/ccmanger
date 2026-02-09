import { useState } from 'react'
import type { Agent, AgentMode } from '@claude-manager/shared'
import { useAgent } from '@/hooks/useAgents'
import { useAgentSubscription, useWebSocket } from '@/hooks/useWebSocket'
import { XtermTerminal } from '@/components/XtermTerminal'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Zap, ClipboardList, Settings2, X, Edit2, Check, WifiOff, Play, Square } from 'lucide-react'

interface AgentModalProps {
  agents: Agent[]
  selectedAgentId: string | null
  open: boolean
  onClose: () => void
  onUpdateAgent: (agentId: string, updates: Partial<Agent>) => void
  onSelectAgent: (agentId: string) => void
}

const modeIcons: Record<AgentMode, typeof Zap> = {
  auto: Zap,
  plan: ClipboardList,
  regular: Settings2,
}

const statusClasses = {
  running: 'bg-status-running',
  waiting: 'bg-status-waiting',
  error: 'bg-status-error',
  finished: 'bg-status-finished',
}

export function AgentModal({
  agents,
  selectedAgentId,
  open,
  onClose,
  onUpdateAgent,
  onSelectAgent,
}: AgentModalProps) {
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [editedName, setEditedName] = useState('')

  // Get agent data and actions from API
  const { agent: agentData, stopAgent, startAgent } = useAgent(open ? selectedAgentId : null)

  // Subscribe to agent updates via WebSocket
  useAgentSubscription(open ? selectedAgentId : null)

  // WebSocket connection status
  const { isConnected } = useWebSocket()

  // Find the agent from props (for display purposes before API data loads)
  const currentAgent = agentData || agents.find((a) => a.id === selectedAgentId)

  if (!currentAgent || agents.length === 0) return null

  const ModeIcon = modeIcons[currentAgent.mode]

  const handleStartEditing = (agent: Agent) => {
    setEditedName(agent.name)
    setEditingAgentId(agent.id)
  }

  const handleSaveName = () => {
    if (editingAgentId) {
      onUpdateAgent(editingAgentId, { name: editedName })
      setEditingAgentId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent
        className="flex h-[85vh] max-w-4xl flex-col bg-card p-0"
        data-testid="agent-modal"
      >
        {/* Tabs Header - Linux CLI style */}
        <div className="border-b border-border bg-muted/30">
          <ScrollArea className="w-full">
            <Tabs value={selectedAgentId || ''} onValueChange={onSelectAgent} className="w-full">
              <TabsList className="h-auto w-max justify-start rounded-none bg-transparent p-0">
                {agents.map((agent) => (
                  <TabsTrigger
                    key={agent.id}
                    value={agent.id}
                    className="relative min-w-[140px] gap-2 rounded-none border-r border-border px-4 py-2.5 data-[state=active]:bg-card data-[state=inactive]:bg-muted/50 data-[state=active]:shadow-none"
                    data-testid={`agent-tab-${agent.id}`}
                  >
                    <div className={`h-2 w-2 rounded-full ${statusClasses[agent.status]}`} />
                    <span className="max-w-[100px] truncate text-xs font-medium">{agent.name}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {agent.contextLevel}%
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </ScrollArea>
        </div>

        {/* Connection Status */}
        {!isConnected && (
          <div className="flex items-center gap-2 border-b border-yellow-500/20 bg-yellow-500/10 px-6 py-2 text-yellow-600 dark:text-yellow-500">
            <WifiOff className="h-4 w-4" />
            <span className="text-sm">Disconnected - messages may not update in real-time</span>
          </div>
        )}

        {/* Agent Header */}
        <DialogHeader className="flex-shrink-0 border-b border-border px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${statusClasses[currentAgent.status]}`} />
              {editingAgentId === currentAgent.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 w-48"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveName}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg">{currentAgent.name}</DialogTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => handleStartEditing(currentAgent)}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Start/Stop Button */}
              {currentAgent.status === 'running' ? (
                <Button variant="outline" size="sm" onClick={() => stopAgent()} className="gap-1.5">
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startAgent()}
                  className="gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" />
                  Start
                </Button>
              )}

              <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1">
                <ModeIcon className="h-3.5 w-3.5" />
                <span className="text-xs capitalize">{currentAgent.mode}</span>
              </div>
              <div className="context-indicator">Context: {currentAgent.contextLevel}%</div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Terminal - xterm.js */}
        <div className="flex-1 overflow-hidden bg-[#300a24]" data-testid="terminal-output">
          {currentAgent ? (
            <XtermTerminal
              agentId={currentAgent.id}
              isRunning={currentAgent.status === 'running'}
            />
          ) : (
            <div className="p-4 text-gray-500">Select an agent to begin.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
