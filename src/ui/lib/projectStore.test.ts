import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetProject, rememberedProject, rememberProject } from './projectStore'

/**
 * jsdom has no IndexedDB at all, so the happy path here is invisible without
 * a stand-in — and a module whose whole job is to remember something across
 * visits, tested only for how it degrades, is a module nobody has watched
 * remember anything.
 *
 * A real `FileSystemDirectoryHandle` surviving structured-clone and a browser
 * RESTART is still live validation; that object does not exist here. What is
 * proven here is galley's half: that it writes, reads back, and never takes
 * the session down when it cannot.
 */
const handleLike = (name: string) =>
  ({ kind: 'directory', name }) as unknown as FileSystemDirectoryHandle

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('projectStore', () => {
  it('remembers a folder and gives it back', async () => {
    expect(await rememberProject(handleLike('the-illusion'))).toBe(true)

    const found = await rememberedProject()
    expect(found?.name).toBe('the-illusion')
    expect(found?.handle).toEqual(handleLike('the-illusion'))
  })

  it('remembers only the most recent folder', async () => {
    await rememberProject(handleLike('first'))
    await rememberProject(handleLike('second'))
    expect((await rememberedProject())?.name).toBe('second')
  })

  it('has nothing to give back before anything is remembered', async () => {
    expect(await rememberedProject()).toBeNull()
  })

  it('forgets on request', async () => {
    await rememberProject(handleLike('the-illusion'))
    await forgetProject()
    expect(await rememberedProject()).toBeNull()
  })

  /**
   * Its own database, and that is not a detail.
   *
   * A second object store inside `galley-images` would need that database's
   * version bumped, and `imageStore.open()` resolves null on `onblocked` — so
   * a second tab left open on the old version would silently disable IMAGE
   * storage for someone who did nothing but open a project folder. The
   * separation is the fix; without this test it is only a comment, and
   * renaming the database back passed every other test here.
   */
  it("uses a database of its own, not the image store's", async () => {
    const real = indexedDB
    const opened: string[] = []
    vi.stubGlobal('indexedDB', {
      open: (name: string, version?: number) => {
        opened.push(name)
        return real.open(name, version)
      },
    })

    await rememberProject(handleLike('x'))

    expect(opened).toContain('galley-project')
    expect(opened).not.toContain('galley-images')
  })

  /**
   * A database written by a future build, or a handle the browser has stopped
   * honouring, must read as "nothing remembered". Returning a malformed record
   * would hand the shell a project with no handle to open.
   */
  it('treats a record with no handle as nothing remembered', async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('galley-project', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('handles')
      request.onsuccess = () => resolve(request.result)
    })
    await new Promise((resolve) => {
      const tx = db.transaction('handles', 'readwrite')
      tx.objectStore('handles').put({ name: 'broken' }, 'last')
      tx.oncomplete = resolve
    })
    db.close()

    expect(await rememberedProject()).toBeNull()
  })

  /**
   * Persistence must never break the application. Every one of these is a
   * real browser state — a private window, a disabled store, a second tab
   * holding an old version — and each must RESOLVE.
   */
  describe('degrades rather than throwing', () => {
    it('when IndexedDB is absent', async () => {
      vi.stubGlobal('indexedDB', undefined)
      await expect(rememberProject(handleLike('x'))).resolves.toBe(false)
      await expect(rememberedProject()).resolves.toBeNull()
      await expect(forgetProject()).resolves.toBeUndefined()
    })

    it('when opening the database throws', async () => {
      vi.stubGlobal('indexedDB', {
        open: () => {
          throw new DOMException('denied', 'SecurityError')
        },
      })
      await expect(rememberProject(handleLike('x'))).resolves.toBe(false)
      await expect(rememberedProject()).resolves.toBeNull()
    })

    it('when opening the database errors', async () => {
      vi.stubGlobal('indexedDB', {
        open: () => {
          const request: Record<string, unknown> = {}
          queueMicrotask(() => (request.onerror as () => void)?.())
          return request
        },
      })
      await expect(rememberedProject()).resolves.toBeNull()
    })

    it('when another tab blocks the upgrade', async () => {
      vi.stubGlobal('indexedDB', {
        open: () => {
          const request: Record<string, unknown> = {}
          queueMicrotask(() => (request.onblocked as () => void)?.())
          return request
        },
      })
      await expect(rememberedProject()).resolves.toBeNull()
    })
  })
})
