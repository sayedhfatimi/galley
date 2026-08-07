import { describe, expect, it } from 'vitest'
import { extractFrontmatter, hasFrontmatter } from './frontmatter'
import { parseMarkdown } from './parse'

const meta = (src: string) => extractFrontmatter(parseMarkdown(src))

describe('extractFrontmatter', () => {
  it('reads the four fields galley cares about', () => {
    expect(
      meta(`---
title: The Long Now
subtitle: An essay
author: Ada Lovelace
date: 1843-10-01
---

Body.`),
    ).toEqual({
      title: 'The Long Now',
      subtitle: 'An essay',
      author: 'Ada Lovelace',
      date: '1843-10-01',
    })
  })

  it('returns nothing when there is no frontmatter', () => {
    expect(meta('# Just a heading\n\nBody.')).toEqual({})
  })

  it('ignores keys it does not recognise', () => {
    expect(meta('---\ntitle: T\ntags: [a, b]\ndraft: true\n---\n')).toEqual({
      title: 'T',
    })
  })

  // Obsidian and friends emit author lists routinely.
  it('joins a list of authors', () => {
    expect(meta('---\nauthors:\n  - Ada\n  - Charles\n---\n').author).toBe('Ada, Charles')
  })

  it('accepts common aliases', () => {
    expect(
      meta('---\nby: Ada\ndescription: A subtitle\ncreated: 2026-01-02\n---\n'),
    ).toEqual({
      subtitle: 'A subtitle',
      author: 'Ada',
      date: '2026-01-02',
    })
  })

  it('prefers the canonical key over an alias', () => {
    expect(meta('---\nauthor: Canonical\nauthors: [Other]\n---\n').author).toBe(
      'Canonical',
    )
  })

  // The YAML parser hands back a real Date for an unquoted date.
  it('renders a YAML date as a plain day', () => {
    expect(meta('---\ndate: 2026-08-06\n---\n').date).toBe('2026-08-06')
  })

  it('treats malformed YAML as absent rather than failing', () => {
    expect(meta('---\ntitle: [unclosed\n---\n')).toEqual({})
  })

  it('ignores an empty value', () => {
    expect(meta('---\ntitle: ""\nauthor: Ada\n---\n')).toEqual({ author: 'Ada' })
  })

  it('ignores a YAML block that is not a mapping', () => {
    expect(meta('---\n- just\n- a list\n---\n')).toEqual({})
  })

  // A --- fence mid-document is a thematic break, not frontmatter.
  it('only reads frontmatter at the very top of the document', () => {
    expect(meta('Some text.\n\n---\ntitle: Not frontmatter\n---\n')).toEqual({})
  })

  it('keeps characters that will need LaTeX escaping later', () => {
    expect(meta('---\ntitle: "Profit & Loss: 100% of it"\n---\n').title).toBe(
      'Profit & Loss: 100% of it',
    )
  })
})

describe('hasFrontmatter', () => {
  it('is true when a block is present', () => {
    expect(hasFrontmatter(parseMarkdown('---\ntitle: T\n---\n'))).toBe(true)
  })

  it('is false when it is not', () => {
    expect(hasFrontmatter(parseMarkdown('# Heading'))).toBe(false)
  })
})
