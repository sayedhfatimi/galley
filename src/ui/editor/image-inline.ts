import { mergeAttributes, Node } from '@tiptap/core'

/**
 * An image sharing a line with prose.
 *
 * `ImagePlaceholder` is `group: 'block'`, so it cannot sit inside a
 * paragraph — which is why the bridge used to drop an inline image outright
 * and `Text ![](fig.png) more` round-tripped to `Text  more`, deleting the
 * picture from the author's file on the first keystroke. A lone-image
 * paragraph is still promoted to the block node; this is the narrower case.
 *
 * Deliberately NOT a preview. The block node looks its name up in the local
 * image store and can show the bytes; doing the same mid-sentence would mean
 * a picture inside a line of text at whatever size it happens to be, which
 * reflows the paragraph the author is reading. The name is shown instead, so
 * the editor still says what the PDF will contain.
 *
 * Both forms serialise back through one `imageFromPm`, so mdast — and the
 * LaTeX after it — sees the same `image` node either way.
 */
export const ImageInline = Node.create({
  name: 'imageInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: null },
      title: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-image-inline]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-image-inline': '',
        class: 'galley-inline-image',
      }),
      String(node.attrs.alt || node.attrs.src || 'image'),
    ]
  },
})
