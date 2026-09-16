/**
 * Choosing a project folder, and saying so plainly when the browser cannot.
 *
 * `showDirectoryPicker` is the one File System Access symbol TypeScript's DOM
 * library does not declare — `FileSystemDirectoryHandle`, its async iterators,
 * `queryPermission` and `createWritable` are all there — so this is a single
 * ambient declaration rather than a `@types` dependency.
 *
 * Chromium desktop only, around 30% of browsers. Firefox has formally called
 * the API harmful and will not implement it; Safari has not moved. galley
 * feature-detects and explains rather than offering a control that fails,
 * which is the inert-control shape this project has fixed twice.
 */

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string
      mode?: 'read' | 'readwrite'
      startIn?: string
    }) => Promise<FileSystemDirectoryHandle>
  }
}

export function canOpenFolder(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export type PickResult =
  | { ok: true; handle: FileSystemDirectoryHandle }
  /** The reader closed the picker. Not an error, and must not be reported as one. */
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'unsupported' }
  | { ok: false; reason: 'failed' }

export async function pickProjectFolder(): Promise<PickResult> {
  if (!canOpenFolder()) return { ok: false, reason: 'unsupported' }
  try {
    const handle = await window.showDirectoryPicker?.({
      id: 'galley-project',
      mode: 'readwrite',
    })
    return handle ? { ok: true, handle } : { ok: false, reason: 'cancelled' }
  } catch (error) {
    // Dismissing the picker rejects with AbortError. Telling someone their
    // folder failed to open when they simply changed their mind is noise.
    const name = (error as { name?: string } | null)?.name
    if (name === 'AbortError') return { ok: false, reason: 'cancelled' }
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Whether galley may still read and write this folder.
 *
 * Both calls need a USER GESTURE, so this belongs on a click and never in an
 * effect on mount. That is why a remembered project is an offer to reopen
 * rather than a reopen.
 */
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const withPermission = handle as FileSystemDirectoryHandle & {
    queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  try {
    if ((await withPermission.queryPermission?.({ mode: 'readwrite' })) === 'granted') {
      return true
    }
    return (await withPermission.requestPermission?.({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}
