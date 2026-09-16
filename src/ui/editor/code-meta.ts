import { Extension } from '@tiptap/core'

/**
 * The text after the language on a fenced code block — ```` ```js title=x ````.
 *
 * mdast calls it `meta` and galley does nothing with it: the LaTeX uses only
 * the language. Doing nothing with something is not a reason to delete it out
 * of the author's file, though, and StarterKit's `codeBlock` carries only
 * `language`, so an unrecognised attribute would be dropped by the schema even
 * once the bridge started carrying it.
 *
 * A global attribute rather than a replacement node, so StarterKit's code
 * block keeps every behaviour it already has.
 */
export const CodeBlockMeta = Extension.create({
  name: 'codeBlockMeta',

  addGlobalAttributes() {
    return [
      {
        types: ['codeBlock'],
        attributes: {
          meta: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-meta'),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.meta ? { 'data-meta': String(attributes.meta) } : {},
          },
        },
      },
    ]
  },
})
