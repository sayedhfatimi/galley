import { describe, expect, it } from 'vitest'
import { fakeFs } from '@/ui/lib/fs/fakeHandle'
import { relativeReference, suggestName, writeFigure, writePdf } from './writeFigure'

describe('relativeReference', () => {
  it.each([
    [
      'a figure beside the chapter',
      '02-illusion/index.md',
      '02-illusion/diagram.png',
      'diagram.png',
    ],
    [
      'a figure one level up',
      '02-illusion/index.md',
      'figures/cover.png',
      '../figures/cover.png',
    ],
    ['a chapter at the root', 'chapter.md', 'figures/cover.png', 'figures/cover.png'],
    ['both at the root', 'chapter.md', 'cover.png', 'cover.png'],
    ['a deeper figure', 'a/b/ch.md', 'a/b/c/x.png', 'c/x.png'],
    ['a sibling branch', 'a/b/ch.md', 'a/z/x.png', '../z/x.png'],
  ])('writes %s the way an author would', (_n, from, figure, expected) => {
    expect(relativeReference(from, figure)).toBe(expected)
  })
})

describe('suggestName', () => {
  it('leaves a free name alone', () => {
    expect(suggestName('diagram.png', new Set())).toBe('diagram.png')
  })

  it('counts up past what is taken', () => {
    expect(suggestName('diagram.png', new Set(['diagram.png']))).toBe('diagram-1.png')
    expect(suggestName('diagram.png', new Set(['diagram.png', 'diagram-1.png']))).toBe(
      'diagram-2.png',
    )
  })

  it('keeps the extension where it belongs', () => {
    expect(suggestName('my.cover.png', new Set(['my.cover.png']))).toBe('my.cover-1.png')
  })
})

describe('writeFigure', () => {
  const placement = (path: string) => {
    const segments = path.split('/')
    const name = segments.pop() as string
    return { path, directory: segments, name }
  }
  const bytes = new TextEncoder().encode('PNGBYTES').buffer as ArrayBuffer

  it('writes a new figure into the folder', async () => {
    const fs = fakeFs({ 'ch/index.md': '# A' })
    const result = await writeFigure(fs.root, placement('ch/diagram.png'), bytes)

    expect(result).toMatchObject({ ok: true, path: 'ch/diagram.png' })
    // The handle comes back so the caller can register the figure without
    // re-walking the folder — without it the picture is on disk, referenced,
    // and unresolvable until the project is reopened.
    expect(result.ok && typeof result.handle.getFile).toBe('function')
    expect(fs.files.get('ch/diagram.png')?.content).toBe('PNGBYTES')
  })

  /**
   * The one rule. Overwriting a figure has no undo — the bytes that were there
   * are gone — so replacement is not offered even behind a confirmation.
   */
  it('refuses to replace a figure that already exists', async () => {
    const fs = fakeFs({ 'ch/diagram.png': 'THEIRS' })
    const result = await writeFigure(fs.root, placement('ch/diagram.png'), bytes)

    expect(result).toEqual({ ok: false, reason: 'exists', suggestion: 'diagram-1.png' })
    expect(fs.files.get('ch/diagram.png')?.content).toBe('THEIRS')
  })

  it('suggests a name that is free in that directory', async () => {
    const fs = fakeFs({ 'ch/diagram.png': 'a', 'ch/diagram-1.png': 'b' })
    const result = await writeFigure(fs.root, placement('ch/diagram.png'), bytes)
    expect(result).toEqual({
      ok: false,
      reason: 'exists',
      suggestion: 'diagram-2.png',
    })
  })

  it('refuses a format galley cannot typeset, before touching the disk', async () => {
    const fs = fakeFs({})
    const result = await writeFigure(fs.root, placement('ch/notes.svg'), bytes)

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ reason: 'unsupported' })
    expect(fs.files.size).toBe(0)
  })

  it('creates the chapter folder when the drop lands in a new one', async () => {
    const fs = fakeFs({ 'a.md': '# A' })
    const result = await writeFigure(fs.root, placement('new/deep/x.png'), bytes)
    expect(result.ok).toBe(true)
    expect(fs.files.has('new/deep/x.png')).toBe(true)
  })

  it('returns a refusal rather than throwing when the write fails', async () => {
    const broken = {
      getFileHandle: async () => {
        throw new DOMException('denied', 'NotAllowedError')
      },
    } as unknown as FileSystemDirectoryHandle
    await expect(writeFigure(broken, placement('x.png'), bytes)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })
})

/**
 * The one file galley overwrites on purpose. Safe because `book.pdf` is
 * output rather than anything anyone typed — but only ever on request, since
 * every write into a synced folder is replicated.
 */
describe('writePdf', () => {
  const bytes = new TextEncoder().encode('%PDF-1.7').buffer as ArrayBuffer

  it('writes the book into the folder', async () => {
    const fs = fakeFs({ 'book.md': '# A' })
    expect(await writePdf(fs.root, 'book.pdf', bytes)).toBe(true)
    expect(fs.files.get('book.pdf')?.content).toBe('%PDF-1.7')
  })

  it('replaces a previous render rather than piling up', async () => {
    const fs = fakeFs({ 'book.pdf': 'OLD' })
    await writePdf(fs.root, 'book.pdf', bytes)
    expect(fs.files.get('book.pdf')?.content).toBe('%PDF-1.7')
    expect(fs.files.size).toBe(1)
  })

  it('reports failure rather than throwing', async () => {
    const broken = {
      getFileHandle: async () => {
        throw new DOMException('denied', 'NotAllowedError')
      },
    } as unknown as FileSystemDirectoryHandle
    await expect(writePdf(broken, 'book.pdf', bytes)).resolves.toBe(false)
  })
})
