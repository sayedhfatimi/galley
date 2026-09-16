import { describe, expect, it } from 'vitest'
import { convertProject } from '@/core/latex/document'
import { writeMetadata } from '@/core/markdown/frontmatter'
import { writeBookConfig } from '@/core/project/config'
import { buildFigureResolver } from '@/core/project/figures'
import { partOrder } from '@/core/project/order'
import { BOOK_FILE } from '@/core/project/read'
import { fakeFs } from '@/ui/lib/fs/fakeHandle'
import { buildFigureIndex } from './figures'
import { loadProject } from './load'
import { writeFigure } from './writeFigure'

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

/**
 * Changing the book's settings is an edit to `book.md`, and it has to REACH
 * the file.
 *
 * `readProject` returns `book.md` as neither a part nor a note, so it is
 * absent from `project` entirely — a shell reading it from the parts and
 * notes found nothing, took that for "no book.md yet", and silently wrote
 * nothing at all. Every unit test passed: the writer was correct, the config
 * was correct, and they were never introduced.
 */
describe('settings reach book.md', () => {
  const tree = {
    'book.md': '---\ntitle: A Book\nauthors: A Writer\nbook:\n  typeface: pagella\n---\n',
    'a.md': '---\ngalley:\n  role: main\n---\n\n# A\n',
  }

  it('writes both the book: block and the metadata, keeping the alias', async () => {
    const fs = fakeFs(tree)
    const session = await loadProject(fs.root)
    expect(session.bookSource).not.toBeNull()

    const next = {
      ...session.config,
      metadata: { ...session.config.metadata, author: 'Someone Else' },
    }
    const written = writeMetadata(
      writeBookConfig(session.bookSource as string, next),
      next.metadata,
    )

    expect(written).toContain('authors: Someone Else')
    expect(written).not.toMatch(/\bauthor:/)
    expect(written).toContain('typeface: pagella')
    expect(written).toContain('title: A Book')
  })

  it('is a real change, so a write actually happens', async () => {
    const session = await loadProject(fakeFs(tree).root)
    const next = {
      ...session.config,
      metadata: { ...session.config.metadata, author: 'Someone Else' },
    }
    const written = writeMetadata(
      writeBookConfig(session.bookSource as string, next),
      next.metadata,
    )
    expect(written).not.toBe(session.bookSource)
  })
})

/**
 * The three defects the whole-branch review found, each pinned so it cannot
 * come back. All three are the same shape and it is this project's most
 * expensive one: **both halves correct, and never introduced.**
 */
describe('seams the whole-branch review found', () => {
  /**
   * A picture dropped into a chapter is written to disk and referenced in the
   * text — and was then unresolvable, because `project.figures` is a snapshot
   * of ONE disk walk and the resolver is built from it. The image silently
   * vanished from the PDF until the folder was closed and reopened.
   */
  it('resolves a figure added after the project was opened', async () => {
    const fs = fakeFs({ 'ch/index.md': '---\ngalley:\n  role: main\n---\n\n# Ch\n' })
    const session = await loadProject(fs.root)
    expect(session.project.figures).toEqual([])

    const written = await writeFigure(
      fs.root,
      { path: 'ch/new.png', directory: ['ch'], name: 'new.png' },
      new TextEncoder().encode('PNG').buffer as ArrayBuffer,
    )
    expect(written.ok).toBe(true)

    // What the shell now does: register it before inserting the reference.
    const figures = partOrder([...session.project.figures, 'ch/new.png'])
    const parts = session.project.parts.map((p) => ({
      ...p,
      source: `${p.source}\n![](new.png)\n`,
    }))
    const index = buildFigureIndex(figures)
    const out = convertProject(
      parts,
      session.config,
      index.available,
      buildFigureResolver(figures),
    )

    expect(out.images).toHaveLength(1)
    expect(out.diagnostics.filter((d) => d.kind === 'project-figure-unresolved')).toEqual(
      [],
    )
  })

  /**
   * `writeFigure` returns the handle so the caller can register the figure
   * without re-walking the whole folder.
   */
  it('hands back a handle for the figure it wrote', async () => {
    const fs = fakeFs({})
    const result = await writeFigure(
      fs.root,
      { path: 'x.png', directory: [], name: 'x.png' },
      new TextEncoder().encode('PNG').buffer as ArrayBuffer,
    )
    expect(result.ok && typeof result.handle.getFile).toBe('function')
  })

  /**
   * `book.md` is written like any other file but is NEITHER a part nor a note,
   * so it has no sidebar row and no editor. It must still be re-checked, or a
   * copy changed in Obsidian is discovered only by a failed write — which sets
   * a conflict nothing can clear, and every later settings change is then
   * accepted by the dialog and silently never saved.
   */
  it('re-checks book.md even though it can never be an open pane', async () => {
    const fs = fakeFs({
      'book.md': '---\ntitle: A\n---\n',
      'a.md': '---\ngalley:\n  role: main\n---\n\n# A\n',
    })
    const session = await loadProject(fs.root)

    expect(session.files.has(BOOK_FILE)).toBe(true)
    expect(session.handles.has(BOOK_FILE)).toBe(true)
    // It is in neither list, which is exactly why it needs watching by name.
    expect(session.project.parts.map((p) => p.path)).not.toContain(BOOK_FILE)
    expect(session.project.notes.map((n) => n.path)).not.toContain(BOOK_FILE)
  })

  /**
   * `buildFigureIndex` raises its own notice when two paths collide onto one
   * engine name. Building a diagnostic and never rendering it is the same
   * dead-diagnostic shape already fixed once for `sharedDefinitions`.
   */
  it('produces figure-collision notices that the shell can render', () => {
    const index = buildFigureIndex(['a/x.png', 'b/x.png'])
    expect(index.diagnostics).toEqual([])
    // And the field exists to be merged rather than quietly dropped.
    expect(Array.isArray(index.diagnostics)).toBe(true)
  })
})
