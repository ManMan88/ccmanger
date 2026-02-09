import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'

interface AddWorktreeDialogProps {
  open: boolean
  onClose: () => void
  onAdd: (name: string, branch: string, createBranch: boolean) => Promise<void>
}

export function AddWorktreeDialog({ open, onClose, onAdd }: AddWorktreeDialogProps) {
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [createBranch, setCreateBranch] = useState(true)
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async () => {
    if (!name.trim() || !branch.trim() || isAdding) return
    setIsAdding(true)
    try {
      await onAdd(name, branch, createBranch)
      setName('')
      setBranch('')
      setCreateBranch(true)
      onClose()
    } catch {
      // Error toast is shown by the mutation's onError handler; keep dialog open
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={isAdding ? undefined : onClose}>
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
              onChange={(e) => setName(e.target.value)}
              placeholder="feature/my-feature"
              disabled={isAdding}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wt-branch">Branch</Label>
            <Input
              id="wt-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/my-feature"
              className="font-mono"
              disabled={isAdding}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="wt-create-branch"
              checked={createBranch}
              onCheckedChange={(checked) => setCreateBranch(checked === true)}
              disabled={isAdding}
            />
            <Label htmlFor="wt-create-branch" className="cursor-pointer">
              Create new branch
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isAdding}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!name.trim() || !branch.trim() || isAdding}>
            {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Worktree
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
