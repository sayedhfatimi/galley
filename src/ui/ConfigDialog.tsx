import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ConfigPanel } from './ConfigPanel'
import { useStore } from './lib/store'

/**
 * Configuration lives behind a dialog rather than beside the editor.
 *
 * It is not something a writer touches while writing — it is set once, before
 * rendering. Keeping it permanently on screen spent a third of the viewport on
 * controls that are idle almost all of the time, and it competed with the
 * document for attention.
 */
export function ConfigDialog() {
  const config = useStore((s) => s.config)
  const setConfig = useStore((s) => s.setConfig)
  const prefilled = useStore((s) => s.prefilled)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="size-3.5" />
          Configure
        </Button>
      </DialogTrigger>
      {/* A plain overflow container rather than ScrollArea: the Radix viewport
          does not cooperate with the dialog's own height constraint, and the
          panel overflowed past the dialog edge. */}
      <DialogContent className="flex max-h-[85vh] w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b p-6 pb-4">
          <DialogTitle>Document setup</DialogTitle>
          <DialogDescription>
            Every change is reflected in the LaTeX immediately, and there is nothing to
            save. The defaults produce a good result on their own.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <ConfigPanel config={config} onChange={setConfig} prefilled={prefilled} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
