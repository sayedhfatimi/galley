import { InputRule, mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import {
  exitMathBackwardIfAtStart,
  exitMathForward,
  exitMathForwardIfAtEnd,
} from './math-keymap'
import { MathNodeView } from './math-nodeview'

/*
 * Inline math node — Obsidian-style.
 *
 * The TeX source is the node's *text content*, not an attribute, so
 * ProseMirror's normal cursor / selection machinery handles editing
 * for free. The NodeView swaps between two views:
 *   - Cursor outside the node: rendered MathJax SVG
 *   - Cursor inside the node:  the raw text content shown as
 *     `$<tex>$` (the dollar delimiters are rendered as static
 *     bookends; the TeX inside is a live contentDOM where typing,
 *     selection, and arrow-key navigation all work normally).
 *
 * No inline marks (bold / italic / etc) are allowed inside math so
 * the round-trip stays clean — `$\textbf{x}$` is plain TeX, not a
 * bolded `\textbf{x}` markdown fragment.
 *
 * Round-trips to/from MDAST `inlineMath` nodes via the markdown
 * converters in `markdown/*.ts`.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      insertMathInline: (tex?: string) => ReturnType
    }
  }
}

export const MathInline = Node.create({
  name: 'mathInline',
  inline: true,
  group: 'inline',
  content: 'text*',
  marks: '_',
  selectable: true,
  atom: false,

  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': '' }), 0]
  },

  addCommands() {
    return {
      insertMathInline:
        (tex?: string) =>
        ({ chain, state }) => {
          const text = (tex ?? '').trim()
          const node = text
            ? this.type.create(null, state.schema.text(text))
            : this.type.create(null)
          return chain().insertContent(node.toJSON()).focus().run()
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Escape: () => exitMathForward(this.editor, this.name),
      Enter: () => exitMathForward(this.editor, this.name),
      ArrowRight: () => exitMathForwardIfAtEnd(this.editor, this.name),
      ArrowLeft: () => exitMathBackwardIfAtStart(this.editor, this.name),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView)
  },

  addInputRules() {
    // `$tex$` typed inline → math node with `tex` as text content.
    // The regex requires non-whitespace at the edges of the math so
    // "$ foo $" (a literal price-like form) isn't grabbed.
    return [
      new InputRule({
        find: /(?:^|\s)\$([^\s$][^$\n]*[^\s$]|[^\s$])\$$/,
        handler: ({ state, range, match }) => {
          const tex = match[1] ?? ''
          if (!tex) return
          const node = this.type.create(null, state.schema.text(tex))
          // `range.from` may land on the leading space; preserve it.
          const leadingSpace = match[0]?.startsWith(' ') ? 1 : 0
          state.tr.replaceWith(range.from + leadingSpace, range.to, node)
        },
      }),
    ]
  },
})
