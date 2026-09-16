import { mergeAttributes, Node } from '@tiptap/core'

/**
 * A Markdown link definition — `[id]: https://example.com "Title"` — kept as a
 * block of its own.
 *
 * Definitions sit at the root of a document and are referenced from deep
 * inside it, so `mdast-to-pm.ts` resolves them into `linkDefs` before it walks
 * anything. It then used to DROP them, which had two consequences in a vault.
 * A note holding nothing but a list of links round-tripped to an empty file;
 * and a chapter's definitions disappeared from under the book-wide references
 * that `core/project/definitions.ts` exists to serve, so cross-chapter links
 * broke on the first keystroke in the chapter that defined them.
 *
 * An atom, because a definition is one indivisible line of bookkeeping: there
 * is no sensible half of `[id]: url`.
 *
 * Note this does NOT restore reference-style links themselves. `[text][id]`
 * still normalises to `[text](url)`, which keeps the link working and is the
 * same accepted churn as `_em_` becoming `*em*` — rich mode warns about it,
 * and source mode never triggers it. Carrying the reference form on the link
 * mark instead was considered and rejected: editing the URL in the link dialog
 * would leave the reference attribute stale and silently emit the old target,
 * which is a worse failure than the churn it would avoid.
 */
export const LinkDefinition = Node.create({
  name: 'linkDefinition',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      identifier: { default: '' },
      label: { default: '' },
      url: { default: '' },
      title: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-link-definition]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const title = node.attrs.title ? ` "${node.attrs.title}"` : ''
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-link-definition': '',
        class: 'galley-link-definition',
      }),
      `[${node.attrs.label || node.attrs.identifier}]: ${node.attrs.url}${title}`,
    ]
  },
})
