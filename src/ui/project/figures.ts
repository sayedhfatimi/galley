import type { Diagnostic } from '@/core/diagnostics'
import { figureName } from '@/core/project/figures'

/**
 * The figures a project can draw, and how to get their bytes.
 *
 * ## One place computes the engine name
 *
 * `convertProject` returns flat engine NAMES; reading the bytes needs PATHS.
 * Two call sites computing `figureName` independently is the drift
 * `core/project/figures.ts` exists to prevent, so the map is built once here
 * and the loader asks it rather than recomputing.
 *
 * ## Read from the folder, never cached
 *
 * The bytes stay on disk. Caching them in IndexedDB would create exactly the
 * staleness problem the writer spends its effort preventing — an author
 * replaces a diagram in their vault and galley keeps typesetting the old one
 * — and the folder is the source of truth for everything else in a project.
 */

export interface FigureIndex {
  /** Engine name → project-relative path. */
  byName: Map<string, string>
  /** The names `convertProject` may assume are present. */
  available: Set<string>
  diagnostics: Diagnostic[]
}

export function buildFigureIndex(figurePaths: readonly string[]): FigureIndex {
  const byName = new Map<string, string>()
  const diagnostics: Diagnostic[] = []

  for (const path of figurePaths) {
    const name = figureName(path)
    const existing = byName.get(name)
    if (existing !== undefined && existing !== path) {
      // A 32-bit fingerprint collision between two paths in one book is
      // vanishingly unlikely and is one line to detect. Undetected it is a
      // figure silently replaced by a different figure, which is the kind of
      // wrongness nobody would think to look for.
      diagnostics.push({
        kind: 'project-figure-unresolved',
        message:
          'Two figures in this project produce the same internal name, so one of them cannot be drawn. Renaming either file fixes it.',
        detail: `${existing} and ${path}`,
        file: path,
      })
      continue
    }
    byName.set(name, path)
  }

  return { byName, available: new Set(byName.keys()), diagnostics }
}

/**
 * The bytes for exactly the figures this render draws.
 *
 * A miss is skipped rather than thrown: a file can disappear between opening
 * the project and rendering it, and `convert` has already decided what to do
 * about an absent figure — it leaves a visible gap and says so.
 */
export async function loadProjectFigures(
  names: readonly string[],
  index: FigureIndex,
  handles: Map<string, FileSystemFileHandle>,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const out: { name: string; bytes: Uint8Array }[] = []
  for (const name of names) {
    const path = index.byName.get(name)
    if (!path) continue
    const handle = handles.get(path)
    if (!handle) continue
    try {
      const file = await handle.getFile()
      out.push({ name, bytes: new Uint8Array(await file.arrayBuffer()) })
    } catch {
      // Unreadable now; the conversion already treats it as absent.
    }
  }
  return out
}
