import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AddWorktreeDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, branch: string) => void;
}

export function AddWorktreeDialog({ open, onClose, onAdd }: AddWorktreeDialogProps) {
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !branch.trim()) return;
    onAdd(name, branch);
    setName('');
    setBranch('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>Add Worktree</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="wt-name">Worktree name</Label>
            <Input
              id="wt-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="feature/my-feature"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wt-branch">Branch</Label>
            <Input
              id="wt-branch"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder="feature/my-feature"
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!name.trim() || !branch.trim()}>
            Add Worktree
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
