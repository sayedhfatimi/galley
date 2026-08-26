/**
 * Attached images, kept in the reader's own browser.
 *
 * IndexedDB rather than localStorage, and not by preference: `store.ts` already
 * caps the document at 1 MB against a ~5 MB quota shared with everything else,
 * and a single photograph can exceed that on its own.
 *
 * The obligation from `decisions/local-persistence.md` carries over unchanged —
 * **persistence must never break the application**. Every call here resolves
 * rather than rejects: a browser with IndexedDB disabled, a private window, a
 * full disk or a blocked upgrade all degrade to "no stored images", which costs
 * the reader the convenience of finding their figures again and costs them
 * nothing else. Losing the running session to a storage error would be worse
 * than losing the storage.
 *
 * Keyed by the sanitised name from `core/images.ts`, which is the same name the
 * Markdown carries, the `.tex` references and the engine writes to disk.
 */

const DB_NAME = 'galley-images'
const DB_VERSION = 1
const STORE = 'images'

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
    // A second tab holding an old version open blocks the upgrade indefinitely;
    // carrying on without storage beats hanging the session.
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

export async function putImage(name: string, bytes: ArrayBuffer): Promise<boolean> {
  const result = await run('readwrite', (s) => s.put(bytes, name))
  return result !== null
}

export async function getImage(name: string): Promise<ArrayBuffer | null> {
  const value = await run<ArrayBuffer>('readonly', (s) => s.get(name))
  return value ?? null
}

export async function deleteImage(name: string): Promise<void> {
  await run('readwrite', (s) => s.delete(name))
}

export async function listImageNames(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
  return (keys ?? []).filter((k): k is string => typeof k === 'string')
}

/**
 * The bytes for exactly the names given, skipping any that are missing.
 *
 * A document can reference an image the reader never attached — a manuscript
 * written elsewhere and pasted in will do it every time — so an absent name is
 * an ordinary case, not an error.
 */
export async function loadImages(
  names: readonly string[],
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const found: { name: string; bytes: Uint8Array }[] = []
  for (const name of names) {
    const bytes = await getImage(name)
    if (bytes) found.push({ name, bytes: new Uint8Array(bytes) })
  }
  return found
}

/** Drop anything the document no longer refers to, so the store cannot grow forever. */
export async function pruneImages(keep: readonly string[]): Promise<void> {
  const names = await listImageNames()
  const wanted = new Set(keep)
  for (const name of names) if (!wanted.has(name)) await deleteImage(name)
}
