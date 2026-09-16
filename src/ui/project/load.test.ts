import { describe, expect, it } from 'vitest'
import { fakeFs } from '@/ui/lib/fs/fakeHandle'
import { loadProject } from './load'

/**
 * Opening a folder, end to end, against the in-memory filesystem.
 *
 * This is the seam where the proven core meets the disk: `walkProject` reads,
 * `readProject` decides what is a chapter, and the session is what the shell
 * renders. Each half is tested on its own; these are the things only the join
 * can get wrong.
 */
describe('loadProject', () => {
  const book = {
    'book.md':
      '---\ntitle: The Illusion\nauthor: A Writer\nbook:\n  typeface: pagella\n---\n',
    '01-copyright.md':
      '---\ngalley:\n  role: front\n  listed: false\n---\n\n# Copyright\n',
    '02-dedication.md': '---\ngalley:\n  role: front\n---\n\n# Dedication\n',
    '03-illusion/index.md': '---\ngalley:\n  role: main\n---\n\n# The Illusion\n',
    '03-illusion/diagram.png': 'bytes',
    '99-about.md': '---\ngalley:\n  role: back\n---\n\n# About\n',
    'research.md': '# Research\n\nNot in the book.\n',
    'ideas/endings.md': '# Endings\n',
  }

  it('sorts the book by path, among parts only', async () => {
    const { project } = await loadProject(fakeFs(book).root)
    expect(project.parts.map((p) => p.path)).toEqual([
      '01-copyright.md',
      '02-dedication.md',
      '03-illusion/index.md',
      '99-about.md',
    ])
  })

  it('keeps every file without a galley block as an editable note', async () => {
    const { project } = await loadProject(fakeFs(book).root)
    expect(project.notes.map((n) => n.path).sort()).toEqual([
      'ideas/endings.md',
      'research.md',
    ])
  })

  it('finds the figures', async () => {
    const { project } = await loadProject(fakeFs(book).root)
    expect(project.figures).toEqual(['03-illusion/diagram.png'])
  })

  /**
   * A folder project is a BOOK unless `book.md` says otherwise, and it must be
   * built from `presetFor` rather than by spreading a character over
   * `DEFAULT_CONFIG` — which is article-shaped, so `toc.include` would stay
   * false and the book would typeset with no contents page at all.
   */
  it("is a book by default, with a book's contents page", async () => {
    const { config } = await loadProject(fakeFs(book).root)
    expect(config.character).toBe('book')
    expect(config.toc.include).toBe(true)
  })

  it('layers book.md settings over the preset', async () => {
    const { config } = await loadProject(fakeFs(book).root)
    expect(config.typeface).toBe('pagella')
    // and keeps everything the preset decided that book.md did not mention
    expect(config.toc.depth).toBe(presetDepth)
  })

  it('takes title and author from book.md, never from a chapter', async () => {
    const { config } = await loadProject(fakeFs(book).root)
    expect(config.metadata.title).toBe('The Illusion')
    expect(config.metadata.author).toBe('A Writer')
  })

  it('opens on the first chapter in reading order', async () => {
    const { panes } = await loadProject(fakeFs(book).root)
    expect(panes.left).toBe('01-copyright.md')
    expect(panes.right).toBeNull()
  })

  it('opens on a note when the folder holds no chapters at all', async () => {
    const { panes } = await loadProject(fakeFs({ 'notes.md': '# Notes\n' }).root)
    expect(panes.left).toBe('notes.md')
  })

  /**
   * Every write is checked against this. Captured during the read that was
   * already happening, rather than by walking the project a second time.
   */
  it('records when each file was last written', async () => {
    const fs = fakeFs(book)
    const { files } = await loadProject(fs.root)
    expect(files.get('01-copyright.md')?.lastModified).toBe(
      fs.files.get('01-copyright.md')?.lastModified,
    )
    expect(files.get('research.md')?.lastModified).toBeGreaterThan(0)
  })

  it('starts every file clean and unconflicted', async () => {
    const { files } = await loadProject(fakeFs(book).root)
    for (const state of files.values()) {
      expect(state.dirty).toBe(false)
      expect(state.conflict).toBeNull()
    }
  })

  it('carries a handle for every file it will need to write', async () => {
    const { handles, project } = await loadProject(fakeFs(book).root)
    for (const part of project.parts) expect(handles.has(part.path)).toBe(true)
    for (const note of project.notes) expect(handles.has(note.path)).toBe(true)
  })

  describe('hostile folders open rather than refusing', () => {
    it.each([
      ['no book.md at all', { 'a.md': '---\ngalley:\n  role: main\n---\n\n# A\n' }],
      ['no files whatsoever', {}],
      ['only figures', { 'cover.png': 'bytes' }],
      ['an empty frontmatter block', { 'a.md': '---\n---\n\n# A\n' }],
      ['a scalar galley key', { 'a.md': '---\ngalley: yes\n---\n\n# A\n' }],
      ['a part with no heading', { 'a.md': '---\ngalley:\n  role: main\n---\n\ntext\n' }],
      ['malformed frontmatter', { 'a.md': '---\n: : :\n---\n\n# A\n' }],
      [
        'a book.md carrying a galley block',
        { 'book.md': '---\ngalley:\n  role: main\n---\n' },
      ],
    ])('%s', async (_name, tree) => {
      await expect(loadProject(fakeFs(tree).root)).resolves.toBeDefined()
    })
  })

  it('never reads inside a dotfolder', async () => {
    const fs = fakeFs({ 'a.md': '# A\n', '.obsidian/workspace.json': '{}' })
    const { project } = await loadProject(fs.root)
    expect(project.notes.map((n) => n.path)).toEqual(['a.md'])
    expect([...fs.enumerated.keys()]).not.toContain('.obsidian')
  })
})

// `presetFor('book')` decides this; asserted against the preset rather than a
// literal so the test tracks the preset instead of pinning a number twice.
const presetDepth = (await import('@/core/config')).presetFor('book').toc.depth
