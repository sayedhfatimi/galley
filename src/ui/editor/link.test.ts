import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createExtensions } from './extensions'
import { SLASH_ITEMS } from './items'

/**
 * The link request must reach the host.
 *
 * The ported version dispatched a CustomEvent nobody listened for, so `/link`
 * silently did nothing. Routing it through an editor command means a missing
 * handler is a configuration mistake this test can see, rather than an event
 * disappearing into the page.
 */
function editorWith(onRequestLink: (href: string) => void) {
  return new Editor({
    extensions: createExtensions({ onRequestLink }),
    content: '<p>some text</p>',
  })
}

describe('requestLink', () => {
  it('calls the host handler', () => {
    const seen: string[] = []
    const editor = editorWith((href) => seen.push(href))
    editor.commands.requestLink()
    expect(seen).toEqual([''])
    editor.destroy()
  })

  it('passes the existing href so an edit starts from it', () => {
    const seen: string[] = []
    const editor = editorWith((href) => seen.push(href))
    editor.commands.selectAll()
    editor.commands.setLink({ href: 'https://example.com' })
    editor.commands.requestLink()
    expect(seen).toEqual(['https://example.com'])
    editor.destroy()
  })

  it('is what the /link slash command invokes', () => {
    const seen: string[] = []
    const editor = editorWith((href) => seen.push(href))
    const item = SLASH_ITEMS.find((i) => i.id === 'link')
    expect(item).toBeDefined()
    // The range a real invocation would delete: the typed "/link".
    item?.command({ editor, range: { from: 1, to: 1 } })
    expect(seen).toHaveLength(1)
    editor.destroy()
  })

  it('does not throw when no handler is configured', () => {
    const editor = new Editor({ extensions: createExtensions(), content: '<p>a</p>' })
    expect(() => editor.commands.requestLink()).not.toThrow()
    editor.destroy()
  })
})
