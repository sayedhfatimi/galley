import { Download, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { ConfigDialog } from './ConfigDialog'
import { LatexDialog } from './LatexDialog'
import { ThemeToggle } from './ThemeToggle'

/**
 * The one place actions live.
 *
 * Configure and Render sit in a single button group because they are one act:
 * configuration exists to change what gets rendered, and separating them made
 * the relationship invisible. Everything that produces an artefact — the .tex,
 * the PDF — is reachable from here rather than buried in a pane.
 */
export interface ActionBarProps {
  /** Derived in App, where the conversion is memoised. */
  tex: string
  busy: boolean
  /** A document with figures is handed over as a zip; say so on the button. */
  hasImages: boolean
  onRender: () => void
  onDownloadTex: () => void
}

export function ActionBar({
  tex,
  busy,
  hasImages,
  onRender,
  onDownloadTex,
}: ActionBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/logo.png" alt="" className="size-8 shrink-0 rounded-md" />
        <div className="min-w-0">
          {/* House attribution, in the estate's shared treatment. Set beside the
              wordmark rather than beneath it because this bar already carries a
              tagline on the second line. */}
          <div className="flex items-baseline gap-1.5">
            <h1 className="font-semibold text-base leading-none tracking-tight">
              galley
            </h1>
            <span className="text-[10px] text-muted-foreground/60 tracking-wide">
              by Valeon
            </span>
          </div>
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            Markdown in, a typeset PDF and the LaTeX that made it out.
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <LatexDialog tex={tex} onDownload={onDownloadTex} />

        {/* Always available, never behind a dialog: a failed render must still
            leave the source one click away. */}
        <Button variant="ghost" size="sm" onClick={onDownloadTex} disabled={!tex.trim()}>
          <Download className="size-3.5" />
          {hasImages ? '.zip' : '.tex'}
        </Button>

        <ButtonGroup>
          <ConfigDialog />
          <Button size="sm" onClick={onRender} disabled={busy || !tex.trim()}>
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileText className="size-3.5" />
            )}
            Render PDF
          </Button>
        </ButtonGroup>

        <ThemeToggle />
      </div>
    </header>
  )
}
