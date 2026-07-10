import {Button} from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {DiffFile} from "@/lib/diff"

interface DiscardDialogProps {
  /** The file whose changes are about to be reverted, or null when hidden. */
  file: DiffFile | null
  onCancel: () => void
  onDiscard: () => void
}

// DiscardDialog confirms reverting one file's uncommitted changes: a tracked
// file goes back to HEAD, a new file is deleted from disk. Either way the
// changes are gone for good.
export function DiscardDialog({file, onCancel, onDiscard}: DiscardDialogProps) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Discard changes</DialogTitle>
          <DialogDescription className="break-words">
            Revert all uncommitted changes to{" "}
            <span className="break-all font-mono">{file?.newPath}</span>?
            {file?.status === "added" && " The file will be deleted from disk."}
            {" "}This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
