import { FolderOpen, Moon, Sun, Settings, ChevronDown, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ToolbarProps {
  workspaceName: string | null
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onOpenWorkspace: () => void
  onOpenSettings: () => void
  isConnected?: boolean
}

export function Toolbar({
  workspaceName,
  theme,
  onToggleTheme,
  onOpenWorkspace,
  onOpenSettings,
  isConnected = true,
}: ToolbarProps) {
  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">AM</span>
          </div>
          <span className="text-lg font-semibold">Agent Master</span>
        </div>

        <div className="h-6 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2" data-testid="workspace-selector">
              <FolderOpen className="h-4 w-4" />
              <span className="font-mono text-sm">{workspaceName || 'No workspace'}</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 bg-popover">
            <DropdownMenuItem onClick={onOpenWorkspace}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Open workspace...
            </DropdownMenuItem>
            {workspaceName && (
              <DropdownMenuItem className="font-mono text-xs text-muted-foreground">
                ~/projects/{workspaceName}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2">
        {/* Connection Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                isConnected
                  ? 'text-green-600 dark:text-green-500'
                  : 'text-yellow-600 dark:text-yellow-500'
              }`}
              data-testid="connection-status"
            >
              {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {isConnected
              ? 'Connected to server - real-time updates enabled'
              : 'Disconnected from server - real-time updates unavailable'}
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          className="h-9 w-9"
          data-testid="theme-toggle"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          className="h-9 w-9"
          data-testid="settings-button"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
