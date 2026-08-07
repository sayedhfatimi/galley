import { InputRule, mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import {
  exitMathBackwardIfAtStart,
  exitMathBlockToNewParagraph,
  exitMathForward,
  exitMathForwardIfAtEnd,
} from './math-keymap'
import { MathNodeView } from './math-nodeview'

/*
 * Block math node — Obsidian-style.
 *
 * Like MathInline, the TeX is the node's text content rather than an
 * attribute so ProseMirror's normal selection model drives editing.
 * Cursor outside → rendered MathJax SVG; cursor inside → raw text
 * editing surface with `$$ … $$` bookends.
 *
 * `defining: true` keeps backspace from merging the node into its
 * neighbour when the content is empty.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathBlock: {
      insertMathBlock: (tex?: string) => ReturnType
    }
  }
}

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  content: 'text*',
  marks: '_',
  selectable: true,
  atom: false,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-math-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '' }), 0]
  },

  addCommands() {
    return {
      insertMathBlock:
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
      'Mod-Enter': () => exitMathBlockToNewParagraph(this.editor, this.name),
      ArrowDown: () => exitMathForwardIfAtEnd(this.editor, this.name),
      ArrowUp: () => exitMathBackwardIfAtStart(this.editor, this.name),
      // Plain Enter inside block math inserts a literal newline into
      // the TeX content (which is what `text*` content allows). Without
      // this binding TipTap's default splitBlock would tear the math
      // node in two.
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection
        let inside = false
        for (let depth = $from.depth; depth >= 0; depth--) {
          if ($from.node(depth).type.name === this.name) {
            inside = true
            break
          }
        }
        if (!inside) return false
        editor.chain().focus().insertContent('\n').run()
        return true
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView)
  },

  addInputRules() {
    // `$$` on its own line → empty block math node (cursor lands
    // inside ready for typing). For pasted content, the markdown
    // importer handles `$$ … $$` via remark-math directly.
    return [
      new InputRule({
        find: /^\$\$$/,
        handler: ({ state, range }) => {
          const node = this.type.create(null)
          state.tr.replaceWith(range.from - 1, range.to, node)
        },
      }),
    ]
  },
})
