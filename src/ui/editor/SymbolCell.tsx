import { useEffect, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LatexEntry } from './catalog'
import { renderTex } from './mathjax'

/*
 * One clickable cell in the LaTeX inserter grid.
 *
 * Rendering split:
 *   - entry.unicode set → cell renders the glyph directly (cheap path,
 *     covers Greek letters, relations, logic — anything that has a
 *     single-glyph Unicode form).
 *   - no unicode → cell mounts a MathJax SVG preview of entry.latex.
 *     MathJax HTML is cached at the module level (keyed by latex
 *     string) so the second time the popover opens, every template
 *     cell renders synchronously.
 *
 * Tooltip on every cell shows the raw LaTeX command so authors learn
 * what they're inserting.
 */

const cache = new Map<string, string>()
const PREVIEW_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f']

function injectHtml(host: HTMLElement, html: string): void {
  while (host.firstChild) host.removeChild(host.firstChild)
  if (!html) return
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  for (const child of Array.from(parsed.body.children)) {
    host.appendChild(child)
  }
}

export function SymbolCell({
  entry,
  onSelect,
  large = false,
}: {
  entry: LatexEntry
  onSelect: (entry: LatexEntry) => void
  /**
   * Structure cells (matrices, fractions, bounded sums) need more
   * vertical room than glyph cells. When true, the cell renders
   * taller and allows a larger MathJax SVG before clipping.
   */
  large?: boolean
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null)
  const needsRender = !entry.unicode
  // Substitute ${N} placeholders with placeholder LETTERS for the
  // preview so MathJax has something meaningful to typeset. Stripping
  // to empty braces (\frac{}{}) rendered as tiny degenerate dots.
  // insertLatex.ts handles the real placeholders at insertion time.
  const previewLatex = entry.latex.replaceAll(
    /\$\{(\d+)\}/g,
    (_, n: string) => PREVIEW_LETTERS[(Number(n) - 1) % PREVIEW_LETTERS.length],
  )
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    if (!needsRender) return
    const cached = cache.get(previewLatex)
    if (cached) {
      if (hostRef.current) injectHtml(hostRef.current, cached)
      return
    }
    let cancelled = false
    renderTex(previewLatex, false)
      .then((html) => {
        if (cancelled) return
        cache.set(previewLatex, html)
        if (hostRef.current) injectHtml(hostRef.current, html)
      })
      .catch(() => {
        // A failed render is not worth reporting: the raw TeX is shown instead,
        // which is still usable.
        if (cancelled) return
        setErrored(true)
      })
    return () => {
      cancelled = true
    }
  }, [needsRender, previewLatex])

  const heightClass = large ? 'h-14' : 'h-9'
  const svgMaxHeightClass = large
    ? '[&_mjx-container>svg]:!max-h-11'
    : '[&_mjx-container>svg]:!max-h-7'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(entry)}
          aria-label={entry.label}
          className={`flex ${heightClass} min-w-9 items-center justify-center overflow-hidden rounded-md border border-transparent bg-background px-2 text-foreground transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          {entry.unicode ? (
            <span className="text-base leading-none">{entry.unicode}</span>
          ) : errored ? (
            <span className="font-mono text-xs text-muted-foreground">{entry.latex}</span>
          ) : (
            <span
              ref={hostRef}
              className={`flex items-center justify-center text-foreground/90 [&_mjx-container]:!my-0 [&_mjx-container>svg]:!max-w-full [&_mjx-container>svg]:!w-auto ${svgMaxHeightClass}`}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-xs">{entry.latex}</span>
      </TooltipContent>
    </Tooltip>
  )
}
