import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'

/*
 * Subtle "247 words · 1,432 chars" indicator pinned to the bottom-right
 * of the editor viewport. Subscribes via useEditorState so the values
 * update on every doc change but the surrounding chrome doesn't
 * re-render until the numbers actually move.
 *
 * `editor.getText()` returns the plain-text content of the doc with
 * a block separator between top-level blocks — good enough for both
 * word and char counts. Words split on whitespace; chars include
 * spaces (matches Google Docs / Notion conventions).
 */
export function EditorStatusBar({ editor }: { editor: Editor | null }) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return { words: 0, chars: 0, minutes: 0 }
      const text = e.getText().trim()
      const chars = text.length
      const words = text ? text.split(/\s+/).length : 0
      // 200 wpm is the usual convention for a reading-time estimate.
      const minutes = words > 0 ? Math.max(1, Math.round(words / 200)) : 0
      return { words, chars, minutes }
    },
  }) ?? { words: 0, chars: 0, minutes: 0 }

  return (
    <div className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 text-xs font-mono text-muted-foreground shadow-sm ring-1 ring-border/50 backdrop-blur-sm">
      <span>{counts.words.toLocaleString()} words</span>
      <span aria-hidden>·</span>
      <span>{counts.chars.toLocaleString()} chars</span>
      {counts.minutes > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span>~{counts.minutes} min read</span>
        </>
      ) : null}
    </div>
  )
}
