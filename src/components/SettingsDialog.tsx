import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">General</h4>
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-save">Auto-save sessions</Label>
              <Switch id="auto-save" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifications">Enable notifications</Label>
              <Switch id="notifications" defaultChecked />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Agent Defaults</h4>
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-mode">Default to Auto Approve mode</Label>
              <Switch id="auto-mode" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="confirm-delete">Confirm before deleting agents</Label>
              <Switch id="confirm-delete" defaultChecked />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">API Configuration</h4>
            <p className="text-xs text-muted-foreground">
              API keys and model settings are configured via Claude Code CLI.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
