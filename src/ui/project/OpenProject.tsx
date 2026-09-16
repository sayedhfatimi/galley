import { FolderOpen, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The way in, and the honest explanation when there isn't one.
 *
 * `showDirectoryPicker` is Chromium desktop only — roughly 30% of browsers.
 * Firefox has formally declared the File System Access API harmful and will
 * not implement it; Safari has not moved. So this says which browsers work
 * rather than offering a button that fails, and points everyone else at the
 * single-document surface, which is unchanged and loses them nothing except
 * the folder.
 *
 * Reopening is a CLICK, never automatic. `requestPermission` needs a user
 * gesture, so a remembered folder can only ever be an offer — which is why
 * this screen exists at all rather than the last project simply being there.
 */

export interface OpenProjectProps {
  supported: boolean
  remembered: { name: string } | null
  busy: boolean
  error: string | null
  onPick: () => void
  onReopen: () => void
  onForget: () => void
  onCancel: () => void
}

export function OpenProject({
  supported,
  remembered,
  busy,
  error,
  onPick,
  onReopen,
  onForget,
  onCancel,
}: OpenProjectProps) {
  if (!supported) {
    return (
      <Shell>
        <h2 className="font-semibold text-base tracking-tight">
          This browser cannot open a folder
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Reading and writing a folder needs the File System Access API, which today means{' '}
          <strong>Chrome or Edge on the desktop</strong>. Firefox has declined to
          implement it and Safari has not shipped it.
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Everything else in galley works here: paste or open a single Markdown file and
          typeset it exactly as before.
        </p>
        <Button variant="outline" onClick={onCancel}>
          Back to the document
        </Button>
      </Shell>
    )
  }

  return (
    <Shell>
      <h2 className="font-semibold text-base tracking-tight">Open a book</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Choose the folder your chapters live in — an Obsidian vault, or one folder inside
        one. galley reads every Markdown file in it and typesets the ones marked as part
        of the book.
      </p>

      {remembered && (
        <div className="rounded-md border p-3 text-left">
          <p className="text-muted-foreground text-xs">Last opened</p>
          <p className="truncate font-medium text-sm" title={remembered.name}>
            {remembered.name}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={onReopen} disabled={busy}>
              <RotateCcw className="size-3.5" />
              Reopen
            </Button>
            <Button size="sm" variant="ghost" onClick={onForget} disabled={busy}>
              Forget it
            </Button>
          </div>
          <p className="mt-2 text-muted-foreground/70 text-xs leading-relaxed">
            Your browser will ask permission again — it only grants access when you ask
            for it directly.
          </p>
        </div>
      )}

      <Button
        onClick={onPick}
        disabled={busy}
        variant={remembered ? 'outline' : 'default'}
      >
        <FolderOpen className="size-3.5" />
        {remembered ? 'Open a different folder' : 'Choose a folder'}
      </Button>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
        Back to the document
      </Button>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">{children}</div>
    </div>
  )
}
