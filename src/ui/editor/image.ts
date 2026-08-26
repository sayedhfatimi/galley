import { mergeAttributes, Node } from '@tiptap/core'
import { classifyImage, isPreviewable } from '@/core/images'
import { getImage } from '@/ui/lib/imageStore'

/**
 * Images, shown as a placeholder rather than rendered.
 *
 * The node exists because the Markdown bridge produces one, and ProseMirror
 * rejects a whole document containing a node its schema does not know — so an
 * unregistered `image` does not degrade the picture, it blanks the entire
 * manuscript. A document exported from a notes app almost always has one.
 *
 * A reference is NEVER fetched. Rendering `<img src>` against whatever host the
 * Markdown names would make galley reach the network on behalf of a document
 * the reader merely pasted, which is the one thing client-side compilation
 * exists to rule out — so a remote or unsupported reference keeps its
 * placeholder, exactly as before.
 *
 * A file the reader has ATTACHED is different: those bytes are already on this
 * device, in this browser, and showing them costs no request. So the node view
 * looks the name up in the local store and swaps in a preview only if it finds
 * one. Either way the editor tells the same story the PDF will.
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

  /**
   * Rendered as a node view rather than by `renderHTML` because the answer is
   * asynchronous: whether a preview exists is a question for IndexedDB. It
   * starts as the placeholder and upgrades in place if the bytes are found.
   */
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.className = 'image-placeholder'
      const { src, alt, title } = node.attrs as {
        src: string
        alt: string | null
        title: string | null
      }
      dom.setAttribute('data-image', '')
      dom.setAttribute('data-src', src ?? '')
      if (src) dom.title = src
      dom.textContent = `Image: ${alt || title || src || 'image'}`

      let objectUrl: string | null = null
      const image = classifyImage(src ?? '')
      // A PDF is a valid figure that no browser can draw in an <img>, so it
      // keeps the placeholder rather than becoming an invisible empty box.
      if (image.kind === 'supported' && isPreviewable(image.name)) {
        getImage(image.name).then((bytes) => {
          if (!bytes) return
          objectUrl = URL.createObjectURL(new Blob([bytes]))
          const img = document.createElement('img')
          img.className = 'image-preview'
          img.alt = alt ?? ''
          // If the bytes turn out not to be readable after all, fall back
          // rather than leaving a broken image where the figure should be.
          img.onerror = () => {
            dom.textContent = `Image: ${alt || title || src || 'image'}`
            dom.classList.add('image-placeholder')
          }
          img.onload = () => {
            dom.replaceChildren(img)
            dom.classList.remove('image-placeholder')
          }
          img.src = objectUrl
        })
      }

      return {
        dom,
        // The blob URL is this element's alone; leaving it behind would leak a
        // whole image per edit that recreates the node.
        destroy() {
          if (objectUrl) URL.revokeObjectURL(objectUrl)
        },
      }
    }
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
