import { FolderOpen, Moon, Sun, Settings, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ToolbarProps {
  workspaceName: string | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenWorkspace: () => void;
  onOpenSettings: () => void;
}

export function Toolbar({
  workspaceName,
  theme,
  onToggleTheme,
  onOpenWorkspace,
  onOpenSettings,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">AM</span>
          </div>
          <span className="font-semibold text-lg">Agent Master</span>
        </div>

        <div className="h-6 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              <span className="font-mono text-sm">
                {workspaceName || 'No workspace'}
              </span>
              <ChevronDown className="w-4 h-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 bg-popover">
            <DropdownMenuItem onClick={onOpenWorkspace}>
              <FolderOpen className="w-4 h-4 mr-2" />
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
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          className="w-9 h-9"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          className="w-9 h-9"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
