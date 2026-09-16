import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * This file changed somewhere else, and galley has stopped writing to it.
 *
 * Deliberately not a dialog. The change may have arrived from a phone while
 * the reader was mid-sentence, and a modal would take the cursor out of a
 * paragraph to answer a question about a file they may not even be looking
 * at. It sits above the pane, autosave is already stopped, and nothing is
 * lost while it waits.
 *
 * Only one of the two answers is offered. Taking what is on disk is safe and
 * reversible — their text replaces the editor's and the edit can be redone.
 * "Keep mine" would mean overwriting a version this screen has never shown,
 * which is the one outcome that destroys work nobody has seen.
 */
export function ConflictBar({
  path,
  onTakeTheirs,
}: {
  path: string
  onTakeTheirs: () => void | Promise<void>
}) {
  const name = path.split('/').pop() ?? path
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-destructive/10 px-3 py-2">
      <AlertTriangle className="size-4 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed">
        <strong>{name}</strong> changed somewhere else — in Obsidian, or on another
        device. galley has stopped saving it so that neither version is lost.
      </p>
      <Button size="sm" variant="outline" onClick={() => void onTakeTheirs()}>
        Load the newer version
      </Button>
    </div>
  )
}
