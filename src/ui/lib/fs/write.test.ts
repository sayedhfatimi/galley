import { describe, expect, it } from 'vitest'
import { fakeFs } from './fakeHandle'
import { checkStale, writeFile } from './write'

const handleFor = async (fs: ReturnType<typeof fakeFs>, path: string) =>
  fs.root.getFileHandle(path)

describe('writeFile', () => {
  it('writes when the file is exactly as last seen', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const handle = await handleFor(fs, 'a.md')
    const known = (await handle.getFile()).lastModified

    const result = await writeFile(handle, 'new', known)

    expect(result.ok).toBe(true)
    expect(fs.files.get('a.md')?.content).toBe('new')
  })

  it('reports the new timestamp, so the next write has something to check against', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const handle = await handleFor(fs, 'a.md')
    const known = (await handle.getFile()).lastModified

    const result = await writeFile(handle, 'new', known)

    expect(result).toEqual({ ok: true, lastModified: fs.files.get('a.md')?.lastModified })
    // And that value is usable: a second write with it succeeds.
    expect(
      (
        await writeFile(
          handle,
          'newer',
          (result as { lastModified: number }).lastModified,
        )
      ).ok,
    ).toBe(true)
  })

  it('refuses, without writing, when the file changed elsewhere', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const handle = await handleFor(fs, 'a.md')
    const known = (await handle.getFile()).lastModified

    fs.touch('a.md', 'from Obsidian')
    const result = await writeFile(handle, 'mine', known)

    expect(result).toEqual({ ok: false, reason: 'stale', theirs: expect.any(Number) })
    expect(fs.files.get('a.md')?.content).toBe('from Obsidian')
  })

  /**
   * THE mutation the obvious test misses.
   *
   * Checking staleness when the debounce timer is set rather than immediately
   * before the bytes go out leaves a window of hundreds of milliseconds —
   * ample for a sync to land — and every test that does not deliberately race
   * it passes either way. This lands an outside edit in exactly that window.
   */
  it('refuses a change that lands between the check and the write', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const handle = await handleFor(fs, 'a.md')
    const known = (await handle.getFile()).lastModified

    fs.onOpenWritable(() => fs.touch('a.md', 'arrived mid-write'))
    await writeFile(handle, 'mine', known)

    // Whatever the result says, the other writer's content must still be there.
    expect(fs.files.get('a.md')?.content).toBe('arrived mid-write')
  })

  /**
   * A phone whose clock is behind this machine's writes an OLDER timestamp.
   * `>` reads that as "not changed" and overwrites it; `!==` does not.
   */
  it('refuses when the timestamp went BACKWARDS', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const handle = await handleFor(fs, 'a.md')
    const known = (await handle.getFile()).lastModified

    fs.touch('a.md', 'from a phone behind the clock', known - 5000)
    const result = await writeFile(handle, 'mine', known)

    expect(result.ok).toBe(false)
    expect(fs.files.get('a.md')?.content).toBe('from a phone behind the clock')
  })

  /**
   * A filesystem that cannot say when a file changed cannot support the
   * guarantee this module makes. Reading that as "unchanged" would turn every
   * such write into the overwrite it exists to prevent.
   */
  it.each([
    ['zero', 0],
    ['NaN', Number.NaN],
  ])(
    'refuses when the timestamp is %s rather than assuming unchanged',
    async (_n, value) => {
      const fs = fakeFs({ 'a.md': { content: 'old', lastModified: value } })
      const handle = await handleFor(fs, 'a.md')

      const result = await writeFile(handle, 'mine', value)

      expect(result).toEqual({ ok: false, reason: 'unreadable' })
      expect(fs.files.get('a.md')?.content).toBe('old')
    },
  )

  it('returns a refusal rather than throwing when the file cannot be read', async () => {
    const handle = {
      getFile: async () => {
        throw new DOMException('gone', 'NotFoundError')
      },
    } as unknown as FileSystemFileHandle

    await expect(writeFile(handle, 'x', 1)).resolves.toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })

  it('leaves the file untouched when the write itself fails', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const real = await handleFor(fs, 'a.md')
    const handle = {
      getFile: () => real.getFile(),
      createWritable: async () => ({
        write: async () => {
          throw new Error('disk full')
        },
        close: async () => {},
        abort: async () => {},
      }),
    } as unknown as FileSystemFileHandle
    const known = (await real.getFile()).lastModified

    const result = await writeFile(handle, 'mine', known)

    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(fs.files.get('a.md')?.content).toBe('old')
  })

  it('returns a refusal rather than throwing when a writable cannot be opened', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const real = await handleFor(fs, 'a.md')
    const handle = {
      getFile: () => real.getFile(),
      createWritable: async () => {
        throw new DOMException('denied', 'NotAllowedError')
      },
    } as unknown as FileSystemFileHandle
    const known = (await real.getFile()).lastModified

    await expect(writeFile(handle, 'mine', known)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })
})

describe('checkStale', () => {
  it('passes when nothing changed', async () => {
    const fs = fakeFs({ 'a.md': 'x' })
    const handle = await handleFor(fs, 'a.md')
    const known = (await handle.getFile()).lastModified
    expect(await checkStale(handle, known)).toEqual({ ok: true, lastModified: known })
  })

  it('reports THEIR timestamp, so the UI can say when it changed', async () => {
    const fs = fakeFs({ 'a.md': 'x' })
    const handle = await handleFor(fs, 'a.md')
    const known = (await handle.getFile()).lastModified
    fs.touch('a.md', 'theirs', known + 999)
    expect(await checkStale(handle, known)).toEqual({
      ok: false,
      reason: 'stale',
      theirs: known + 999,
    })
  })

  it('does not throw on an unreadable file', async () => {
    const handle = {
      getFile: async () => {
        throw new Error('gone')
      },
    } as unknown as FileSystemFileHandle
    await expect(checkStale(handle, 1)).resolves.toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })
})
