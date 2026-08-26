import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SLASH_ITEMS } from './items'

/**
 * The slash menu was ported from another editor, and three of its entries were
 * inert here: `/table` and `/link` dispatched CustomEvents to a host that does
 * not exist in galley, and `/year` inserted `((…))`, a marker for an audio
 * pipeline galley does not have — so it put literal parentheses into a
 * manuscript.
 *
 * Nothing failed. The commands ran, deleted the typed `/query`, and did
 * nothing, which is indistinguishable from a slow editor.
 */
const SOURCE = readFileSync(join(import.meta.dirname, 'items.ts'), 'utf8')

describe('slash commands', () => {
  it('acts on the editor rather than signalling an absent host', () => {
    // A command that only dispatches an event is inert unless something
    // listens, and nothing in galley does.
    expect(SOURCE).not.toContain('dispatchEvent')
  })

  it('offers nothing that belongs to another product', () => {
    const ids = SLASH_ITEMS.map((i) => i.id)
    // `year` marked a number for text-to-speech. galley typesets; it does not
    // read aloud.
    expect(ids).not.toContain('year')
  })

  it('offers a figure command, now that the renderer can keep that promise', () => {
    // This previously asserted the OPPOSITE, because images were unsupported
    // and an insert command would have promised something the renderer could
    // not deliver. It can now, so the guard flips rather than disappearing.
    const image = SLASH_ITEMS.find((i) => i.id === 'image')
    expect(image).toBeDefined()
    // Wired through a real editor command, not an event nothing listens for —
    // the failure that left three ported commands inert.
    expect(SOURCE).toContain('requestImage()')
  })

  it('describes the figure command in terms of what galley accepts', () => {
    const image = SLASH_ITEMS.find((i) => i.id === 'image')
    expect(image?.description).toMatch(/PNG/i)
  })

  it('describes every entry without referring to features galley lacks', () => {
    const absent = ['media library', 'upload', 'pronounce', 'read aloud']
    for (const item of SLASH_ITEMS) {
      const text = `${item.title} ${item.description}`.toLowerCase()
      for (const term of absent) {
        expect(text, `${item.id} mentions "${term}"`).not.toContain(term)
      }
    }
  })

  it('gives every entry the fields the menu renders', () => {
    for (const item of SLASH_ITEMS) {
      expect(item.id, 'id').toBeTruthy()
      expect(item.title, `${item.id} title`).toBeTruthy()
      expect(item.description, `${item.id} description`).toBeTruthy()
      expect(item.keywords.length, `${item.id} keywords`).toBeGreaterThan(0)
      expect(typeof item.command, `${item.id} command`).toBe('function')
    }
  })

  it('has unique ids, since the help dialog groups by them', () => {
    const ids = SLASH_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
