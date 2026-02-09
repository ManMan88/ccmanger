import { useMemo } from 'react'
import type { Agent, AgentStatus, AgentMode } from '@claude-manager/shared'
import {
  Play,
  Trash2,
  GitFork,
  Shield,
  Zap,
  ClipboardList,
  Settings2,
  GripVertical,
  Square,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'

interface AgentBoxProps {
  agent: Agent
  onSelect: () => void
  onUpdateName: (name: string) => void
  onUpdateStatus: (status: AgentStatus) => void
  onUpdateMode: (mode: AgentMode) => void
  onUpdatePermissions?: (permissions: string[]) => void
  onDelete: () => void
  onFork: () => void
  onStart?: () => void
  onStop?: () => void
  isDragging?: boolean
}

const statusClasses: Record<AgentStatus, string> = {
  running: 'agent-box-running',
  waiting: 'agent-box-waiting',
  error: 'agent-box-error',
  idle: 'agent-box-idle',
}

const statusLabels: Record<AgentStatus, string> = {
  running: 'Running',
  waiting: 'Waiting for input',
  error: 'Error',
  idle: 'Idle',
}

const modeIcons: Record<AgentMode, typeof Zap> = {
  auto: Zap,
  plan: ClipboardList,
  regular: Settings2,
}

const modeLabels: Record<AgentMode, string> = {
  auto: 'Auto Approve',
  plan: 'Plan Mode',
  regular: 'Regular Mode',
}

export function AgentBox({
  agent,
  onSelect,
  onUpdateStatus,
  onUpdateMode,
  onUpdatePermissions,
  onDelete,
  onFork,
  onStart,
  onStop,
  isDragging,
}: AgentBoxProps) {
  const ModeIcon = modeIcons[agent.mode]

  const contextColor = useMemo(() => {
    if (agent.contextLevel >= 80) return 'text-status-error'
    if (agent.contextLevel >= 60) return 'text-status-waiting'
    return 'text-muted-foreground'
  }, [agent.contextLevel])

  const handlePermissionToggle = (permission: string) => {
    if (!onUpdatePermissions) return
    const newPermissions = agent.permissions.includes(permission)
      ? agent.permissions.filter((p) => p !== permission)
      : [...agent.permissions, permission]
    onUpdatePermissions(newPermissions)
  }

  const handlePlayPause = () => {
    if (agent.status === 'running') {
      if (onStop) {
        onStop()
      } else {
        onUpdateStatus('waiting')
      }
    } else {
      if (onStart) {
        onStart()
      } else {
        onUpdateStatus('running')
      }
    }
  }

  return (
    <article
      data-testid={`agent-box-${agent.id}`}
      className={`agent-box ${statusClasses[agent.status]} ${isDragging ? 'scale-95 opacity-50' : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${agent.name} agent, status: ${statusLabels[agent.status]}, context: ${agent.contextLevel}%`}
    >
      {/* Drag Handle */}
      <div
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab opacity-40 hover:opacity-100"
        aria-hidden="true"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Header */}
      <div className="mb-2 flex items-center justify-between pl-4">
        <div className="flex items-center gap-2">
          <div
            data-testid={`agent-status-${agent.id}`}
            className={`status-dot status-dot-${agent.status}`}
          />
          <span className="max-w-[120px] truncate text-sm font-medium">{agent.name}</span>
        </div>
        <span
          data-testid={`agent-context-${agent.id}`}
          className={`context-indicator ${contextColor}`}
        >
          {agent.contextLevel}%
        </span>
      </div>

      {/* Status Label */}
      <p className="mb-3 pl-4 text-xs text-muted-foreground">{statusLabels[agent.status]}</p>

      {/* Actions */}
      <div
        className="flex items-center gap-1 pl-4"
        onClick={(e) => e.stopPropagation()}
        role="toolbar"
        aria-label={`Actions for ${agent.name}`}
      >
        {agent.status === 'running' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handlePlayPause}
                data-testid={`agent-pause-${agent.id}`}
                aria-label="Stop agent"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handlePlayPause}
                data-testid={`agent-play-${agent.id}`}
                aria-label="Start agent"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start</TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  data-testid={`agent-mode-${agent.id}`}
                >
                  <ModeIcon className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{modeLabels[agent.mode]}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent className="bg-popover">
            <DropdownMenuItem onClick={() => onUpdateMode('auto')}>
              <Zap className="mr-2 h-4 w-4" />
              Auto Approve
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdateMode('plan')}>
              <ClipboardList className="mr-2 h-4 w-4" />
              Plan Mode
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdateMode('regular')}>
              <Settings2 className="mr-2 h-4 w-4" />
              Regular Mode
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  data-testid={`agent-permissions-${agent.id}`}
                >
                  <Shield className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Permissions</TooltipContent>
          </Tooltip>
          <DropdownMenuContent className="bg-popover">
            <DropdownMenuItem onClick={() => handlePermissionToggle('read')}>
              <Checkbox checked={agent.permissions.includes('read')} className="mr-2" />
              Read
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handlePermissionToggle('write')}>
              <Checkbox checked={agent.permissions.includes('write')} className="mr-2" />
              Write
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handlePermissionToggle('execute')}>
              <Checkbox checked={agent.permissions.includes('execute')} className="mr-2" />
              Execute
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onFork}
              data-testid={`agent-fork-${agent.id}`}
              aria-label="Fork agent"
            >
              <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fork</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
              data-testid={`agent-delete-${agent.id}`}
              aria-label="Delete agent"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </article>
  )
}
