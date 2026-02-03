import { useState } from 'react';
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
  agent: Agent | null;
  open: boolean;
  onClose: () => void;
  onUpdateAgent: (updates: Partial<Agent>) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const modeIcons: Record<AgentMode, typeof Zap> = {
  auto: Zap,
  plan: ClipboardList,
  regular: Settings2,
};

export function AgentModal({ agent, open, onClose, onUpdateAgent }: AgentModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m ready to help. What would you like me to work on?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(agent?.name || '');

  if (!agent) return null;

  const ModeIcon = modeIcons[agent.mode];

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I understand. Let me work on that for you...',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    }, 500);
  };

  const handleSaveName = () => {
    onUpdateAgent({ name: editedName });
    setIsEditingName(false);
  };

  const statusClasses = {
    running: 'bg-status-running',
    waiting: 'bg-status-waiting',
    error: 'bg-status-error',
    finished: 'bg-status-finished',
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 bg-card">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${statusClasses[agent.status]}`} />
              {isEditingName ? (
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
                  <DialogTitle className="text-lg">{agent.name}</DialogTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-6 h-6"
                    onClick={() => {
                      setEditedName(agent.name);
                      setIsEditingName(true);
                    }}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary">
                <ModeIcon className="w-3.5 h-3.5" />
                <span className="text-xs capitalize">{agent.mode}</span>
              </div>
              <div className="context-indicator">
                Context: {agent.contextLevel}%
              </div>
              <Button size="icon" variant="ghost" className="w-8 h-8" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

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
