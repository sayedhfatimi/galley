import { Check, Code2, Copy, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * The generated LaTeX, on demand.
 *
 * It is read-only in v1, so keeping it permanently on screen cost half the
 * viewport for something nobody edits. The `.tex` DOWNLOAD deliberately does not
 * live in here — it sits in the action bar, because the source must stay one
 * click away even when a render has failed.
 */
export interface LatexDialogProps {
  tex: string
  onDownload: () => void
}

export function LatexDialog({ tex, onDownload }: LatexDialogProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(tex)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Code2 className="size-3.5" />
          LaTeX
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[85vh] w-[92vw] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>LaTeX source</DialogTitle>
          <DialogDescription>
            {tex.split('\n').length.toLocaleString()} lines. Complete and self-contained —
            this compiles to the same document on your own machine.
          </DialogDescription>
        </DialogHeader>

        <pre className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
          <code>{tex}</code>
        </pre>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="size-3.5" />
            Download .tex
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
