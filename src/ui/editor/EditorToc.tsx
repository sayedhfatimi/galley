import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { ListTree, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * Floating in-editor table of contents.
 *
 * Pinned top-right, the sparsest quadrant of the writing surface: text runs
 * left, the bottom-right corner holds the word count, and the top edge is the
 * toolbar. Chrome matches EditorStatusBar so the two read as one family.
 *
 * Every heading level appears, h1 to h6. In galley `#` is a chapter and the
 * document owns its own title, so omitting a level would misrepresent the
 * structure of the very documents this tool exists to typeset.
 *
 * Depth is shown twice over — indentation and type size — because indentation
 * alone stops being legible past the third level in a panel this narrow.
 */

type TocHeading = {
  level: number
  text: string
  pos: number
}

/** Indentation and type scale per heading level. */
const DEPTH_STYLES: Record<number, string> = {
  1: 'font-semibold text-[0.8125rem] text-foreground',
  2: 'pl-3 font-medium text-foreground/90',
  3: 'pl-6 text-foreground/80',
  4: 'pl-9 text-[0.6875rem] text-foreground/70',
  5: 'pl-12 text-[0.6875rem] text-foreground/60',
  6: 'pl-14 text-[0.625rem] text-foreground/55',
}

export function EditorToc({
  editor,
  open,
  onClose,
}: {
  editor: Editor | null
  open: boolean
  onClose: () => void
}) {
  const headings: TocHeading[] =
    useEditorState({
      editor,
      selector: ({ editor: e }): TocHeading[] => {
        if (!e) return []
        const out: TocHeading[] = []
        e.state.doc.descendants((node, pos) => {
          if (node.type.name !== 'heading') return true
          const level = (node.attrs as { level?: number }).level ?? 1
          const text = node.textContent.trim()
          if (!text) return true
          out.push({ level, text, pos })
          return true
        })
        return out
      },
      // Compare by content so an edit inside a paragraph does not rebuild the
      // list.
      equalityFn: (a, b) => {
        if (a === null || b === null) return a === b
        if (a.length !== b.length) return false
        return a.every((h, i) => {
          const o = b[i]
          if (!o) return false
          return h.pos === o.pos && h.text === o.text && h.level === o.level
        })
      },
    }) ?? []

  if (!open) return null

  function scrollTo(h: TocHeading) {
    if (!editor) return
    const dom = editor.view.nodeDOM(h.pos)
    if (!(dom instanceof HTMLElement)) return

    // Walk up to the nearest scrollable ancestor — the editor's content
    // wrapper, which is the only thing that scrolls, since the page itself is
    // locked to the viewport.
    let container: HTMLElement | null = dom.parentElement
    while (container && container !== document.body) {
      const overflowY = window.getComputedStyle(container).overflowY
      if (overflowY === 'auto' || overflowY === 'scroll') break
      container = container.parentElement
    }
    if (!container) return

    const HEADER_OFFSET = 40
    const containerRect = container.getBoundingClientRect()
    const headingRect = dom.getBoundingClientRect()
    const target =
      headingRect.top - containerRect.top + container.scrollTop - HEADER_OFFSET
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })

    // Deliberately NOT moving the caret. Focusing the editor makes the browser
    // scroll the focused element into view, which fights the smooth scroll and
    // lands on the wrong heading. This is navigation; the writer clicks into
    // the body to edit.
  }

  return (
    <aside
      className="pointer-events-auto absolute top-6 right-4 z-10 flex max-h-[60vh] w-72 flex-col overflow-hidden rounded-md bg-background/90 text-xs shadow-sm ring-1 ring-border/50 backdrop-blur-sm"
      aria-label="Table of contents"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium uppercase tracking-wide">
          <ListTree className="size-3.5" aria-hidden />
          Contents
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
          aria-label="Hide table of contents"
          className="rounded p-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </header>
      {headings.length === 0 ? (
        <p className="px-3 py-3 italic text-muted-foreground">
          Headings appear here as you write them.
        </p>
      ) : (
        <ol className="flex-1 overflow-y-auto px-1.5 py-1.5">
          {headings.map((h) => (
            <li key={`${h.pos}-${h.level}`}>
              <button
                type="button"
                // preventDefault keeps the editor focused; without it the
                // button steals focus and ProseMirror normalises whitespace on
                // blur, which registers as an edit nothing actually made.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => scrollTo(h)}
                className={cn(
                  'block w-full truncate rounded px-2 py-1 text-left transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  DEPTH_STYLES[h.level] ?? DEPTH_STYLES[6],
                )}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
