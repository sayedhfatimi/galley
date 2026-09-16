import { describe, expect, it } from 'vitest'
import { convertProject } from '@/core/latex/document'
import { buildFigureResolver } from '@/core/project/figures'
import { fakeFs } from '@/ui/lib/fs/fakeHandle'
import { buildFigureIndex } from './figures'
import { loadProject } from './load'

/**
 * A folder project, opened and converted, end to end over the fake disk.
 *
 * The unit tests each cover one seam; this covers the join, which is where
 * both of last session's Criticals lived and where this branch has already
 * found two more — a render that fetched no figures, and a diagnostic that
 * never reached its caller. Nothing here may throw, because a folder is
 * someone's real disk and one odd file must not cost them the other twenty-
 * four chapters.
 */

const convert = async (tree: Record<string, string>) => {
  const session = await loadProject(fakeFs(tree).root)
  const figures = buildFigureIndex(session.project.figures)
  const resolver = buildFigureResolver(session.project.figures)
  return {
    session,
    ...convertProject(session.project.parts, session.config, figures.available, resolver),
  }
}

describe('a folder project, end to end', () => {
  it('typesets a book in reading order regardless of the order files are read', async () => {
    const { tex } = await convert({
      'book.md': '---\ntitle: A Book\n---\n',
      '99-about.md': '---\ngalley:\n  role: back\n---\n\n# About\n',
      '01-copyright.md': '---\ngalley:\n  role: front\n---\n\n# Copyright\n',
      '50-middle.md': '---\ngalley:\n  role: main\n---\n\n# Middle\n',
    })
    expect(tex.indexOf('Copyright')).toBeLessThan(tex.indexOf('Middle'))
    expect(tex.indexOf('Middle')).toBeLessThan(tex.indexOf('About'))
  })

  /**
   * The acceptance criterion from the spec, stated directly: a note must
   * never reach the page. Headings, figures and front-matter-looking
   * frontmatter in a note are all things that WOULD be typeset if the file
   * were a part, which is what makes this discriminating.
   */
  it('produces identical LaTeX whether the notes are there or not', async () => {
    const book = {
      'book.md': '---\ntitle: A Book\n---\n',
      '01-one.md': '---\ngalley:\n  role: main\n---\n\n# One\n\nText.\n',
    }
    const withNotes = await convert({
      ...book,
      'research.md': '# A heading in a note\n\n![](cover.png)\n',
      'ideas/deep.md': '---\nrole: front\ntitle: Not the book\n---\n\n# Another\n',
    })
    const without = await convert(book)
    expect(withNotes.tex).toBe(without.tex)
  })

  it('carries a figure from a chapter folder through to the engine', async () => {
    const { images, session } = await convert({
      'book.md': '---\ntitle: A\n---\n',
      'ch/index.md': '---\ngalley:\n  role: main\n---\n\n# Ch\n\n![[diagram.png]]\n',
      'ch/diagram.png': 'bytes',
    })
    expect(session.project.figures).toEqual(['ch/diagram.png'])
    expect(images).toHaveLength(1)
  })

  it('resolves a percent-encoded reference to a file with a space in its name', async () => {
    const { images } = await convert({
      'book.md': '---\ntitle: A\n---\n',
      'ch/index.md':
        '---\ngalley:\n  role: main\n---\n\n# Ch\n\n![](../figures/my%20cover.png)\n',
      'figures/my cover.png': 'bytes',
    })
    expect(images).toHaveLength(1)
  })

  it('reports two chapters that define one identifier differently', async () => {
    const { diagnostics } = await convert({
      'a.md':
        '---\ngalley:\n  role: main\n---\n\n# A\n\n[x][r]\n\n[r]: https://one.example\n',
      'b.md':
        '---\ngalley:\n  role: main\n---\n\n# B\n\n[y][r]\n\n[r]: https://two.example\n',
    })
    const clash = diagnostics.filter((d) => d.kind === 'project-definition-duplicate')
    expect(clash).toHaveLength(1)
    expect(clash[0]?.detail).toContain('a.md')
    expect(clash[0]?.detail).toContain('b.md')
  })

  it('never reads inside a dotfolder, however deep', async () => {
    const fs = fakeFs({
      'a.md': '---\ngalley:\n  role: main\n---\n\n# A\n',
      '.obsidian/plugins/x/data.md': 'plugin state',
      'ch/.trash/old.md': 'deleted',
    })
    const session = await loadProject(fs.root)
    expect(session.project.notes).toEqual([])
    expect(session.project.parts.map((p) => p.path)).toEqual(['a.md'])
    for (const dir of fs.enumerated.keys()) {
      expect(dir.split('/').some((s) => s.startsWith('.'))).toBe(false)
    }
  })

  /**
   * Hostile input. Both of last session's Criticals were of exactly this
   * kind and invisible to 368 passing tests, so these run the WHOLE path —
   * open, read, convert — rather than any one function.
   */
  describe('none of these throws', () => {
    it.each([
      ['an empty folder', {}],
      ['only figures', { 'cover.png': 'bytes' }],
      ['no book.md', { 'a.md': '---\ngalley:\n  role: main\n---\n\n# A\n' }],
      ['an empty frontmatter block', { 'a.md': '---\n---\n\n# A\n' }],
      ['a scalar galley key', { 'a.md': '---\ngalley: yes\n---\n\n# A\n' }],
      ['a null galley key', { 'a.md': '---\ngalley:\n---\n\n# A\n' }],
      ['malformed YAML', { 'a.md': '---\n: : :\n---\n\n# A\n' }],
      ['a part with no heading', { 'a.md': '---\ngalley:\n  role: main\n---\n\ntext\n' }],
      [
        'a part with three headings',
        { 'a.md': '---\ngalley:\n  role: main\n---\n\n# A\n\n# B\n\n# C\n' },
      ],
      [
        'two files sorting equal but for case',
        {
          'A.md': '---\ngalley:\n  role: main\n---\n\n# A\n',
          'a.md': '---\ngalley:\n  role: main\n---\n\n# a\n',
        },
      ],
      [
        'an embed resolving to nothing',
        { 'a.md': '---\ngalley:\n  role: main\n---\n\n# A\n\n![[missing.png]]\n' },
      ],
      [
        'a book.md carrying a chapter block',
        { 'book.md': '---\ngalley:\n  role: main\n---\n' },
      ],
      ['a completely empty file', { 'a.md': '' }],
      [
        'an unterminated code fence',
        { 'a.md': '---\ngalley:\n  role: main\n---\n\n# A\n\n```\nnever closed\n' },
      ],
      [
        'a definition whose identifier ends in a backslash',
        { 'a.md': '---\ngalley:\n  role: main\n---\n\n# A\n\n[a\\\\]: https://e.com\n' },
      ],
    ])('%s', async (_name, tree) => {
      await expect(convert(tree as Record<string, string>)).resolves.toBeDefined()
    })
  })

  it('still produces a compilable document from a folder with nothing in it', async () => {
    const { tex } = await convert({})
    expect(tex).toContain('\\begin{document}')
    expect(tex).toContain('\\end{document}')
  })
})
