import { useState, useEffect, useRef } from 'react'
import type { Agent, AgentMode } from '@claude-manager/shared'
import { useAgent } from '@/hooks/useAgents'
import { useAgentSubscription, useWebSocket } from '@/hooks/useWebSocket'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Send,
  Zap,
  ClipboardList,
  Settings2,
  X,
  Edit2,
  Check,
  Loader2,
  WifiOff,
  Play,
  Square,
} from 'lucide-react'

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
  const [input, setInput] = useState('')
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [editedName, setEditedName] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Get agent data and messages from API
  const {
    agent: agentData,
    messages,
    sendMessage,
    stopAgent,
    startAgent,
    isSending,
    isLoading,
  } = useAgent(open ? selectedAgentId : null)

  // Subscribe to agent updates via WebSocket
  useAgentSubscription(open ? selectedAgentId : null)

  // WebSocket connection status
  const { isConnected } = useWebSocket()

  // Find the agent from props (for display purposes before API data loads)
  const currentAgent = agentData || agents.find((a) => a.id === selectedAgentId)

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (!currentAgent || agents.length === 0) return null

  const ModeIcon = modeIcons[currentAgent.mode]

  const handleSend = () => {
    if (!input.trim() || !currentAgent) return
    sendMessage(input)
    setInput('')
  }

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

  const formatTimestamp = (timestamp: string | Date) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
    return date.toLocaleTimeString()
  }

  const canSendMessage = currentAgent.status === 'running' || currentAgent.status === 'waiting'

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
              ) : currentAgent.status !== 'finished' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startAgent()}
                  className="gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" />
                  Start
                </Button>
              ) : null}

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

        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-6" ref={scrollRef}>
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>No messages yet. Start the agent or send a message to begin.</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  data-testid={`message-${message.id}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : message.role === 'system'
                          ? 'border border-border bg-muted text-muted-foreground'
                          : message.role === 'tool'
                            ? 'border border-blue-500/20 bg-blue-500/10 font-mono text-xs text-blue-600 dark:text-blue-400'
                            : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {message.role === 'tool' && message.toolName && (
                      <p className="mb-1 text-[10px] uppercase tracking-wider opacity-70">
                        {message.toolName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                    <p className="mt-1 text-xs opacity-60">{formatTimestamp(message.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t border-border p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                canSendMessage
                  ? 'Type a message...'
                  : currentAgent.status === 'finished'
                    ? 'Agent has finished'
                    : 'Start the agent to send messages'
              }
              className="min-h-[60px] resize-none"
              disabled={!canSendMessage || isSending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              data-testid="message-input"
            />
            <Button
              onClick={handleSend}
              className="self-end"
              disabled={!canSendMessage || isSending || !input.trim()}
              data-testid="send-button"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
