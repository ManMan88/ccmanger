import { useMemo } from 'react'
import type { Agent, AgentStatus } from '@claude-manager/shared'
import { Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface AgentBoxProps {
  agent: Agent
  onSelect: () => void
  onDelete: () => void
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

export function AgentBox({ agent, onSelect, onDelete, isDragging }: AgentBoxProps) {
  const contextColor = useMemo(() => {
    if (agent.contextLevel >= 80) return 'text-status-error'
    if (agent.contextLevel >= 60) return 'text-status-waiting'
    return 'text-muted-foreground'
  }, [agent.contextLevel])

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
