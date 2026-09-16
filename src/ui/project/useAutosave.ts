import { useCallback, useEffect, useRef } from 'react'
import { checkStale, writeFile } from '@/ui/lib/fs/write'
import type { FileState } from '@/ui/lib/store'

/**
 * Writing the reader's edits back into their folder, and knowing when not to.
 *
 * ## Per file, not per session
 *
 * Each file gets its own debounce timer. One shared timer means typing in the
 * right pane cancels the left pane's pending write, and the left pane's edit
 * is then never saved at all — silently, because nothing failed.
 *
 * ## A refusal stops that file and only that file
 *
 * When a write is refused the file enters conflict, autosave stops for it,
 * and the reader decides. Carrying on would either overwrite work that never
 * appeared on this screen or drop theirs; both are choices that belong to the
 * person whose manuscript it is.
 *
 * ## The re-check on focus must not update what we know
 *
 * Coming back to the tab re-checks every open file. It is tempting to refresh
 * the stored `lastModified` at that point — and that is exactly the bug: the
 * next write would then match, succeed, and clobber whatever arrived. A
 * changed file sets CONFLICT; the known timestamp only moves when galley
 * itself writes, or when the reader takes theirs.
 */

const AUTOSAVE_DEBOUNCE_MS = 600

export interface AutosaveDeps {
  handles: Map<string, FileSystemFileHandle>
  files: Map<string, FileState>
  setFileState: (path: string, patch: Partial<FileState>) => void
}

export interface Autosave {
  /** Queue a write for this path. Debounced per file. */
  save: (path: string, text: string) => void
  /** Re-check one file, or every open one. Sets conflict; never clears it. */
  recheck: (paths: readonly string[]) => Promise<void>
  /** Take what is on disk: adopt their timestamp and drop the conflict. */
  resolveWithTheirs: (path: string, lastModified: number) => void
  /** Flush any pending write for this path immediately. */
  flush: (path: string) => Promise<void>
  /**
   * Flush every pending write.
   *
   * Called before the project closes. The hook's own cleanup clears the
   * timers, so without this an edit made inside the debounce window is simply
   * gone — no error and no refusal, with the file still holding what it held
   * before. Typing the last word of a sentence and clicking Close is an
   * ordinary gesture, and it was losing that word.
   */
  flushAll: () => Promise<void>
}

export function useAutosave({ handles, files, setFileState }: AutosaveDeps): Autosave {
  // Refs, not state: these are read inside timers that must see the CURRENT
  // values rather than the ones captured when the timer was armed.
  const latest = useRef({ handles, files, setFileState })
  latest.current = { handles, files, setFileState }

  const timers = useRef(new Map<string, number>())
  const pending = useRef(new Map<string, string>())

  const writeNow = useCallback(async (path: string) => {
    const text = pending.current.get(path)
    if (text === undefined) return
    pending.current.delete(path)

    const { handles, files, setFileState } = latest.current
    const handle = handles.get(path)
    const known = files.get(path)?.lastModified
    if (!handle || known == null) return

    const result = await writeFile(handle, text, known)
    if (result.ok) {
      setFileState(path, { dirty: false, lastModified: result.lastModified })
      return
    }
    if (result.reason === 'stale') {
      setFileState(path, { conflict: { theirs: result.theirs } })
    }
    // 'failed' and 'unreadable' leave the file dirty and unconflicted: the
    // next keystroke tries again, which is right for a transient error and
    // harmless for a permanent one.
  }, [])

  const save = useCallback(
    (path: string, text: string) => {
      const { files, setFileState } = latest.current
      // A file in conflict is not autosaved.
      //
      // Safety here is `writeFile`'s, not this guard's: a stale write is
      // refused at its own staleness check whether or not this exists. What
      // this saves is the attempt — a disk read on every keystroke into a
      // file galley already knows it may not write. The edit is kept pending
      // so that resolving the conflict does not lose it.
      if (files.get(path)?.conflict) {
        pending.current.set(path, text)
        setFileState(path, { dirty: true })
        return
      }

      pending.current.set(path, text)
      setFileState(path, { dirty: true })

      const existing = timers.current.get(path)
      if (existing !== undefined) window.clearTimeout(existing)
      timers.current.set(
        path,
        window.setTimeout(() => {
          timers.current.delete(path)
          void writeNow(path)
        }, AUTOSAVE_DEBOUNCE_MS),
      )
    },
    [writeNow],
  )

  const flush = useCallback(
    async (path: string) => {
      const timer = timers.current.get(path)
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timers.current.delete(path)
      }
      await writeNow(path)
    },
    [writeNow],
  )

  const recheck = useCallback(async (paths: readonly string[]) => {
    const { handles, files, setFileState } = latest.current
    for (const path of paths) {
      const handle = handles.get(path)
      const state = files.get(path)
      if (!handle || state?.lastModified == null || state.conflict) continue
      const result = await checkStale(handle, state.lastModified)
      // Deliberately NOT updating `lastModified` here. Refreshing it would
      // make the next write match and succeed, which is precisely the
      // overwrite this exists to prevent.
      if (!result.ok && result.reason === 'stale') {
        setFileState(path, { conflict: { theirs: result.theirs } })
      }
    }
  }, [])

  const resolveWithTheirs = useCallback((path: string, lastModified: number) => {
    pending.current.delete(path)
    latest.current.setFileState(path, { conflict: null, dirty: false, lastModified })
  }, [])

  const flushAll = useCallback(async () => {
    for (const path of [...pending.current.keys()]) await flush(path)
  }, [flush])

  useEffect(() => {
    const timerMap = timers.current
    return () => {
      for (const timer of timerMap.values()) window.clearTimeout(timer)
      timerMap.clear()
    }
  }, [])

  return { save, recheck, resolveWithTheirs, flush, flushAll }
}
