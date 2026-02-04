import { useMemo } from 'react';
import { Agent, AgentStatus, AgentMode } from '@/types/agent';
import {
  Play,
  Pause,
  Trash2,
  GitFork,
  Shield,
  Zap,
  ClipboardList,
  Settings2,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';

interface AgentBoxProps {
  agent: Agent;
  onSelect: () => void;
  onUpdateName: (name: string) => void;
  onUpdateStatus: (status: AgentStatus) => void;
  onUpdateMode: (mode: AgentMode) => void;
  onDelete: () => void;
  onFork: () => void;
  isDragging?: boolean;
}

const statusClasses: Record<AgentStatus, string> = {
  running: 'agent-box-running',
  waiting: 'agent-box-waiting',
  error: 'agent-box-error',
  finished: 'agent-box-finished',
};

const statusLabels: Record<AgentStatus, string> = {
  running: 'Running',
  waiting: 'Waiting for input',
  error: 'Error',
  finished: 'Finished',
};

const modeIcons: Record<AgentMode, typeof Zap> = {
  auto: Zap,
  plan: ClipboardList,
  regular: Settings2,
};

const modeLabels: Record<AgentMode, string> = {
  auto: 'Auto Approve',
  plan: 'Plan Mode',
  regular: 'Regular Mode',
};

export function AgentBox({
  agent,
  onSelect,
  onUpdateStatus,
  onUpdateMode,
  onDelete,
  onFork,
  isDragging,
}: AgentBoxProps) {
  const ModeIcon = modeIcons[agent.mode];

  const contextColor = useMemo(() => {
    if (agent.contextLevel >= 80) return 'text-status-error';
    if (agent.contextLevel >= 60) return 'text-status-waiting';
    return 'text-muted-foreground';
  }, [agent.contextLevel]);

  return (
    <div
      className={`agent-box ${statusClasses[agent.status]} ${isDragging ? 'opacity-50 scale-95' : ''}`}
      onClick={onSelect}
    >
      {/* Drag Handle */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 cursor-grab">
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-2 pl-4">
        <div className="flex items-center gap-2">
          <div className={`status-dot status-dot-${agent.status}`} />
          <span className="font-medium text-sm truncate max-w-[120px]">
            {agent.name}
          </span>
        </div>
        <span className={`context-indicator ${contextColor}`}>
          {agent.contextLevel}%
        </span>
      </div>

      {/* Status Label */}
      <p className="text-xs text-muted-foreground mb-3 pl-4">
        {statusLabels[agent.status]}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1 pl-4" onClick={e => e.stopPropagation()}>
        {agent.status === 'running' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => onUpdateStatus('waiting')}
              >
                <Pause className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pause</TooltipContent>
          </Tooltip>
        ) : agent.status !== 'finished' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => onUpdateStatus('running')}
              >
                <Play className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Resume</TooltipContent>
          </Tooltip>
        ) : null}

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-7 h-7">
                  <ModeIcon className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{modeLabels[agent.mode]}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent className="bg-popover">
            <DropdownMenuItem onClick={() => onUpdateMode('auto')}>
              <Zap className="w-4 h-4 mr-2" />
              Auto Approve
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdateMode('plan')}>
              <ClipboardList className="w-4 h-4 mr-2" />
              Plan Mode
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdateMode('regular')}>
              <Settings2 className="w-4 h-4 mr-2" />
              Regular Mode
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-7 h-7">
                  <Shield className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Permissions</TooltipContent>
          </Tooltip>
          <DropdownMenuContent className="bg-popover">
            <DropdownMenuItem onClick={() => console.log('Toggle read permission')}>
              <Checkbox checked={agent.permissions.includes('read')} className="mr-2" />
              Read
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => console.log('Toggle write permission')}>
              <Checkbox checked={agent.permissions.includes('write')} className="mr-2" />
              Write
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => console.log('Toggle execute permission')}>
              <Checkbox checked={agent.permissions.includes('execute')} className="mr-2" />
              Execute
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onFork}>
              <GitFork className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fork</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
