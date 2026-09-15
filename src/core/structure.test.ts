import type { Heading, Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { frontmatterData } from './markdown/frontmatter'
import { parseMarkdown } from './markdown/parse'
import {
  canWriteStructure,
  DEFAULT_PART,
  headingText,
  type PartSpec,
  readStructure,
  roleRank,
  writeStructure,
} from './structure'

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

describe('writeStructure', () => {
  const map = (entries: [string, PartSpec][]) => new Map(entries)

  it('adds a structure block to a document that has frontmatter', () => {
    const out = writeStructure(
      '---\ntitle: T\n---\n\n# Copyright\n',
      map([['Copyright', { role: 'front', numbered: false, listed: false }]]),
    )
    expect(out).toContain('title: T')
    expect(out).toContain('structure:')
    expect(out).toContain('Copyright:')
    expect(out).toContain('listed: false')
    expect(out).toContain('# Copyright')
  })

  it('creates frontmatter when the document has none', () => {
    const out = writeStructure(
      '# Copyright\n',
      map([['Copyright', { role: 'front', numbered: false, listed: true }]]),
    )
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toContain('role: front')
    expect(out).toContain('# Copyright')
  })

  it('omits flags that match the role default, so the block stays readable', () => {
    const out = writeStructure(
      '# D\n',
      map([['D', { role: 'front', numbered: false, listed: true }]]),
    )
    expect(out).toContain('role: front')
    expect(out).not.toContain('numbered:')
    expect(out).not.toContain('listed:')
  })

  it('writes a short title only when there is one', () => {
    const withTitle = writeStructure(
      '# I\n',
      map([['I', { role: 'front', numbered: false, listed: true, tocTitle: 'Intro' }]]),
    )
    expect(withTitle).toContain('toc_title: Intro')
  })

  it('removes the block when nothing is left to say', () => {
    const source = '---\ntitle: T\nstructure:\n  A: { role: front }\n---\n\n# A\n'
    const out = writeStructure(source, map([]))
    expect(out).not.toContain('structure:')
    expect(out).toContain('title: T')
  })

  it('leaves a document with no frontmatter alone when there is nothing to write', () => {
    expect(writeStructure('# A\n', map([]))).toBe('# A\n')
  })

  it('round-trips through readStructure', () => {
    const original = map([
      ['Copyright', { role: 'front', numbered: false, listed: false } as PartSpec],
      ['Ch One', { role: 'main', numbered: true, listed: true } as PartSpec],
      [
        'After',
        { role: 'back', numbered: false, listed: true, tocTitle: 'A' } as PartSpec,
      ],
    ])
    const source = writeStructure('# x\n', original)
    const back = readStructure(frontmatterData(parseMarkdown(source)))
    expect(back).toEqual(original)
  })

  // Minor 4: every other tocTitle case in this file is a single word, which
  // is exactly the shape that survived even the buggy per-keystroke UI
  // binding — a space is what exposed it. Round-tripping a multi-word
  // heading AND a multi-word tocTitle here is what actually proves the pure
  // core preserves whitespace, independent of anything the UI does with it.
  it('round-trips a multi-word heading and a multi-word toc_title', () => {
    const original = map([
      [
        'A Rather Long Chapter Title',
        { role: 'main', numbered: true, listed: true, tocTitle: 'A Note' } as PartSpec,
      ],
    ])
    const source = writeStructure('# x\n', original)
    const back = readStructure(frontmatterData(parseMarkdown(source)))
    expect(back).toEqual(original)
  })

  it('does not truncate frontmatter at a --- inside a block scalar', () => {
    const source = '---\nabstract: |\n  one\n  ---\n  two\ntitle: Kept\n---\n\n# A\n'
    const out = writeStructure(
      source,
      map([['A', { role: 'front', numbered: false, listed: true }]]),
    )
    expect(out).toContain('title: Kept')
    expect(out).toContain('abstract:')
    expect(out).toContain('# A')
  })

  // Critical 1: `writeStructure` must be TOTAL. `parseDocument` collects
  // errors rather than throwing, but `Document.toString()` refuses once any
  // are present, and `set`/`delete` assert the contents are a keyable
  // collection. None of that may reach the caller — there is no React error
  // boundary in this app, so a throw out of a Select's `onValueChange`
  // unmounts the whole root. Each case below must return `source` unchanged.
  const entry: [string, PartSpec] = [
    'A',
    { role: 'front', numbered: false, listed: true },
  ]

  it('returns the source unchanged for malformed YAML (unclosed flow collection)', () => {
    const source = '---\ntitle: [unclosed\n---\n\n# A\n'
    expect(() => writeStructure(source, map([entry]))).not.toThrow()
    expect(writeStructure(source, map([entry]))).toBe(source)
  })

  it('returns the source unchanged for duplicate keys', () => {
    const source = '---\ntitle: A\ntitle: B\n---\n\n# A\n'
    expect(() => writeStructure(source, map([entry]))).not.toThrow()
    expect(writeStructure(source, map([entry]))).toBe(source)
  })

  it('returns the source unchanged for tab-indented YAML', () => {
    const source = '---\nkey:\n\tnested: 1\n---\n\n# A\n'
    expect(() => writeStructure(source, map([entry]))).not.toThrow()
    expect(writeStructure(source, map([entry]))).toBe(source)
  })

  it('returns the source unchanged when the frontmatter is a sequence, not a mapping', () => {
    const source = '---\n- one\n- two\n---\n\n# A\n'
    expect(() => writeStructure(source, map([entry]))).not.toThrow()
    expect(writeStructure(source, map([entry]))).toBe(source)
  })

  it('returns the source unchanged when the frontmatter is a bare scalar', () => {
    const source = '---\njust text\n---\n\n# A\n'
    expect(() => writeStructure(source, map([entry]))).not.toThrow()
    expect(writeStructure(source, map([entry]))).toBe(source)
  })

  it('still writes into frontmatter that is empty but valid', () => {
    // Regression guard for the fix above: contents === null (no keys yet) is
    // NOT the same failure as a sequence or scalar document — `yaml` upgrades
    // it to a map on the first `set`, so this must keep working.
    const out = writeStructure('---\n---\n\n# A\n', map([entry]))
    expect(out).toContain('structure:')
    expect(out).toContain('# A')
  })
})

describe('canWriteStructure', () => {
  // `canWriteStructure` and `writeStructure` share one guard
  // (`parseWritableFrontmatter`) precisely so they cannot describe different
  // sets of documents. Asserting `canWriteStructure(src)` and
  // `writeStructure(src, m) !== src` separately would only prove each one is
  // internally consistent — it would happily pass even if a future edit
  // re-introduced two diverging conditions, exactly the bug this predicate
  // was added to fix. Comparing them against each other, fixture by fixture,
  // is what actually pins the two together.
  const nonEmpty: Map<string, PartSpec> = new Map([
    ['A', { role: 'front', numbered: false, listed: true }],
  ])

  const fixtures: { name: string; source: string; writable: boolean }[] = [
    // Writable: `writeStructure`'s guard deliberately treats these as an
    // empty-but-valid map (`contents === null`, which `yaml` upgrades to a
    // map on the first `set`) rather than a parse failure — see
    // `frontmatter.ts`'s docstring on why an Obsidian export with an empty
    // properties panel is the highest-leverage case galley serves.
    { name: 'empty frontmatter block', source: '---\n---\n\n# A\n', writable: true },
    {
      name: 'whitespace-only frontmatter block',
      source: '---\n   \n---\n\n# A\n',
      writable: true,
    },
    {
      name: 'comment-only frontmatter block',
      source: '---\n# note\n---\n\n# A\n',
      writable: true,
    },
    { name: 'no frontmatter at all', source: '# A\n', writable: true },

    // Not writable: parsed with errors, or parsed clean but not a mapping —
    // rewriting either would either throw inside `yaml` or silently discard
    // content the writer already had.
    {
      name: 'malformed YAML (unclosed flow collection)',
      source: '---\ntitle: [unclosed\n---\n\n# A\n',
      writable: false,
    },
    {
      name: 'duplicate keys',
      source: '---\ntitle: A\ntitle: B\n---\n\n# A\n',
      writable: false,
    },
    {
      name: 'tab-indented YAML',
      source: '---\nkey:\n\tnested: 1\n---\n\n# A\n',
      writable: false,
    },
    {
      name: 'sequence document',
      source: '---\n- one\n- two\n---\n\n# A\n',
      writable: false,
    },
    {
      name: 'scalar document',
      source: '---\njust text\n---\n\n# A\n',
      writable: false,
    },
  ]

  it.each(fixtures)('agrees with writeStructure on $name', ({ source, writable }) => {
    expect(() => canWriteStructure(source)).not.toThrow()
    // The pinning assertion: the predicate and the real write must agree,
    // not merely each independently match what we expect.
    expect(canWriteStructure(source)).toBe(writeStructure(source, nonEmpty) !== source)
    // What we expect them to agree ON, so a fixture that accidentally pins
    // both sides to the same wrong answer still fails.
    expect(canWriteStructure(source)).toBe(writable)
  })
})
