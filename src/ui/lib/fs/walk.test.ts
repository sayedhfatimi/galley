import { describe, expect, it } from 'vitest'
import { fakeFs } from './fakeHandle'
import { MAX_FILE_BYTES, walkProject } from './walk'

describe('walkProject', () => {
  it('finds Markdown and figures, with project-relative forward-slashed paths', async () => {
    const fs = fakeFs({
      'book.md': 'book',
      '01-one.md': 'one',
      'ch3/index.md': 'three',
      'ch3/diagram.png': 'bytes',
      'figures/cover.jpg': 'bytes',
      'notes/ideas.markdown': 'ideas',
    })
    const out = await walkProject(fs.root)

    expect(out.markdown.map((f) => f.path).sort()).toEqual([
      '01-one.md',
      'book.md',
      'ch3/index.md',
      'notes/ideas.markdown',
    ])
    expect(out.assetPaths.sort()).toEqual(['ch3/diagram.png', 'figures/cover.jpg'])
    expect(out.markdown.find((f) => f.path === 'ch3/index.md')?.source).toBe('three')
  })

  it('carries a handle for every file it reports', async () => {
    const fs = fakeFs({ 'a.md': 'a', 'ch/b.png': 'b' })
    const out = await walkProject(fs.root)
    expect([...out.handles.keys()].sort()).toEqual(['a.md', 'ch/b.png'])
  })

  it('ignores files galley cannot use', async () => {
    const fs = fakeFs({ 'a.md': 'a', 'notes.txt': 'x', 'sheet.xlsx': 'x', 'f.svg': 'x' })
    const out = await walkProject(fs.root)
    expect(out.markdown.map((f) => f.path)).toEqual(['a.md'])
    expect(out.assetPaths).toEqual([])
  })

  /**
   * The assertion is on the ENUMERATION, not the result.
   *
   * A walk that descends into `.obsidian/` and then filters the paths out
   * passes any test that only inspects what came back — and it has already
   * read the whole of someone's plugin state to do it. This is the only
   * shape of test that can tell those two implementations apart.
   */
  describe('dotfolders', () => {
    const tree = {
      'a.md': 'a',
      '.obsidian/workspace.json': '{}',
      '.obsidian/plugins/x/data.md': 'plugin state',
      '.trash/deleted.md': 'gone',
      '.hidden.md': 'hidden',
      'ch/.secret/note.md': 'nested',
    }

    it('never enumerates inside one', async () => {
      const fs = fakeFs(tree)
      await walkProject(fs.root)
      for (const directory of fs.enumerated.keys()) {
        expect(directory.split('/').some((s) => s.startsWith('.'))).toBe(false)
      }
    })

    it('reports nothing from inside one', async () => {
      const fs = fakeFs(tree)
      const out = await walkProject(fs.root)
      expect(out.markdown.map((f) => f.path)).toEqual(['a.md'])
    })

    it('skips a dot-prefixed FILE as well as a directory', async () => {
      const fs = fakeFs({ 'a.md': 'a', '.hidden.md': 'h' })
      const out = await walkProject(fs.root)
      expect(out.markdown.map((f) => f.path)).toEqual(['a.md'])
    })

    it('skips a dotfolder nested deep in the project', async () => {
      const fs = fakeFs({ 'ch/a.md': 'a', 'ch/.secret/note.md': 's' })
      await walkProject(fs.root)
      expect(fs.enumerated.has('ch/.secret')).toBe(false)
    })
  })

  /**
   * A file read off disk went through no size guard at all. The editor
   * refuses a 2 MB paste, and a chapter arriving by another route is the
   * same manuscript and the same memory.
   */
  it('skips a file past the size limit, and says which', async () => {
    const fs = fakeFs({
      'big.md': 'x'.repeat(MAX_FILE_BYTES + 1),
      'small.md': 'ok',
    })
    const out = await walkProject(fs.root)
    expect(out.markdown.map((f) => f.path)).toEqual(['small.md'])
    expect(out.skipped).toEqual(['big.md'])
    // Not readable, so not writable either — a handle it kept would be a
    // handle something could later write a truncated file through.
    expect(out.handles.has('big.md')).toBe(false)
  })

  /**
   * A vault is someone's real disk. One folder that cannot be read — a
   * permission quirk, a broken symlink, a sync artefact — is not a reason to
   * refuse the other twenty-four chapters.
   */
  it('skips a directory that cannot be read and keeps the rest', async () => {
    const fs = fakeFs({ 'a.md': 'a', 'ch/b.md': 'b' })
    const root = {
      kind: 'directory',
      name: 'project',
      entries: async function* () {
        yield [
          'ch',
          {
            kind: 'directory',
            name: 'ch',
            entries: () => {
              throw new DOMException('denied', 'NotAllowedError')
            },
          },
        ]
        yield* fs.root.entries()
      },
    } as unknown as FileSystemDirectoryHandle

    const out = await walkProject(root)
    expect(out.markdown.map((f) => f.path).sort()).toEqual(['a.md', 'ch/b.md'])
  })

  it('returns empty for an empty folder without throwing', async () => {
    const out = await walkProject(fakeFs({}).root)
    expect(out.markdown).toEqual([])
    expect(out.assetPaths).toEqual([])
  })
})
