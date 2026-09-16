import { describe, expect, it } from 'vitest'
import { canWritePartSpec, isPart, readPartSpec, writePartSpec } from './spec'

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

  // The early-return guard is what makes readPartSpec total. Every case above
  // passes a `galley` key, so without this the guard is exercised only through
  // isPart — deleting it would let readPartSpec(null) throw and make a note
  // report malformed: true, and nothing would fail.
  it('is total for a file that is not in the book', () => {
    const defaults = {
      spec: { role: 'main', numbered: true, listed: true },
      malformed: false,
    }
    expect(readPartSpec(null)).toEqual(defaults)
    expect(readPartSpec({ title: 'Research' })).toEqual(defaults)
    expect(readPartSpec({})).toEqual(defaults)
  })
})

describe('writePartSpec', () => {
  it('adds the block to a document with no frontmatter', () => {
    const out = writePartSpec('# Chapter\n', {
      role: 'main',
      numbered: true,
      listed: true,
    })
    expect(out).toContain('galley:')
    expect(out).toContain('role: main')
    expect(out).toContain('# Chapter')
  })

  it('omits fields that match the role default', () => {
    const out = writePartSpec('# C\n', { role: 'front', numbered: false, listed: true })
    expect(out).toContain('role: front')
    expect(out).not.toContain('numbered')
    expect(out).not.toContain('listed')
  })

  it("preserves the author's other keys and comments", () => {
    const src = '---\n# my note\ntitle: A Chapter\n---\n\n# C\n'
    const out = writePartSpec(src, { role: 'main', numbered: true, listed: true })
    expect(out).toContain('# my note')
    expect(out).toContain('title: A Chapter')
  })

  it('removes the key when passed null, making the file a note', () => {
    const src = '---\ntitle: T\ngalley:\n  role: main\n---\n\n# C\n'
    const out = writePartSpec(src, null)
    expect(out).not.toContain('galley')
    expect(out).toContain('title: T')
  })

  it('returns the source unchanged when the frontmatter cannot be rewritten', () => {
    const src = '---\na: 1\na: 2\n---\n\n# C\n'
    expect(writePartSpec(src, { role: 'main', numbered: true, listed: true })).toBe(src)
  })

  // The equivalence that keeps the guard and the writer from drifting, exactly
  // as `canWriteStructure` is pinned against `writeStructure`.
  it('canWritePartSpec agrees with writePartSpec on every sample', () => {
    const spec = { role: 'back' as const, numbered: false, listed: true }
    const samples = [
      '# C\n',
      '---\n---\n\n# C\n',
      '---\ntitle: T\n---\n\n# C\n',
      '---\na: 1\na: 2\n---\n\n# C\n',
      '---\n- one\n- two\n---\n\n# C\n',
      '---\n# only a comment\n---\n\n# C\n',
    ]
    for (const source of samples) {
      expect(canWritePartSpec(source)).toBe(writePartSpec(source, spec) !== source)
    }
  })
})
