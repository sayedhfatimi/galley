import type { Editor } from '@tiptap/core'

/*
 * Shared keymap helpers for the math nodes.
 *
 * ProseMirror's default keymap doesn't know how to exit an inline
 * content-bearing node — arrow keys at the boundary get swallowed,
 * Escape is unhandled, Enter splits the parent block. These helpers
 * implement the Obsidian-style escape hatches:
 *
 *   - Escape: always exit to the position just after the math node.
 *   - ArrowRight / ArrowDown at end of content: exit forward.
 *   - ArrowLeft / ArrowUp at start of content: exit backward.
 *   - (Inline only) Enter: exit forward.
 *   - (Block only) Mod-Enter: exit forward into a new paragraph.
 *
 * Each helper returns true when it acted (caller stops propagation)
 * and false when the caret isn't inside a math node (caller lets the
 * default keymap run).
 */

function findMathDepth(editor: Editor, nodeName: string): number | null {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === nodeName) return depth
  }
  return null
}

export function exitMathForward(editor: Editor, nodeName: string): boolean {
  const depth = findMathDepth(editor, nodeName)
  if (depth === null) return false
  const after = editor.state.selection.$from.after(depth)
  editor.chain().focus().setTextSelection(after).run()
  return true
}

export function exitMathBackward(editor: Editor, nodeName: string): boolean {
  const depth = findMathDepth(editor, nodeName)
  if (depth === null) return false
  const before = editor.state.selection.$from.before(depth)
  editor.chain().focus().setTextSelection(before).run()
  return true
}

export function exitMathForwardIfAtEnd(editor: Editor, nodeName: string): boolean {
  const depth = findMathDepth(editor, nodeName)
  if (depth === null) return false
  const { $from, empty } = editor.state.selection
  if (!empty) return false
  if ($from.parentOffset !== $from.parent.content.size) return false
  const after = $from.after(depth)
  editor.chain().focus().setTextSelection(after).run()
  return true
}

export function exitMathBackwardIfAtStart(editor: Editor, nodeName: string): boolean {
  const depth = findMathDepth(editor, nodeName)
  if (depth === null) return false
  const { $from, empty } = editor.state.selection
  if (!empty) return false
  if ($from.parentOffset !== 0) return false
  const before = $from.before(depth)
  editor.chain().focus().setTextSelection(before).run()
  return true
}

/*
 * Exit a math block by placing a fresh empty paragraph after it and
 * dropping the caret inside that paragraph. Used as the Mod-Enter
 * binding so authors can continue writing prose without a separate
 * step.
 */
export function exitMathBlockToNewParagraph(editor: Editor, nodeName: string): boolean {
  const depth = findMathDepth(editor, nodeName)
  if (depth === null) return false
  const after = editor.state.selection.$from.after(depth)
  editor
    .chain()
    .focus()
    .insertContentAt(after, { type: 'paragraph' })
    .setTextSelection(after + 1)
    .run()
  return true
}
