import { Extension } from '@tiptap/core'

/**
 * Asking for a link target.
 *
 * The toolbar button and the `/link` command both need to collect a URL, and
 * neither can reach React state on its own — a slash command receives only the
 * editor and a range. Routing the request through a real editor command keeps
 * that wiring live: if nothing handles it, the command still runs and the
 * default handler is the only thing that does nothing, rather than an event
 * vanishing into a page that never listened.
 *
 * The alternative, dispatching a CustomEvent, is what left `/link` inert when
 * this editor was first ported.
 */
export interface LinkPromptOptions {
  /** Receives the href already on the selection, empty when adding a new one. */
  onRequest: (currentHref: string) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    linkPrompt: {
      /** Ask the host to collect a URL for the current selection. */
      requestLink: () => ReturnType
    }
  }
}

export const LinkPrompt = Extension.create<LinkPromptOptions>({
  name: 'linkPrompt',

  addOptions() {
    return { onRequest: () => {} }
  },

  addCommands() {
    return {
      requestLink:
        () =>
        ({ editor }) => {
          const href = editor.getAttributes('link').href
          this.options.onRequest(typeof href === 'string' ? href : '')
          return true
        },
    }
  },
})
