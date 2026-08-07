import { mergeAttributes, Node } from '@tiptap/core'

/**
 * An inline footnote.
 *
 * Required by the markdown bridge, which emits `footnote` nodes — without a
 * matching schema entry ProseMirror silently discards them, which is precisely
 * the data loss `src/core/markdown/pm/roundtrip.test.ts` exists to prevent.
 *
 * The note text is the node's *content* rather than an attribute, so the usual
 * selection and editing machinery works on it for free. The identifier is
 * carried so a document that arrived as Markdown keeps its original labels
 * rather than being renumbered on every round trip.
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  content: 'text*',
  // Editing happens in the note's own text; treating it as a single unit for
  // selection would make it impossible to type inside.
  atom: false,

  addAttributes() {
    return {
      identifier: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-identifier'),
        renderHTML: (attributes) =>
          attributes.identifier ? { 'data-identifier': attributes.identifier } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-footnote]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-footnote': '',
        class:
          'rounded border border-border bg-muted px-1 py-0.5 align-super text-[0.7em] text-muted-foreground',
      }),
      0,
    ]
  },
})
