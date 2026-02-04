import { useState, useEffect } from 'react';
import { Agent, AgentMode } from '@/types/agent';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Send,
  Zap,
  ClipboardList,
  Settings2,
  X,
  Edit2,
  Check,
} from 'lucide-react';

interface AgentModalProps {
  agents: Agent[];
  selectedAgentId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdateAgent: (agentId: string, updates: Partial<Agent>) => void;
  onSelectAgent: (agentId: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type AgentMessages = Record<string, Message[]>;

const modeIcons: Record<AgentMode, typeof Zap> = {
  auto: Zap,
  plan: ClipboardList,
  regular: Settings2,
};

const statusClasses = {
  running: 'bg-status-running',
  waiting: 'bg-status-waiting',
  error: 'bg-status-error',
  finished: 'bg-status-finished',
};

export function AgentModal({ 
  agents, 
  selectedAgentId, 
  open, 
  onClose, 
  onUpdateAgent,
  onSelectAgent,
}: AgentModalProps) {
  const [agentMessages, setAgentMessages] = useState<AgentMessages>({});
  const [input, setInput] = useState('');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');

  const currentAgent = agents.find(a => a.id === selectedAgentId);

  // Initialize messages for agents that don't have any
  useEffect(() => {
    agents.forEach(agent => {
      if (!agentMessages[agent.id]) {
        setAgentMessages(prev => ({
          ...prev,
          [agent.id]: [{
            id: '1',
            role: 'assistant',
            content: `Hello! I'm ${agent.name}, ready to help. What would you like me to work on?`,
            timestamp: new Date(),
          }],
        }));
      }
    });
  }, [agents]);

  if (!currentAgent || agents.length === 0) return null;

  const messages = agentMessages[currentAgent.id] || [];
  const ModeIcon = modeIcons[currentAgent.mode];

  const handleSend = () => {
    if (!input.trim() || !currentAgent) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setAgentMessages(prev => ({
      ...prev,
      [currentAgent.id]: [...(prev[currentAgent.id] || []), userMessage],
    }));
    setInput('');

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I understand. Let me work on that for you...',
        timestamp: new Date(),
      };
      setAgentMessages(prev => ({
        ...prev,
        [currentAgent.id]: [...(prev[currentAgent.id] || []), assistantMessage],
      }));
    }, 500);
  };

  const handleStartEditing = (agent: Agent) => {
    setEditedName(agent.name);
    setEditingAgentId(agent.id);
  };

  const handleSaveName = () => {
    if (editingAgentId) {
      onUpdateAgent(editingAgentId, { name: editedName });
      setEditingAgentId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 bg-card">
        {/* Tabs Header - Linux CLI style */}
        <div className="border-b border-border bg-muted/30">
          <ScrollArea className="w-full">
            <Tabs 
              value={selectedAgentId || ''} 
              onValueChange={onSelectAgent}
              className="w-full"
            >
              <TabsList className="h-auto p-0 bg-transparent rounded-none justify-start w-max">
                {agents.map((agent, index) => (
                  <TabsTrigger
                    key={agent.id}
                    value={agent.id}
                    className="relative px-4 py-2.5 rounded-none border-r border-border data-[state=active]:bg-card data-[state=active]:shadow-none data-[state=inactive]:bg-muted/50 gap-2 min-w-[140px]"
                  >
                    <div className={`w-2 h-2 rounded-full ${statusClasses[agent.status]}`} />
                    <span className="truncate max-w-[100px] text-xs font-medium">
                      {agent.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-1">
                      {agent.contextLevel}%
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </ScrollArea>
        </div>

        {/* Agent Header */}
        <DialogHeader className="px-6 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${statusClasses[currentAgent.status]}`} />
              {editingAgentId === currentAgent.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={e => setEditedName(e.target.value)}
                    className="h-8 w-48"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  />
                  <Button size="icon" variant="ghost" className="w-7 h-7" onClick={handleSaveName}>
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg">{currentAgent.name}</DialogTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-6 h-6"
                    onClick={() => handleStartEditing(currentAgent)}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary">
                <ModeIcon className="w-3.5 h-3.5" />
                <span className="text-xs capitalize">{currentAgent.mode}</span>
              </div>
              <div className="context-indicator">
                Context: {currentAgent.contextLevel}%
              </div>
              <Button size="icon" variant="ghost" className="w-8 h-8" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-4">
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <p className="text-xs opacity-60 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t border-border flex-shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type a message..."
              className="min-h-[60px] resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button onClick={handleSend} className="self-end">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
