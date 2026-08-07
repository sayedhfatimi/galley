import { Info, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Diagnostic } from '@/core/diagnostics'

/**
 * Notices are shown at conversion time, never at download time. Discovering
 * that figures were dropped after waiting for a render is a worse experience
 * than necessary, so anything galley cannot represent well surfaces here the
 * moment it is parsed.
 *
 * Each notice can be dismissed. They describe a standing property of the
 * document rather than a transient event, so without this a manuscript with an
 * image carries a permanent banner that has already been read — it stops being
 * information and becomes furniture.
 *
 * Dismissal is keyed by content, so an unrelated edit will not resurrect a
 * notice, but a genuinely new one still appears.
 */
export function Diagnostics({ items }: { items: Diagnostic[] }) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())

  const keyOf = (d: Diagnostic) => `${d.kind}:${d.detail ?? ''}`
  const visible = items.filter((d) => !dismissed.has(keyOf(d)))
  if (visible.length === 0) return null

  return (
    <div className="grid gap-2">
      {visible.map((d) => {
        const key = keyOf(d)
        return (
          <Alert key={key} className="pr-10">
            <Info className="size-4" />
            <AlertDescription>
              {d.message}
              {d.detail && (
                <span className="mt-1 block font-mono text-muted-foreground text-xs">
                  {d.detail}
                </span>
              )}
            </AlertDescription>
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(key))}
              aria-label="Dismiss this notice"
              className="absolute top-2.5 right-2.5 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </Alert>
        )
      })}
    </div>
  )
}
