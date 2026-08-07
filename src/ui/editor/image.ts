import { mergeAttributes, Node } from '@tiptap/core'

/**
 * Images, shown as a placeholder rather than rendered.
 *
 * The node exists because the Markdown bridge produces one, and ProseMirror
 * rejects a whole document containing a node its schema does not know — so an
 * unregistered `image` does not degrade the picture, it blanks the entire
 * manuscript. A document exported from a notes app almost always has one.
 *
 * It is deliberately NOT `<img src>`. Rendering the real thing would fetch from
 * whatever host the Markdown names, which would make galley reach the network on
 * behalf of a document the reader merely pasted. Nothing here leaves the device.
 *
 * The placeholder also matches what the PDF does with an image, so the editor
 * tells the same story the output does.
 */
export const ImagePlaceholder = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: null },
      title: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, title } = HTMLAttributes
    const label = alt || title || src || 'image'
    return [
      'div',
      mergeAttributes(
        { 'data-image': '', 'data-src': src, title: src },
        { class: 'image-placeholder' },
      ),
      `Image: ${label}`,
    ]
  },
})
