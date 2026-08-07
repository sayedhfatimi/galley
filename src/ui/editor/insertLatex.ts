import type { Editor } from '@tiptap/react'

/*
 * Snippet placeholder parser + context-aware inserter.
 *
 * Snippets use TextMate-style `${1}`, `${2}`, … sentinels for cursor
 * slots. `parseSnippet` strips them and returns the slot positions in
 * the stripped text (ordered by N, so slot 1 first). `insertLatexSnippet`
 * uses the first slot position to place the caret after insertion.
 *
 * Insertion target depends on context:
 *   - cursor inside a `mathInline` / `mathBlock` node → text inserted
 *     at the caret inside that node
 *   - cursor elsewhere → a new `mathInline` node is created containing
 *     the snippet text
 *
 * Either way, caret lands at slot 1; if the snippet has no slots, the
 * caret stays where TipTap's default insertion behaviour leaves it
 * (after the inserted content).
 */

export type ParsedSnippet = {
  text: string
  /** Positions of slots within `text`, in ascending slot-number order. */
  slotPositions: number[]
}

const SLOT_RE = /\$\{(\d+)\}/g

export function parseSnippet(latex: string): ParsedSnippet {
  type Slot = { n: number; pos: number }
  const slots: Slot[] = []
  let text = ''
  let cursor = 0
  for (const match of latex.matchAll(SLOT_RE)) {
    const idx = match.index ?? 0
    text += latex.slice(cursor, idx)
    slots.push({ n: Number(match[1]), pos: text.length })
    cursor = idx + match[0].length
  }
  text += latex.slice(cursor)
  slots.sort((a, b) => a.n - b.n)
  return { text, slotPositions: slots.map((s) => s.pos) }
}

/**
 * Insert a LaTeX snippet into the editor, choosing the right target
 * based on the current selection.
 */
export function insertLatexSnippet(editor: Editor, latex: string): void {
  const { text, slotPositions } = parseSnippet(latex)
  if (!text) return

  const insideMath = editor.isActive('mathInline') || editor.isActive('mathBlock')

  if (insideMath) {
    const from = editor.state.selection.from
    editor.chain().focus().insertContent(text).run()
    if (slotPositions.length > 0) {
      editor.commands.setTextSelection(from + slotPositions[0])
    }
    return
  }

  // Outside any math node: wrap the snippet in a fresh mathInline node.
  // The inserted node occupies one position for its opening boundary;
  // text content starts at `from + 1`.
  const from = editor.state.selection.from
  const schema = editor.schema
  const mathInline = schema.nodes.mathInline
  if (!mathInline) return
  const node = mathInline.create(null, schema.text(text))
  editor.chain().focus().insertContent(node.toJSON()).run()
  if (slotPositions.length > 0) {
    editor.commands.setTextSelection(from + 1 + slotPositions[0])
  }
}
