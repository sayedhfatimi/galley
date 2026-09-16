import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import {
  type GalleyStore,
  MAX_PERSISTED_SOURCE,
  mergePersisted,
  type ProjectSession,
  persistedSlice,
  safeStorage,
  useStore,
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
    rememberedProject: null,
    mode: 'document',
    session: null,
    openProject: () => {},
    closeProject: () => {},
    forgetRememberedProject: () => {},
    setProjectConfig: () => {},
    setPane: () => {},
    setLastFocused: () => {},
    setFileState: () => {},
    setProject: () => {},
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

  it('persists exactly the keys it means to, so new state is opt-in', () => {
    expect(Object.keys(persistedSlice(state())).sort()).toEqual([
      'config',
      'fileName',
      'rememberedProject',
      'source',
      'theme',
    ])
  })

  /**
   * A whole project must never reach localStorage.
   *
   * The session holds a directory handle, a handle per file and every
   * chapter's full text. The handle alone settles it — `JSON.stringify` turns
   * one into `{}`, so it would appear to persist and come back useless — and
   * the sources would blow the quota on a book. The NAME is all that is kept,
   * which is all the reopen prompt needs.
   */
  it('never persists the open session, only the folder name', () => {
    const slice = persistedSlice(
      state({
        mode: 'project',
        rememberedProject: { name: 'the-illusion' },
        session: { name: 'the-illusion' } as never,
      }),
    )
    expect(slice).not.toHaveProperty('session')
    expect(slice).not.toHaveProperty('mode')
    expect(slice.rememberedProject).toEqual({ name: 'the-illusion' })
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

/**
 * The failure this guards against only ever happens to a returning reader: a
 * config persisted before a field existed comes back missing it, and a fresh
 * browser never reproduces it. Zustand's default merge is shallow, so without
 * an explicit merge the stored config replaces the defaults outright.
 */
describe('mergePersisted', () => {
  it('backfills config fields a stored config predates', () => {
    const current = useStore.getState()
    const stored = {
      source: 'old work',
      fileName: 'old',
      theme: 'light' as const,
      // A v1 config: no typeface, because the field did not exist yet.
      config: { ...DEFAULT_CONFIG, character: 'book' as const, typeface: undefined },
    }
    delete (stored.config as { typeface?: unknown }).typeface

    const merged = mergePersisted(stored, current)

    expect(merged.config.typeface).toBe(DEFAULT_CONFIG.typeface)
    expect(merged.config.typeface).toBeDefined()
    // The reader's own choices must survive the backfill.
    expect(merged.config.character).toBe('book')
    expect(merged.source).toBe('old work')
    expect(merged.theme).toBe('light')
  })

  it('prefers the stored value over the default when one is present', () => {
    const current = useStore.getState()
    const merged = mergePersisted(
      { config: { ...DEFAULT_CONFIG, typeface: 'pagella' as const } },
      current,
    )
    expect(merged.config.typeface).toBe('pagella')
  })

  it('survives a persisted state that is absent or malformed', () => {
    const current = useStore.getState()
    expect(mergePersisted(undefined, current).config.typeface).toBe(
      DEFAULT_CONFIG.typeface,
    )
    expect(mergePersisted({}, current).config.typeface).toBe(DEFAULT_CONFIG.typeface)
  })

  it('backfills sections for a config stored before it existed', () => {
    const current = useStore.getState()
    const stored = {
      source: 'old work',
      fileName: 'old',
      theme: 'dark' as const,
      config: { ...DEFAULT_CONFIG, fontSize: 12 as const },
    }
    delete (stored.config as { sections?: unknown }).sections

    const merged = mergePersisted(stored, current)

    expect(merged.config.sections).toEqual({ numbered: true })
    // The reader's own choices still survive the backfill.
    expect(merged.config.fontSize).toBe(12)
  })
})

/**
 * A project is a MODE over the same shell, and the single document has to
 * come back exactly as it was left.
 *
 * This is the one the audit forced. `App.tsx` writes a document's own
 * frontmatter into `config.metadata` on every change, and `config` is one
 * persisted field — so a session sharing it would leave the BOOK's trim size
 * and typeface behind as the document's, and "close returns you to your
 * document" would quietly be false.
 */
/**
 * Captured at import, BEFORE any test sets state. The initial value is the
 * thing under test here, so a fixture that assigns `mode` itself would pass
 * whatever the store actually starts as.
 */
const INITIAL_MODE = useStore.getState().mode

describe('project mode', () => {
  const session = (over: Partial<ProjectSession> = {}): ProjectSession => ({
    handle: { kind: 'directory', name: 'the-illusion' } as never,
    name: 'the-illusion',
    project: {
      parts: [],
      notes: [],
      figures: [],
      metadata: {},
      config: {},
      diagnostics: [],
    },
    bookSource: null,
    handles: new Map(),
    config: { ...DEFAULT_CONFIG, character: 'book', typeface: 'pagella' },
    files: new Map(),
    panes: { left: null, right: null },
    lastFocused: 'left',
    ...over,
  })

  const fresh = () => {
    useStore.setState({
      source: '# Mine\n',
      fileName: 'mine',
      config: { ...DEFAULT_CONFIG, character: 'article' },
      mode: 'document',
      session: null,
      rememberedProject: null,
    })
  }

  it('starts in document mode', () => {
    // Reopening needs a user gesture, so landing in project mode on load
    // would land in a project galley is not allowed to read. A remembered
    // folder is an OFFER, and `mode` is deliberately not persisted at all.
    expect(INITIAL_MODE).toBe('document')
    expect(useStore.getState().session).toBeDefined()
  })

  it('does not restore a mode from storage, only a folder name', () => {
    const merged = mergePersisted(
      { rememberedProject: { name: 'the-illusion' }, mode: 'project' },
      state({ mode: 'document' }),
    )
    expect(merged.mode).toBe('document')
    expect(merged.rememberedProject).toEqual({ name: 'the-illusion' })
  })

  it('leaves the document untouched while a project is open', () => {
    fresh()
    const before = useStore.getState()
    const sourceBefore = before.source
    const configBefore = JSON.stringify(before.config)

    useStore.getState().openProject(session())
    useStore.getState().setProjectConfig({ ...DEFAULT_CONFIG, character: 'report' })

    expect(useStore.getState().source).toBe(sourceBefore)
    expect(JSON.stringify(useStore.getState().config)).toBe(configBefore)
  })

  it('returns the document exactly as it was when the project closes', () => {
    fresh()
    const configBefore = JSON.stringify(useStore.getState().config)

    useStore.getState().openProject(session())
    useStore.getState().setProjectConfig({ ...DEFAULT_CONFIG, character: 'report' })
    useStore.getState().closeProject()

    expect(useStore.getState().mode).toBe('document')
    expect(useStore.getState().session).toBeNull()
    expect(JSON.stringify(useStore.getState().config)).toBe(configBefore)
    expect(useStore.getState().source).toBe('# Mine\n')
  })

  it('remembers the folder name when a project opens', () => {
    fresh()
    useStore.getState().openProject(session())
    expect(useStore.getState().rememberedProject).toEqual({ name: 'the-illusion' })
  })

  it('keeps remembering the folder after it is closed, so it can be offered again', () => {
    fresh()
    useStore.getState().openProject(session())
    useStore.getState().closeProject()
    expect(useStore.getState().rememberedProject).toEqual({ name: 'the-illusion' })
  })

  it('tracks per-file state without disturbing the others', () => {
    fresh()
    useStore.getState().openProject(session())
    useStore.getState().setFileState('a.md', { dirty: true })
    useStore.getState().setFileState('b.md', { lastModified: 42 })
    useStore.getState().setFileState('a.md', { lastModified: 7 })

    const files = useStore.getState().session?.files
    expect(files?.get('a.md')).toEqual({ dirty: true, lastModified: 7, conflict: null })
    expect(files?.get('b.md')).toEqual({ dirty: false, lastModified: 42, conflict: null })
  })

  /**
   * zustand compares by reference. A map mutated in place is the same object,
   * so nothing subscribed to it re-renders — the dirty marker and the
   * conflict banner would both be correct in the store and invisible on the
   * screen.
   */
  it('replaces the file map rather than mutating it, so subscribers re-render', () => {
    fresh()
    useStore.getState().openProject(session())
    const before = useStore.getState().session?.files
    useStore.getState().setFileState('a.md', { dirty: true })
    expect(useStore.getState().session?.files).not.toBe(before)
  })

  it('ignores project actions when no project is open', () => {
    fresh()
    expect(() => {
      useStore.getState().setPane('left', 'a.md')
      useStore.getState().setFileState('a.md', { dirty: true })
      useStore.getState().setLastFocused('right')
    }).not.toThrow()
    expect(useStore.getState().session).toBeNull()
  })
})
