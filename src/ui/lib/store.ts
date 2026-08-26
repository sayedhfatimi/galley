import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_CONFIG, type GalleyConfig, type Metadata } from '@/core/config'

export type Theme = 'light' | 'dark'

/**
 * Application state.
 *
 * ## What persists, and what the promise actually is
 *
 * The commitment galley makes is that **nothing is ever sent to a server** —
 * that is what client-side compilation buys, and it is provable rather than
 * asserted. Keeping work in the reader's own browser does not weaken it, so the
 * document persists too: closing a tab and coming back to an unfinished
 * manuscript is a courtesy, not a leak.
 *
 * Two constraints follow, and neither is optional:
 *
 * 1. **The on-page wording must match.** Saying "not saved" while writing to
 *    localStorage would be a lie to exactly the person the sentence is there to
 *    reassure. It says "stays in this browser" instead.
 * 2. **Persistence must never break the app.** localStorage is a ~5 MB quota and
 *    galley accepts documents up to 2 MB, which in UTF-16 can exceed it on its
 *    own. `safeStorage` below degrades — preferences survive, the document is
 *    dropped — rather than throwing and losing the session.
 */
export interface GalleyStore {
  // ---- persisted: the work in progress and how it is set up ----
  source: string
  fileName: string
  config: GalleyConfig
  theme: Theme

  // ---- transient: never persisted ----
  /** True when metadata was filled from the document's own frontmatter. */
  prefilled: boolean
  resultOpen: boolean

  setSource: (source: string) => void
  setFileName: (fileName: string) => void
  setConfig: (config: GalleyConfig) => void
  /** Fill only fields the reader has not set, so their own edits survive. */
  applyFrontmatter: (found: Metadata) => void
  setResultOpen: (open: boolean) => void
  toggleTheme: () => void
}

const SAMPLE = `# A first heading

Paste or drop your own Markdown here. Set the document up from **Configure**,
then **Render PDF** when you are ready.
`

/**
 * Dark by default; the system preference wins on a first visit. Guarded because this runs at module load,
 * and `matchMedia` is absent under jsdom and in any non-browser consumer — the
 * pure `persistedSlice` below should be importable without a DOM.
 */
function initialTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * The persisted slice. Everything not named here stays in memory only —
 * transient UI state has no business surviving a reload.
 */
export function persistedSlice(state: GalleyStore) {
  return {
    // Checked up front rather than left to fail: attempting a write we already
    // know will exceed the quota just to catch the error is wasteful, and the
    // outcome is the same either way.
    source: state.source.length <= MAX_PERSISTED_SOURCE ? state.source : '',
    fileName: state.fileName,
    config: state.config,
    theme: state.theme,
  }
}

/**
 * Roughly how much document we are willing to keep. Well under the ~5 MB
 * localStorage quota, since the config and other keys share it and UTF-16
 * storage can be twice the byte count of the source. `safeStorage` still catches
 * the quota case, because other origins' usage is not ours to predict.
 */
export const MAX_PERSISTED_SOURCE = 1_000_000

/**
 * Resolved lazily and defensively rather than captured at module load.
 * `localStorage` can be absent (a non-browser consumer), present but throwing on
 * access (some private-browsing modes), or shadowed by a host that provides an
 * unusable stub — Node does exactly that without `--localstorage-file`.
 */
function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'object' ? globalThis.localStorage : null
  } catch {
    return null
  }
}

/**
 * localStorage that cannot take the application down with it.
 *
 * Quota exhaustion is realistic here, not theoretical: galley accepts documents
 * up to 2 MB. On failure it retries without the document, so a reader with an
 * enormous manuscript keeps their setup and merely loses the
 * resume-where-you-left-off courtesy. Losing the running session to a storage
 * error would be far worse.
 */
export const safeStorage = {
  getItem: (name: string) => {
    try {
      return storage()?.getItem(name) ?? null
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string) => {
    const store = storage()
    if (!store) return
    try {
      store.setItem(name, value)
      return
    } catch {
      // Most likely the quota. Fall through and try again without the document.
    }
    try {
      const parsed = JSON.parse(value)
      if (parsed?.state) parsed.state.source = ''
      store.setItem(name, JSON.stringify(parsed))
    } catch {
      // Storage is unusable. Persistence is a convenience, so carrying on
      // without it is correct — losing the running session would not be.
    }
  },
  removeItem: (name: string) => {
    try {
      storage()?.removeItem(name)
    } catch {
      // as above
    }
  },
}

/**
 * Layer a persisted state over the current defaults.
 *
 * Zustand's default merge is shallow, so a persisted `config` REPLACES
 * `DEFAULT_CONFIG` wholesale rather than layering over it. Every field added to
 * the config after a reader's last visit would therefore arrive `undefined` —
 * a break that only ever shows up for returning users and never in a fresh
 * browser, which is exactly the class of bug a test in a clean jsdom cannot see.
 *
 * Merging one level into `config` is version-independent, so it protects
 * fields added later as well as the ones added now. It does NOT reach inside
 * the nested objects (`toc`, `chapters`, `margins`, `metadata`): a field added
 * *within* one of those would reintroduce the same problem and would need
 * handling here.
 */
export function mergePersisted(persisted: unknown, current: GalleyStore): GalleyStore {
  const saved = (persisted ?? {}) as Partial<GalleyStore>
  return {
    ...current,
    ...saved,
    config: { ...current.config, ...(saved.config ?? {}) },
  }
}

export const useStore = create<GalleyStore>()(
  persist(
    (set) => ({
      source: SAMPLE,
      fileName: 'document',
      prefilled: false,
      config: DEFAULT_CONFIG,
      theme: initialTheme(),
      resultOpen: false,

      setSource: (source) => set({ source }),
      setFileName: (fileName) => set({ fileName }),
      setConfig: (config) => set({ config }),
      setResultOpen: (resultOpen) => set({ resultOpen }),

      applyFrontmatter: (found) =>
        set((s) => ({
          config: { ...s.config, metadata: { ...found, ...s.config.metadata } },
          prefilled: true,
        })),

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'galley',
      // Deliberately still 1. Bumping it without also supplying `migrate` makes
      // zustand DISCARD the stored state outright — "State loaded from storage
      // couldn't be migrated since no migrate function was provided" — which
      // would throw away the reader's manuscript on upgrade, a far worse bug
      // than the one `merge` below exists to fix. The version is for breaking
      // shape changes that need transforming; adding an optional field with a
      // default is not one, and `merge` handles it without a version at all.
      version: 1,
      partialize: persistedSlice,
      merge: (persisted, current) => mergePersisted(persisted, current),
      storage: {
        getItem: (name) => {
          const raw = safeStorage.getItem(name)
          return raw ? JSON.parse(raw) : null
        },
        setItem: (name, value) => safeStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => safeStorage.removeItem(name),
      },
    },
  ),
)
