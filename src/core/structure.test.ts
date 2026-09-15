import type { Heading, Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { frontmatterData } from './markdown/frontmatter'
import { parseMarkdown } from './markdown/parse'
import { DEFAULT_PART, headingText, readStructure, roleRank } from './structure'

const structureOf = (source: string) =>
  readStructure(frontmatterData(parseMarkdown(source)))

const firstHeading = (source: string): Heading => {
  const tree: Root = parseMarkdown(source)
  const found = tree.children.find((n) => n.type === 'heading')
  if (found?.type !== 'heading') throw new Error('no heading')
  return found as Heading
}

describe('headingText', () => {
  it('returns the plain text of a heading', () => {
    expect(headingText(firstHeading('# Copyright\n'))).toBe('Copyright')
  })

  it('flattens emphasis and inline code', () => {
    expect(headingText(firstHeading('# The *Illusion* of `Truth`\n'))).toBe(
      'The Illusion of Truth',
    )
  })

  it('preserves a colon in the title, which is how front matter is named', () => {
    expect(headingText(firstHeading('# Introduction: Reality is a Stage\n'))).toBe(
      'Introduction: Reality is a Stage',
    )
  })
})

describe('readStructure', () => {
  it('is empty when there is no frontmatter', () => {
    expect(structureOf('# H\n').size).toBe(0)
  })

  it('is empty when the frontmatter has no structure block', () => {
    expect(structureOf('---\ntitle: T\n---\n\n# H\n').size).toBe(0)
  })

  it('reads a role', () => {
    const s = structureOf(
      '---\nstructure:\n  Copyright: { role: front }\n---\n\n# Copyright\n',
    )
    expect(s.get('Copyright')).toEqual({ role: 'front', numbered: false, listed: true })
  })

  it('defaults front and back matter to unnumbered, main matter to numbered', () => {
    const s = structureOf(
      '---\nstructure:\n  A: { role: front }\n  B: { role: main }\n  C: { role: back }\n---\n',
    )
    expect(s.get('A')?.numbered).toBe(false)
    expect(s.get('B')?.numbered).toBe(true)
    expect(s.get('C')?.numbered).toBe(false)
  })

  it('lets an explicit flag win over the role default', () => {
    const s = structureOf('---\nstructure:\n  A: { role: front, numbered: true }\n---\n')
    expect(s.get('A')?.numbered).toBe(true)
  })

  it('reads listed and toc_title', () => {
    const s = structureOf(
      '---\nstructure:\n  Copyright: { role: front, listed: false }\n  "Introduction: Long": { role: front, toc_title: Introduction }\n---\n',
    )
    expect(s.get('Copyright')?.listed).toBe(false)
    expect(s.get('Introduction: Long')?.tocTitle).toBe('Introduction')
  })

  it('treats an unknown role as main matter rather than failing', () => {
    const s = structureOf('---\nstructure:\n  A: { role: sideways }\n---\n')
    expect(s.get('A')).toEqual(DEFAULT_PART)
  })

  it('survives a structure block that is not a mapping', () => {
    expect(structureOf('---\nstructure: nonsense\n---\n').size).toBe(0)
    expect(structureOf('---\nstructure:\n  - A\n  - B\n---\n').size).toBe(0)
  })

  it('survives malformed YAML without throwing', () => {
    expect(() => structureOf('---\nstructure: {{{\n---\n')).not.toThrow()
    expect(structureOf('---\nstructure: {{{\n---\n').size).toBe(0)
  })

  it('trims heading keys so indentation cannot break a match', () => {
    const s = structureOf('---\nstructure:\n  "  Copyright  ": { role: front }\n---\n')
    expect(s.has('Copyright')).toBe(true)
  })
})

describe('roleRank', () => {
  it('orders the matter divisions as a book prints them', () => {
    expect(roleRank('front')).toBeLessThan(roleRank('main'))
    expect(roleRank('main')).toBeLessThan(roleRank('back'))
  })
})
