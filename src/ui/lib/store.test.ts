import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import {
  type GalleyStore,
  MAX_PERSISTED_SOURCE,
  persistedSlice,
  safeStorage,
} from './store'

/**
 * What these guard.
 *
 * galley keeps the reader's work in their own browser so they can close a tab
 * and come back. The promise is that nothing is ever sent to a server, not that
 * nothing touches disk. Two things therefore have to hold:
 *
 * - transient UI state must not leak into storage and resurrect on reload
 * - persistence must never take the application down, because localStorage has a
 *   quota galley's own 2 MB input limit can exceed on its own
 */

const state = (over: Partial<GalleyStore> = {}): GalleyStore =>
  ({
    source: '# A manuscript\n\nBody text.',
    fileName: 'my-novel',
    prefilled: true,
    config: { ...DEFAULT_CONFIG, character: 'book' },
    theme: 'dark',
    resultOpen: true,
    setSource: () => {},
    setFileName: () => {},
    setConfig: () => {},
    applyFrontmatter: () => {},
    setResultOpen: () => {},
    toggleTheme: () => {},
    ...over,
  }) as GalleyStore

describe('persistedSlice', () => {
  it('keeps the work in progress so a reader can pick it up later', () => {
    const slice = persistedSlice(state())
    expect(slice.source).toContain('A manuscript')
    expect(slice.fileName).toBe('my-novel')
    expect(slice.config.character).toBe('book')
    expect(slice.theme).toBe('dark')
  })

  // A dialog that reopens itself on reload is a bug, not a restored session.
  it('does not persist transient UI state', () => {
    const slice = persistedSlice(state({ resultOpen: true, prefilled: true }))
    expect(slice).not.toHaveProperty('resultOpen')
    expect(slice).not.toHaveProperty('prefilled')
  })

  it('persists exactly the four keys it means to, so new state is opt-in', () => {
    expect(Object.keys(persistedSlice(state())).sort()).toEqual([
      'config',
      'fileName',
      'source',
      'theme',
    ])
  })

  // galley accepts documents up to 2 MB; localStorage is around 5 MB total.
  it('drops an oversized document rather than attempting a doomed write', () => {
    const huge = 'x'.repeat(MAX_PERSISTED_SOURCE + 1)
    const slice = persistedSlice(state({ source: huge }))
    expect(slice.source).toBe('')
    // The setup survives even when the document cannot.
    expect(slice.config.character).toBe('book')
  })

  it('keeps a document exactly at the limit', () => {
    const atLimit = 'x'.repeat(MAX_PERSISTED_SOURCE)
    expect(persistedSlice(state({ source: atLimit })).source).toHaveLength(
      MAX_PERSISTED_SOURCE,
    )
  })
})

/**
 * A minimal Storage stand-in. The runtime here does not supply a usable
 * localStorage — Node shadows jsdom's with an unavailable stub unless
 * `--localstorage-file` is passed — which is itself one of the conditions
 * safeStorage exists to survive.
 */
function fakeStorage(onSet?: (key: string, value: string) => void): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => {
      onSet?.(k, v)
      map.set(k, v)
    },
  } as Storage
}

function install(store: Storage | undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  })
}

describe('safeStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    install(fakeStorage())
  })

  it('round-trips normally', () => {
    safeStorage.setItem('k', JSON.stringify({ state: { source: 'hello' } }))
    expect(safeStorage.getItem('k')).toContain('hello')
  })

  // The important case: the session must survive a full quota.
  it('retries without the document when the quota is exceeded', () => {
    let calls = 0
    install(
      fakeStorage(() => {
        calls += 1
        if (calls === 1) throw new DOMException('quota', 'QuotaExceededError')
      }),
    )

    expect(() =>
      safeStorage.setItem(
        'k',
        JSON.stringify({ state: { source: 'huge', theme: 'dark' } }),
      ),
    ).not.toThrow()

    const stored = JSON.parse(safeStorage.getItem('k') ?? '{}')
    expect(stored.state.source).toBe('')
    expect(stored.state.theme).toBe('dark')
  })

  it('gives up quietly when every write is refused', () => {
    install(
      fakeStorage(() => {
        throw new DOMException('denied', 'SecurityError')
      }),
    )
    expect(() => safeStorage.setItem('k', '{"state":{}}')).not.toThrow()
  })

  it('does nothing when storage is absent entirely', () => {
    install(undefined)
    expect(() => safeStorage.setItem('k', '{"state":{}}')).not.toThrow()
    expect(safeStorage.getItem('k')).toBeNull()
    expect(() => safeStorage.removeItem('k')).not.toThrow()
  })
})
