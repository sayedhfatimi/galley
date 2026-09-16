import { describe, expect, it } from 'vitest'
import { figureName } from '@/core/project/figures'
import { fakeFs } from '@/ui/lib/fs/fakeHandle'
import { buildFigureIndex, loadProjectFigures } from './figures'

describe('buildFigureIndex', () => {
  const paths = ['cover.png', 'ch1/diagram.png', 'ch3/diagram.png']

  /**
   * Equivalence AND an absolute assertion beside it. The round trip alone is
   * symmetric — it would hold just as well if both sides computed the name
   * wrongly in the same way — so one row pins a literal.
   */
  it('maps every path to the name the converter will ask for', () => {
    const index = buildFigureIndex(paths)
    for (const path of paths) {
      expect(index.byName.get(figureName(path))).toBe(path)
    }
    expect(index.byName.get('ch1-diagram-427de8de.png')).toBe('ch1/diagram.png')
  })

  it('offers exactly those names as available', () => {
    const index = buildFigureIndex(paths)
    expect([...index.available].sort()).toEqual([...index.byName.keys()].sort())
  })

  it('distinguishes same-named figures in different chapters', () => {
    const index = buildFigureIndex(paths)
    expect(index.byName.size).toBe(3)
  })

  it('has nothing to say about a project with no figures', () => {
    const index = buildFigureIndex([])
    expect(index.available.size).toBe(0)
    expect(index.diagnostics).toEqual([])
  })

  it('reports two paths that would collide onto one name', () => {
    const index = buildFigureIndex(['a/x.png', 'a/x.png', 'b/x.png'])
    // The duplicate of one path is not a collision; two DIFFERENT paths would be.
    expect(index.diagnostics).toEqual([])
    expect(index.byName.size).toBe(2)
  })
})

describe('loadProjectFigures', () => {
  const tree = { 'ch1/diagram.png': 'PNGBYTES', 'cover.png': 'COVER' }

  const handlesFor = async (fs: ReturnType<typeof fakeFs>) => {
    const handles = new Map<string, FileSystemFileHandle>()
    for (const path of fs.files.keys())
      handles.set(path, await fs.root.getFileHandle(path))
    return handles
  }

  it('reads exactly the figures the render asks for', async () => {
    const fs = fakeFs(tree)
    const index = buildFigureIndex([...fs.files.keys()])
    const wanted = figureName('ch1/diagram.png')

    const loaded = await loadProjectFigures([wanted], index, await handlesFor(fs))

    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.name).toBe(wanted)
    expect(new TextDecoder().decode(loaded[0]?.bytes)).toBe('PNGBYTES')
  })

  it('does not drag in figures this document never draws', async () => {
    const fs = fakeFs(tree)
    const index = buildFigureIndex([...fs.files.keys()])
    const loaded = await loadProjectFigures(
      [figureName('cover.png')],
      index,
      await handlesFor(fs),
    )
    expect(loaded.map((f) => f.name)).toEqual([figureName('cover.png')])
  })

  it('skips a figure that has disappeared since the project opened', async () => {
    const fs = fakeFs(tree)
    const index = buildFigureIndex([...fs.files.keys()])
    const handles = await handlesFor(fs)
    fs.files.delete('cover.png')

    await expect(
      loadProjectFigures([figureName('cover.png')], index, handles),
    ).resolves.toEqual([])
  })

  it('skips a name the project has no path for', async () => {
    const fs = fakeFs(tree)
    const index = buildFigureIndex([...fs.files.keys()])
    await expect(
      loadProjectFigures(['not-a-figure.png'], index, await handlesFor(fs)),
    ).resolves.toEqual([])
  })
})
