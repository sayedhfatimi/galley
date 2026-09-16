import { mergeAttributes, Node } from '@tiptap/core'

/**
 * Raw HTML, carried through the editor untouched.
 *
 * galley does not typeset HTML — `latex/serialize.ts` emits it as literal
 * text and raises a `raw-html` diagnostic — but declining to typeset
 * something is not a licence to delete it. Before these nodes existed the
 * ProseMirror bridge had nowhere to put an `html` mdast node, so
 * `Text <br> more` round-tripped to `Text  more` and `<div>hi</div>` to
 * nothing at all. In a folder project that is the author's own file, and one
 * keystroke was enough to do it.
 *
 * Both are **atoms holding their source verbatim in one attribute**. Atoms
 * because a fragment of raw markup is a single thing to the writer: half of a
 * `<div>` is not a smaller `<div>`, it is a broken file. Verbatim because
 * anything else is a second opinion about what the author meant, and the one
 * job here is to give back exactly what was given.
 *
 * mdast has a single `html` node type for both positions, so
 * `pm-to-mdast.ts` maps both of these back through one function.
 */

const value = {
  value: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-html') ?? '',
    renderHTML: (attributes: Record<string, unknown>) => ({
      'data-html': String(attributes.value ?? ''),
    }),
  },
}

export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: () => value,

  parseHTML() {
    return [{ tag: 'div[data-html]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    // The source shown as-is rather than rendered. Rendering it would be a
    // promise galley cannot keep: the PDF will contain the markup as text.
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'galley-raw-html' }),
      String(node.attrs.value ?? ''),
    ]
  },
})

export const HtmlInline = Node.create({
  name: 'htmlInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes: () => value,

  parseHTML() {
    return [{ tag: 'span[data-html]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'galley-raw-html' }),
      String(node.attrs.value ?? ''),
    ]
  },
})
