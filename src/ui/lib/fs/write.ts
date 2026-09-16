/**
 * Writing to a file in the author's vault, and refusing to when it has moved
 * under us.
 *
 * This is the most dangerous surface in the whole feature. galley is not the
 * only writer: Obsidian on the same machine edits these files, and so does
 * Obsidian on a PHONE, arriving over Sync in the middle of a session with no
 * local event to announce it. An autosave that assumes it still knows what is
 * on disk will overwrite work that was never shown on this screen.
 *
 * So every write re-reads `lastModified` IMMEDIATELY before opening the
 * writable, and refuses if it is not exactly what the caller last saw.
 *
 * Nothing here throws. A refusal is a value the UI renders, not an exception:
 * there is no error boundary above this yet, and a throw during an autosave
 * would take the editor down while the reader had unsaved text in it.
 */

export type Refusal =
  /** Someone else changed the file since `known`. Their version is on disk. */
  | { ok: false; reason: 'stale'; theirs: number }
  /** The file could not be read at all, so nothing can be said about it. */
  | { ok: false; reason: 'unreadable' }
  /** The write itself failed. The file is untouched. */
  | { ok: false; reason: 'failed' }

export type WriteResult = { ok: true; lastModified: number } | Refusal

export type StaleCheck =
  | { ok: true; lastModified: number }
  | { ok: false; reason: 'stale'; theirs: number }
  | { ok: false; reason: 'unreadable' }

/**
 * When a file was last written, or nothing.
 *
 * A `lastModified` of 0 or NaN is treated as UNKNOWN rather than as a
 * timestamp. A filesystem that cannot say when a file changed cannot support
 * the guarantee this module exists to make, and quietly reading that as "not
 * changed" would turn every such write into the overwrite it is meant to
 * prevent.
 */
async function modifiedAt(handle: FileSystemFileHandle): Promise<number | null> {
  try {
    const file = await handle.getFile()
    const at = file.lastModified
    return typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : null
  } catch {
    return null
  }
}

/** Has this file changed since `known`? Used on window focus and file switch. */
export async function checkStale(
  handle: FileSystemFileHandle,
  known: number,
): Promise<StaleCheck> {
  const at = await modifiedAt(handle)
  if (at === null) return { ok: false, reason: 'unreadable' }
  // `!==`, never `>`. A sync can write an OLDER timestamp than the one we
  // hold — a file edited on a phone whose clock is behind this machine's —
  // and `>` would read that as "not changed" and overwrite it.
  if (at !== known) return { ok: false, reason: 'stale', theirs: at }
  return { ok: true, lastModified: at }
}

/**
 * Write `text`, but only if the file is still exactly as last seen.
 *
 * The check is deliberately here and not in the caller's debounce. Between a
 * keystroke settling and the write landing there is a window of hundreds of
 * milliseconds, which is ample for a sync to arrive; checking when the timer
 * is set rather than when the bytes go out would leave exactly that window
 * open and would look, in every test that does not deliberately race it, like
 * it worked.
 */
export async function writeFile(
  handle: FileSystemFileHandle,
  text: string,
  known: number,
): Promise<WriteResult> {
  const before = await checkStale(handle, known)
  if (!before.ok) return before

  let writable: FileSystemWritableFileStream
  try {
    writable = await handle.createWritable()
  } catch {
    return { ok: false, reason: 'failed' }
  }

  try {
    await writable.write(text)

    // Checked AGAIN, after staging the bytes and before committing them.
    //
    // `createWritable` + `close` is not an atomic compare-and-swap: the File
    // System Access API offers none, so between the first check and the commit
    // there is a real window, and a sync landing in it would be overwritten.
    // Measured with a fake that lands an outside edit exactly there — the
    // single check passed and the other writer's content was lost.
    //
    // This NARROWS the window to the span of one `write`; it does not close
    // it, and nothing available here can. Said plainly because a guarantee
    // that is nearly true is worth having and not worth overstating.
    const during = await checkStale(handle, known)
    if (!during.ok) {
      try {
        await writable.abort?.()
      } catch {
        // Nothing was committed either way.
      }
      return during
    }

    await writable.close()
  } catch {
    // `createWritable` stages into a swap file and commits on close, so a
    // failure before that leaves the original untouched. Aborting makes it
    // explicit rather than relying on the implementation to tidy up.
    try {
      await writable.abort?.()
    } catch {
      // Nothing further to try, and nothing was committed.
    }
    return { ok: false, reason: 'failed' }
  }

  const after = await modifiedAt(handle)
  // The file is written; not being able to read its new timestamp is a
  // problem for the NEXT write, which will refuse rather than guess.
  return after === null
    ? { ok: false, reason: 'unreadable' }
    : { ok: true, lastModified: after }
}
