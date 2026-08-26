import { Extension } from '@tiptap/core'

/**
 * Asking for a figure to attach.
 *
 * Dropping and pasting were the only ways in, which makes a figure something
 * you have to already know about. The toolbar button and the `/image` command
 * both need to open a file picker, and neither can reach React state on its
 * own — a slash command receives only the editor and a range.
 *
 * Routed through a real editor command for the same reason as `requestLink`:
 * if nothing handles it the command still runs and the default handler is the
 * only thing that does nothing, rather than an event vanishing into a page that
 * never listened. Dispatching a CustomEvent is what left three slash commands
 * inert when this editor was first ported.
 */
export interface ImagePromptOptions {
  onRequest: () => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imagePrompt: {
      /** Ask the host to open a file picker for a figure. */
      requestImage: () => ReturnType
    }
  }
}

export const ImagePrompt = Extension.create<ImagePromptOptions>({
  name: 'imagePrompt',

  addOptions() {
    return { onRequest: () => {} }
  },

  addCommands() {
    return {
      requestImage: () => () => {
        this.options.onRequest()
        return true
      },
    }
  },
})
