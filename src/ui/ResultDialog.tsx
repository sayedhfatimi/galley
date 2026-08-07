import { AlertTriangle, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { checkCompliance } from '@/core/kdp'
import { pageCountFromLog } from '@/core/pagecount'
import { useStore } from './lib/store'
import type { useCompile } from './lib/useCompile'

/**
 * The render outcome, as a result rather than a pane.
 *
 * Compilation is an explicit act with an explicit answer, so it gets a surface
 * that appears when there is something to say and goes away when there is not —
 * instead of an empty half-screen waiting to be filled.
 *
 * The rule that shapes the failure state: a failed render must still leave the
 * reader with the LaTeX. A partial failure must not become a total one.
 */
export interface ResultDialogProps {
  compile: ReturnType<typeof useCompile>
  onDownloadTex: () => void
}

export function ResultDialog({ compile, onDownloadTex }: ResultDialogProps) {
  const fileName = useStore((s) => s.fileName)
  const open = useStore((s) => s.resultOpen)
  const onOpenChange = useStore((s) => s.setResultOpen)
  const [showLog, setShowLog] = useState(false)
  const config = useStore((s) => s.config)
  const { state, progress, pdfUrl, pdfBytes, log, error, elapsedMs } = compile

  // Only checked when a print target was asked for, and only against the real
  // page count — the inside-margin rule cannot be evaluated before the document
  // has been typeset, which is precisely why the preset alone cannot guarantee
  // it. Silence here means the stated minimums are met, not that the upload
  // will be accepted.
  const pageCount = state === 'done' ? pageCountFromLog(log) : null
  const printProblems =
    config.printTarget === 'kdp' && pageCount !== null
      ? checkCompliance(config, pageCount)
      : []

  const downloadPdf = () => {
    if (!pdfUrl) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = `${fileName}.pdf`
    a.click()
  }

  const title =
    state === 'error'
      ? 'That did not compile'
      : state === 'done'
        ? 'Your PDF'
        : 'Rendering'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[92vw] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {state === 'done'
              ? `${pageCount !== null ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}, ` : ''}${(pdfBytes / 1024).toFixed(0)} kB, typeset in ${(elapsedMs / 1000).toFixed(1)} seconds — entirely on this device.`
              : state === 'running'
                ? progress
                : state === 'error'
                  ? 'The LaTeX is still yours to take away.'
                  : ''}
          </DialogDescription>
        </DialogHeader>

        {state === 'running' && (
          <div className="grid min-h-0 flex-1 place-items-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">{progress}</p>
              <Button variant="ghost" size="sm" onClick={compile.cancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {state === 'error' && error && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onDownloadTex}>
                <Download className="size-3.5" />
                Download the .tex
              </Button>
              {log && (
                <Button variant="ghost" size="sm" onClick={() => setShowLog((v) => !v)}>
                  {showLog ? 'Hide' : 'Show'} the typesetter log
                </Button>
              )}
            </div>
            {showLog && (
              <pre className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                <code>{log.slice(-8000)}</code>
              </pre>
            )}
          </div>
        )}

        {state === 'done' && printProblems.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              <span className="font-medium">
                This does not meet Amazon KDP's print requirements.
              </span>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {printProblems.map((p) => (
                  <li key={p.message}>{p.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {state === 'done' && pdfUrl && (
          <>
            <iframe
              src={pdfUrl}
              title="Rendered PDF"
              className="min-h-0 flex-1 rounded-lg border bg-white"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={downloadPdf}>
                <Download className="size-3.5" />
                Download .pdf
              </Button>
              <Button variant="outline" size="sm" onClick={onDownloadTex}>
                <Download className="size-3.5" />
                Download .tex
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
