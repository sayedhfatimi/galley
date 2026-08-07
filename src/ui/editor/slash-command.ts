import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion'
import { filterSlashItems, type SlashItem } from './items'
import { SlashMenu, type SlashMenuRef } from './SlashMenu'

/*
 * Slash command extension.
 *
 * Wires the TipTap Suggestion plugin to the `/` trigger, filters
 * SLASH_ITEMS by the typed query, and renders the React `SlashMenu`
 * popup positioned at the caret. Arrow keys / Enter / Escape are
 * forwarded to the menu via its imperative handle.
 */

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null
          let popup: HTMLDivElement | null = null

          function place(rect: DOMRect | null | undefined) {
            if (!popup || !rect) return
            popup.style.top = `${rect.bottom + 6}px`
            popup.style.left = `${rect.left}px`
          }

          return {
            onStart: (props: SuggestionProps<SlashItem>) => {
              component = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor,
              })
              popup = document.createElement('div')
              popup.style.position = 'fixed'
              popup.style.zIndex = '50'
              popup.appendChild(component.element)
              document.body.appendChild(popup)
              place(props.clientRect?.())
            },
            onUpdate: (props: SuggestionProps<SlashItem>) => {
              component?.updateProps(props)
              place(props.clientRect?.())
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === 'Escape') {
                popup?.remove()
                popup = null
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              popup?.remove()
              popup = null
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})
