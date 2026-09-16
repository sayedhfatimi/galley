/**
 * The guardrail for folder projects.
 *
 * The equivalence test is the one that matters: a book split across files must
 * produce the SAME LaTeX as the same book written as one document. That is what
 * proves the multi-part walk changed nothing about typesetting — it is what
 * catches a \mainmatter emitted per file, role ordering restarted per file, and
 * a definition that no longer resolves across a file boundary.
 *
 * The manuscript here is synthetic and mirrors the structure of a real published
 * book. The book itself is deliberately NOT in this repository — see
 * `src/core/__tests__/no-private-references.test.ts`. Validating against the real
 * manuscript is an out-of-repo manual check, as it was in v2.1.0.
 */

import { describe, expect, it } from 'vitest'
import { presetFor } from '../config'
import { readProject } from '../project/read'
import { convert, convertProject } from './document'

const CHAPTERS = [
  {
    path: '01-copyright.md',
    role: 'front',
    listed: false,
    heading: 'Copyright',
    body: 'All rights reserved.',
  },
  {
    path: '02-dedication.md',
    role: 'front',
    listed: true,
    heading: 'Dedication',
    body: 'For no one in particular.',
  },
  {
    path: '03-truth.md',
    role: 'main',
    listed: true,
    heading: 'The Illusion of Truth',
    body: 'A paragraph about truth.',
  },
  {
    path: '04-power.md',
    role: 'main',
    listed: true,
    heading: 'The Illusion of Power',
    body: 'A paragraph about power.',
  },
  {
    path: '99-about.md',
    role: 'back',
    listed: true,
    heading: "Author's Note",
    body: 'A closing remark.',
  },
] as const

const config = () => ({
  ...presetFor('book'),
  metadata: { title: 'The Philosophy of Illusions', author: 'A. Writer' },
})

/** The same book as ONE document, using Phase 1's `structure:` block. */
function singleDocument(): string {
  const entries = CHAPTERS.map(
    (c) =>
      `  ${JSON.stringify(c.heading)}: { role: ${c.role}${c.listed ? '' : ', listed: false'} }`,
  ).join('\n')
  const body = CHAPTERS.map((c) => `# ${c.heading}\n\n${c.body}\n`).join('\n')
  return `---\ntitle: The Philosophy of Illusions\nauthor: A. Writer\nstructure:\n${entries}\n---\n\n${body}`
}

/** The same book as a FOLDER, using per-file `galley:` blocks. */
function folder() {
  return CHAPTERS.map((c) => ({
    path: c.path,
    source:
      `---\ngalley:\n  role: ${c.role}\n${c.listed ? '' : '  listed: false\n'}---\n\n` +
      `# ${c.heading}\n\n${c.body}\n`,
  }))
}

describe('a folder typesets identically to one document', () => {
  it('produces the same LaTeX', () => {
    const single = convert(singleDocument(), config())
    const project = readProject(folder(), [])
    const multi = convertProject(project.parts, config())

    expect(project.parts).toHaveLength(CHAPTERS.length)
    expect(multi.tex).toBe(single.tex)
  })

  it('raises no diagnostics either way', () => {
    const project = readProject(folder(), [])
    expect(convertProject(project.parts, config()).diagnostics).toEqual([])
    expect(convert(singleDocument(), config()).diagnostics).toEqual([])
  })

  it('orders parts by filename, not by the order they were handed over', () => {
    const shuffled = [...folder()].reverse()
    const project = readProject(shuffled, [])
    expect(project.parts.map((p) => p.path)).toEqual(CHAPTERS.map((c) => c.path))
  })

  // The fixture above is zero-padded (01, 02, 03, 04, 99), so lexicographic
  // and numeric sort agree on it and this assertion would pass even if
  // `partOrder` dropped `numeric: true` from its collator. Two non-padded
  // filenames whose digit count differs are what tells the two sorts apart:
  // lexicographically '10-tenth.md' < '2-second.md' (the character '1' sorts
  // before '2'), but numerically 2 < 10.
  it('orders numeric filenames by value, not lexicographically', () => {
    const files = [
      {
        path: '10-tenth.md',
        source: '---\ngalley:\n  role: main\n---\n\n# Tenth\n\nTen.\n',
      },
      {
        path: '2-second.md',
        source: '---\ngalley:\n  role: main\n---\n\n# Second\n\nTwo.\n',
      },
    ]
    const project = readProject(files, [])
    expect(project.parts.map((p) => p.path)).toEqual(['2-second.md', '10-tenth.md'])
  })
})

/**
 * Equivalence (above) proves the folder path and the single-document path
 * AGREE; it cannot prove either is RIGHT, and mutation testing showed exactly
 * that gap — forcing `#resolveMatterOwnership` to return early breaks nothing
 * in the equivalence test, because both sides of that comparison run the same
 * (now-buggy) code and stay equal to each other. A bug in code shared by both
 * paths is invisible to a test that only compares the two paths.
 *
 * These assertions are absolute instead: properties that must hold of the
 * folder output on its own, regardless of what the single-document path does.
 */
describe('the folder output is structurally correct on its own', () => {
  const project = readProject(folder(), [])
  const tex = convertProject(project.parts, config()).tex

  it('opens \\frontmatter exactly once, before the first front-matter heading', () => {
    expect(tex.match(/\\frontmatter/g)).toHaveLength(1)
    expect(tex.indexOf('\\frontmatter')).toBeLessThan(
      tex.indexOf('\\chapter*{Copyright}'),
    )
  })

  it('opens \\mainmatter exactly once, after the contents and before the first main-matter chapter', () => {
    expect(tex.match(/\\mainmatter/g)).toHaveLength(1)
    expect(tex.indexOf('\\tableofcontents')).toBeLessThan(tex.indexOf('\\mainmatter'))
    expect(tex.indexOf('\\mainmatter')).toBeLessThan(
      tex.indexOf('\\chapter{The Illusion of Truth}'),
    )
  })

  it('opens \\backmatter exactly once, after the last main-matter chapter and before the back matter', () => {
    expect(tex.match(/\\backmatter/g)).toHaveLength(1)
    expect(tex.indexOf('\\chapter{The Illusion of Power}')).toBeLessThan(
      tex.indexOf('\\backmatter'),
    )
    expect(tex.indexOf('\\backmatter')).toBeLessThan(
      tex.indexOf("\\chapter*{Author's Note}"),
    )
  })

  it('typesets every chapter in reading order', () => {
    const positions = CHAPTERS.map((c) => {
      const command =
        c.role === 'main' ? `\\chapter{${c.heading}}` : `\\chapter*{${c.heading}}`
      return tex.indexOf(command)
    })

    for (const position of positions) expect(position).toBeGreaterThan(-1)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1])
    }
  })

  it('leaves front matter unnumbered and numbers the first main-matter chapter', () => {
    expect(tex).toContain('\\chapter*{Copyright}')
    expect(tex).toContain('\\chapter*{Dedication}')
    expect(tex).toMatch(/\\chapter(\[.*?\])?\{The Illusion of Truth\}/)
    expect(tex).not.toContain('\\chapter*{The Illusion of Truth}')
  })
})

describe('notes never reach the page', () => {
  it('produces identical LaTeX with and without notes present', () => {
    const withoutNotes = readProject(folder(), [])
    const withNotes = readProject(
      [
        ...folder(),
        {
          path: 'research.md',
          source: '# Research\n\n![](diagram.png)\n\nUnused prose.\n',
        },
        {
          path: 'ideas/endings.md',
          source: '---\ntitle: Endings\n---\n\n# Endings\n\nMore prose.\n',
        },
        { path: 'ideas/outline.md', source: '# Outline\n\n- a\n- b\n' },
      ],
      [],
    )

    expect(withNotes.notes.map((n) => n.path)).toEqual([
      'ideas/endings.md',
      'ideas/outline.md',
      'research.md',
    ])
    expect(convertProject(withNotes.parts, config()).tex).toBe(
      convertProject(withoutNotes.parts, config()).tex,
    )
  })
})
