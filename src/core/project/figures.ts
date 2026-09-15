/**
 * Which file a figure reference means, and what that file is called inside the
 * engine.
 *
 * `images.ts` states the governing rule: the name is sanitised ONCE and that is
 * the name everywhere. A folder project does not break that rule, it feeds it a
 * different input. galley owns image names when the reader drops a file in; in
 * a project the names arrive from the author's vault and galley must not rewrite
 * their files to suit itself, so two chapters may each hold a `diagram.png`.
 * Identity therefore becomes the file's PATH, and this module is the one place
 * a path becomes a name.
 */

import { sanitizeImageName } from '../images'
import type { FigureResolver } from './types'

/**
 * FNV-1a, 32 bits. Not security — this only has to separate two paths in one
 * book, and it must be pure (no `node:crypto`, which core cannot import).
 */
function fingerprint(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * The engine-side name for a figure at this project-relative path.
 *
 * **The fingerprint is what makes the name unique**, and it is appended AFTER
 * sanitising because the sanitiser truncates the stem to 64 characters — two
 * deep paths can share their first 64, which is the collision path identity
 * exists to remove.
 *
 * **The flatten is what makes the name legible**, and that is its whole job.
 * `sanitizeImageName` keeps only the last path segment, so without flattening
 * first, every `diagram.png` in the book becomes `diagram-<hash>.png` — still
 * unique, but anonymous. Measured. That matters because galley hands the reader
 * the generated `.tex`: a `\includegraphics{chapters-03-illusion-diagram-...}`
 * says where the figure came from, and `diagram-...` does not.
 */
export function figureName(relativePath: string): string {
  const flattened = relativePath.replace(/[\\/]+/g, '-')
  const sanitised = sanitizeImageName(flattened)
  const dot = sanitised.lastIndexOf('.')
  const stem = dot > 0 ? sanitised.slice(0, dot) : sanitised
  const extension = dot > 0 ? sanitised.slice(dot) : ''
  return `${stem}-${fingerprint(relativePath)}${extension}`
}

/** Drop `./` segments, resolve `../`, and strip a leading slash. */
function normalise(path: string): string {
  const out: string[] = []
  for (const segment of path.replace(/^\/+/, '').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return out.join('/')
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

function basenameOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? path : path.slice(slash + 1)
}

/**
 * Resolution order, chosen to match what an author sees in Obsidian without
 * reaching outside the project:
 *
 *   1. relative to the file the reference was written in
 *   2. relative to the project root
 *   3. by name, anywhere in the project — Obsidian's own behaviour
 *
 * Where a name repeats, the shallowest path wins and ties break
 * lexicographically, so the answer never depends on directory-iteration order.
 */
export function buildFigureResolver(figurePaths: readonly string[]): FigureResolver {
  const exact = new Set(figurePaths)
  const byName = new Map<string, string[]>()
  for (const path of figurePaths) {
    const name = basenameOf(path)
    const bucket = byName.get(name)
    if (bucket) bucket.push(path)
    else byName.set(name, [path])
  }
  for (const bucket of byName.values()) {
    bucket.sort((a, b) => {
      const depth = a.split('/').length - b.split('/').length
      return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0
    })
  }

  return (reference, fromPart) => {
    const wanted = normalise(reference)
    if (wanted === '') return null

    const directory = directoryOf(fromPart)
    const relative = directory === '' ? wanted : normalise(`${directory}/${wanted}`)
    if (exact.has(relative)) return relative
    if (exact.has(wanted)) return wanted

    return byName.get(basenameOf(wanted))?.[0] ?? null
  }
}
