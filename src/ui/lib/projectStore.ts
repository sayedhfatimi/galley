/**
 * The folder the reader last had open, remembered between visits.
 *
 * A `FileSystemDirectoryHandle` is structured-cloneable but not
 * serialisable, so it cannot live in the zustand store: that store is
 * `localStorage`, which is strings, and `JSON.stringify` turns a handle into
 * `{}` — the handle would appear to persist and come back useless. IndexedDB
 * stores the object itself.
 *
 * ## Its own database, deliberately
 *
 * Adding a second object store to `galley-images` would mean bumping that
 * database's `DB_VERSION`, and `imageStore.open()` resolves `null` on
 * `onblocked` — a second tab holding the old version open would silently
 * disable IMAGE storage for someone who merely opened a project folder.
 * Separate database, separate blast radius.
 *
 * The obligation from `decisions/local-persistence.md` carries over
 * unchanged: **persistence must never break the application**. Every call
 * here resolves rather than rejects. Forgetting which folder was open costs
 * the reader one click; losing the session would cost them their work.
 *
 * Reopening is always a CLICK. `queryPermission`/`requestPermission` need a
 * user gesture, so a remembered handle is an offer to reopen, never an
 * automatic reopen — the UI has to be designed around that rather than
 * discover it.
 */

const DB_NAME = 'galley-project'
const DB_VERSION = 1
const STORE = 'handles'
const KEY = 'last'

export interface RememberedProject {
  handle: FileSystemDirectoryHandle
  /** The folder's display name, so the UI can name it before permission is granted. */
  name: string
  openedAt: number
}

/** Resolves to null rather than throwing, on every failure path. */
function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      // Some privacy modes throw on access rather than returning undefined.
      return resolve(null)
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    // A second tab on an older version blocks the upgrade indefinitely;
    // carrying on without the memory beats hanging the session.
    request.onblocked = () => resolve(null)
  })
}

function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    open().then((db) => {
      if (!db) return resolve(null)
      try {
        const tx = db.transaction(STORE, mode)
        const request = body(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
        tx.onabort = () => resolve(null)
        tx.oncomplete = () => db.close()
      } catch {
        resolve(null)
      }
    })
  })
}

export async function rememberProject(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const record: RememberedProject = {
    handle,
    name: handle.name,
    openedAt: Date.now(),
  }
  return (await run('readwrite', (s) => s.put(record, KEY))) !== null
}

export async function rememberedProject(): Promise<RememberedProject | null> {
  const found = await run<RememberedProject>('readonly', (s) => s.get(KEY))
  // A record written by an older build, or a handle the browser no longer
  // honours, must read as "nothing remembered" rather than as a broken one.
  if (!found || typeof found !== 'object' || !found.handle) return null
  return found
}

export async function forgetProject(): Promise<void> {
  await run('readwrite', (s) => s.delete(KEY))
}
