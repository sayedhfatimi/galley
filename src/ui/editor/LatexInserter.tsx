import type { Editor } from '@tiptap/react'
import { Search, Sigma, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  CATEGORY_LABELS,
  filterCatalog,
  groupedCatalog,
  type LatexEntry,
} from './catalog'
import { insertLatexSnippet } from './insertLatex'
import { SymbolCell } from './SymbolCell'

/**
 * A browsable catalogue of LaTeX symbols and structures.
 *
 * galley converts Markdown *to LaTeX*, so maths is not a side feature — it is
 * the one place a writer's input reaches the typesetter unmediated. Anyone
 * comfortable enough to want an integral or a matrix should not have to
 * remember its command, and anyone who is not should be able to find one.
 *
 * Structures such as fractions and matrices carry placeholder slots;
 * `insertLatexSnippet` places the cursor in the first of them.
 */
export function LatexInserter({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    if (!query.trim()) return groupedCatalog()
    const matches = filterCatalog(query)
    return matches.length > 0 ? [{ category: 'search' as const, entries: matches }] : []
  }, [query])

  const choose = (entry: LatexEntry) => {
    if (!editor) return
    insertLatexSnippet(editor, entry.latex)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Insert maths"
          disabled={!editor}
        >
          <Sigma className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="relative border-b p-2">
          <Search
            className="-translate-y-1/2 absolute top-1/2 left-4 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols — integral, matrix, alpha…"
            className="h-8 pr-8 pl-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="-translate-y-1/2 absolute top-1/2 right-4 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="px-1 py-6 text-center text-muted-foreground text-sm">
              Nothing matches “{query}”.
            </p>
          )}
          {groups.map((group) => (
            <section key={group.category} className="mb-3 last:mb-0">
              {group.category !== 'search' && (
                <h4 className="px-1 pb-1 font-medium text-muted-foreground text-xs">
                  {CATEGORY_LABELS[group.category]}
                </h4>
              )}
              <div className="grid grid-cols-6 gap-1">
                {group.entries.map((entry) => (
                  <SymbolCell
                    key={entry.latex}
                    entry={entry}
                    onSelect={choose}
                    large={entry.category === 'structures'}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
