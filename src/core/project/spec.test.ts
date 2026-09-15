import { describe, expect, it } from 'vitest'
import { isPart, readPartSpec } from './spec'

describe('isPart', () => {
  it('is a part when a galley key is present, at any value', () => {
    expect(isPart({ galley: { role: 'main' } })).toBe(true)
    // `galley:` written alone parses to null; presence is the intent.
    expect(isPart({ galley: null })).toBe(true)
  })

  it('is a note without one', () => {
    expect(isPart({ title: 'Research' })).toBe(false)
    expect(isPart(null)).toBe(false)
    // The empty frontmatter block Obsidian writes.
    expect(isPart({})).toBe(false)
  })
})

describe('readPartSpec', () => {
  it('applies the same defaults as a structure entry', () => {
    expect(readPartSpec({ galley: { role: 'front' } })).toEqual({
      spec: { role: 'front', numbered: false, listed: true },
      malformed: false,
    })
  })

  it('reads every field', () => {
    expect(
      readPartSpec({
        galley: { role: 'back', numbered: true, listed: false, toc_title: 'Note' },
      }).spec,
    ).toEqual({ role: 'back', numbered: true, listed: false, tocTitle: 'Note' })
  })

  it('honours intent with defaults when the block is malformed', () => {
    // A scalar, a list, or an absent value are all "in the book, badly said".
    for (const galley of ['main', ['main'], null]) {
      expect(readPartSpec({ galley })).toEqual({
        spec: { role: 'main', numbered: true, listed: true },
        malformed: true,
      })
    }
  })

  it('is not malformed merely for omitting fields', () => {
    expect(readPartSpec({ galley: {} }).malformed).toBe(false)
  })
})
