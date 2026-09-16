import { afterEach, describe, expect, it, vi } from 'vitest'
import { canOpenFolder, ensurePermission, pickProjectFolder } from './pick'

const handle = { kind: 'directory', name: 'p' } as unknown as FileSystemDirectoryHandle

afterEach(() => {
  vi.unstubAllGlobals()
  // Restored to ABSENT, not to undefined-but-present: `canOpenFolder` asks
  // whether the property is a function, and the two are the same to it, but
  // leaving a stub behind would be a different browser than the one the
  // unsupported cases mean to describe.
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

describe('canOpenFolder', () => {
  it('is false in a browser without the API', () => {
    expect(canOpenFolder()).toBe(false)
  })

  it('is true when the API is present', () => {
    window.showDirectoryPicker = async () => handle
    expect(canOpenFolder()).toBe(true)
  })
})

describe('pickProjectFolder', () => {
  it('returns the handle the reader chose', async () => {
    window.showDirectoryPicker = async () => handle
    expect(await pickProjectFolder()).toEqual({ ok: true, handle })
  })

  it('says unsupported rather than failing when the API is absent', async () => {
    expect(await pickProjectFolder()).toEqual({ ok: false, reason: 'unsupported' })
  })

  /**
   * Dismissing the picker rejects with `AbortError`. Telling someone their
   * folder failed to open when they simply changed their mind is noise, and
   * it is the difference between an app that feels broken and one that does
   * not.
   */
  it('treats a dismissed picker as cancelled, not as a failure', async () => {
    window.showDirectoryPicker = async () => {
      throw new DOMException('aborted', 'AbortError')
    }
    expect(await pickProjectFolder()).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('reports a real failure as a failure', async () => {
    window.showDirectoryPicker = async () => {
      throw new DOMException('denied', 'SecurityError')
    }
    expect(await pickProjectFolder()).toEqual({ ok: false, reason: 'failed' })
  })
})

describe('ensurePermission', () => {
  const withPermission = (query: PermissionState, request?: PermissionState) =>
    ({
      kind: 'directory',
      name: 'p',
      queryPermission: async () => query,
      requestPermission: async () => request ?? query,
    }) as unknown as FileSystemDirectoryHandle

  it('does not prompt when permission is already granted', async () => {
    const requestPermission = vi.fn()
    const h = {
      queryPermission: async () => 'granted',
      requestPermission,
    } as unknown as FileSystemDirectoryHandle
    expect(await ensurePermission(h)).toBe(true)
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('asks when permission has lapsed, and reports the answer', async () => {
    expect(await ensurePermission(withPermission('prompt', 'granted'))).toBe(true)
    expect(await ensurePermission(withPermission('prompt', 'denied'))).toBe(false)
  })

  it('returns false rather than throwing when the handle refuses to answer', async () => {
    const h = {
      queryPermission: async () => {
        throw new DOMException('gone', 'InvalidStateError')
      },
    } as unknown as FileSystemDirectoryHandle
    await expect(ensurePermission(h)).resolves.toBe(false)
  })

  it('returns false for a handle with no permission API at all', async () => {
    expect(await ensurePermission(handle)).toBe(false)
  })
})
