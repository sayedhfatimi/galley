import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeFs } from '@/ui/lib/fs/fakeHandle'
import type { FileState } from '@/ui/lib/store'
import { useAutosave } from './useAutosave'

/**
 * The hook is driven directly rather than through a component: it is plain
 * logic over refs, and `renderHook` would add a dependency to test something
 * that does not need React to be observed.
 */
function drive(
  fs: ReturnType<typeof fakeFs>,
  handles: Map<string, FileSystemFileHandle>,
) {
  const files = new Map<string, FileState>()
  for (const [path, entry] of fs.files) {
    files.set(path, { dirty: false, lastModified: entry.lastModified, conflict: null })
  }
  const setFileState = vi.fn((path: string, patch: Partial<FileState>) => {
    files.set(path, { ...(files.get(path) as FileState), ...patch })
  })
  // The hook only uses refs and callbacks, so calling it outside a component
  // is safe here — React's own hooks are not involved beyond useRef/useCallback.
  let api!: ReturnType<typeof useAutosave>
  const Harness = () => {
    api = useAutosave({ handles, files, setFileState })
    return null
  }
  return {
    files,
    setFileState,
    Harness,
    get api() {
      return api
    },
  }
}

let cleanup: (() => void)[] = []

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const fn of cleanup) fn()
  cleanup = []
  vi.useRealTimers()
})

async function mount(fs: ReturnType<typeof fakeFs>) {
  const handles = new Map<string, FileSystemFileHandle>()
  for (const path of fs.files.keys()) {
    handles.set(path, await fs.root.getFileHandle(path))
  }
  const harness = drive(fs, handles)
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => root.render(<harness.Harness />))
  let unmounted = false
  const unmount = () => {
    if (unmounted) return
    unmounted = true
    act(() => root.unmount())
  }
  cleanup.push(unmount)
  return Object.assign(harness, { unmount })
}

describe('useAutosave', () => {
  it('writes after the debounce settles', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)

    act(() => h.api.save('a.md', 'new'))
    expect(fs.files.get('a.md')?.content).toBe('old')

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })
    expect(fs.files.get('a.md')?.content).toBe('new')
  })

  it('marks the file dirty immediately, and clean once written', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)

    act(() => h.api.save('a.md', 'new'))
    expect(h.files.get('a.md')?.dirty).toBe(true)

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })
    expect(h.files.get('a.md')?.dirty).toBe(false)
  })

  /**
   * One timer per FILE. A single shared timer means typing in the right pane
   * cancels the left pane's pending write, and that edit is then never saved
   * — silently, because nothing failed.
   */
  it('writes both files when two panes are edited inside one debounce window', async () => {
    const fs = fakeFs({ 'a.md': 'a', 'b.md': 'b' })
    const h = await mount(fs)

    act(() => {
      h.api.save('a.md', 'a edited')
      h.api.save('b.md', 'b edited')
    })
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(fs.files.get('a.md')?.content).toBe('a edited')
    expect(fs.files.get('b.md')?.content).toBe('b edited')
  })

  it('refuses and conflicts when the file changed elsewhere', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)

    fs.touch('a.md', 'from Obsidian')
    act(() => h.api.save('a.md', 'mine'))
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(fs.files.get('a.md')?.content).toBe('from Obsidian')
    expect(h.files.get('a.md')?.conflict).toEqual({ theirs: expect.any(Number) })
  })

  /**
   * A file in conflict stops being written to AT ALL.
   *
   * The content is safe either way — `writeFile` refuses a stale write on its
   * own, before it ever opens a writable — so neither the content nor the
   * write attempt can tell "stopped" from "kept failing". What separates them
   * is whether the file is TOUCHED at all: without the guard every keystroke
   * costs a staleness read of a file galley already knows it may not write.
   */
  it('stops autosaving a file that is in conflict', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)

    fs.touch('a.md', 'theirs')
    act(() => h.api.save('a.md', 'mine'))
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })
    const readsSoFar = fs.reads.get('a.md') ?? 0
    expect(h.files.get('a.md')?.conflict).not.toBeNull()

    act(() => h.api.save('a.md', 'mine again'))
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    // Not even a staleness read: the file is left entirely alone.
    expect(fs.reads.get('a.md') ?? 0).toBe(readsSoFar)
    expect(fs.writeAttempts.get('a.md') ?? 0).toBe(0)
    expect(fs.files.get('a.md')?.content).toBe('theirs')
  })

  /**
   * THE mutation the obvious test misses.
   *
   * Re-checking on focus and refreshing the stored timestamp looks correct
   * and reads correct. It means the next write MATCHES, succeeds, and
   * overwrites whatever arrived. A test that only asserts "focus triggers a
   * re-check" passes under it.
   */
  it('does not let a focus re-check make the next write succeed', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)

    fs.touch('a.md', 'arrived from a phone')
    await act(async () => {
      await h.api.recheck(['a.md'])
    })
    expect(h.files.get('a.md')?.conflict).not.toBeNull()

    act(() => h.api.save('a.md', 'mine'))
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })
    expect(fs.files.get('a.md')?.content).toBe('arrived from a phone')
  })

  it('leaves an unchanged file alone on a re-check', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)
    await act(async () => {
      await h.api.recheck(['a.md'])
    })
    expect(h.files.get('a.md')?.conflict).toBeNull()
  })

  it('writes again once the reader takes what is on disk', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)

    fs.touch('a.md', 'theirs')
    act(() => h.api.save('a.md', 'mine'))
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    const theirs = fs.files.get('a.md')?.lastModified as number
    act(() => h.api.resolveWithTheirs('a.md', theirs))
    expect(h.files.get('a.md')?.conflict).toBeNull()

    act(() => h.api.save('a.md', 'mine, now on top of theirs'))
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })
    expect(fs.files.get('a.md')?.content).toBe('mine, now on top of theirs')
  })

  it('flushes a pending write on demand, without waiting for the debounce', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)

    act(() => h.api.save('a.md', 'new'))
    await act(async () => {
      await h.api.flush('a.md')
    })
    expect(fs.files.get('a.md')?.content).toBe('new')
  })
})

/**
 * Closing the project unmounts the shell, and the hook's cleanup clears every
 * pending timer. An edit made inside the debounce window is then simply gone —
 * no error, no refusal, and the file still holds what it held before.
 *
 * Small window, ordinary gesture: type the last word of a sentence and click
 * Close. This is the class of loss the whole branch exists to prevent, arriving
 * through the one door nothing was watching.
 */
describe('a pending edit and an unmount', () => {
  it('is lost if nothing flushes it', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)

    act(() => h.api.save('a.md', 'the last thing I typed'))
    // The shell unmounts before the debounce fires.
    h.unmount()

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })
    expect(fs.files.get('a.md')?.content).toBe('old')
  })

  it('survives when the caller flushes first', async () => {
    const fs = fakeFs({ 'a.md': 'old' })
    const h = await mount(fs)

    act(() => h.api.save('a.md', 'the last thing I typed'))
    await act(async () => {
      await h.api.flushAll()
    })
    h.unmount()

    expect(fs.files.get('a.md')?.content).toBe('the last thing I typed')
  })
})
