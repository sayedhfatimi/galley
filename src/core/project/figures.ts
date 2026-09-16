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

/**
 * Percent-decode one path segment, or leave it exactly as it was.
 *
 * `decodeURIComponent` THROWS on a malformed escape — `%zz`, a lone `%`, a
 * truncated pair — and `src/core` never throws: one hand-typed reference must
 * not take down the conversion of a whole book. An undecodable segment is
 * simply not decoded, which leaves it matching whatever it matched before.
 *
 * Per SEGMENT, never across the whole path. `%2F` is a literal slash inside a
 * filename; decoding the path in one go would promote it to a directory
 * separator and resolve to a file the author never wrote.
 */
function decodeSegment(segment: string): string {
  if (!segment.includes('%')) return segment
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Drop `./` segments, resolve `../`, strip a leading slash, and — when asked —
 * percent-decode each segment.
 *
 * Decoding is what makes `![](figures/my%20file.png)` find `my file.png`, and
 * that is what Obsidian writes into a Markdown-style link when wikilinks are
 * off, so without it a figure that displays perfectly in the author's vault
 * silently failed here.
 *
 * It is optional because a file may legitimately have a `%` in its name. The
 * resolver tries the literal path first and the decoded one second, so
 * `a%2Fb.png` finds a file actually called that if one exists, and otherwise
 * falls through to meaning `a/b.png`.
 */
function normalise(path: string, decode: boolean): string {
  const out: string[] = []
  for (const raw of path.replace(/^\/+/, '').split('/')) {
    const segment = decode ? decodeSegment(raw) : raw
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
  // Keyed by LOWER-CASED name. Obsidian resolves an embed by name without
  // regard to case, so `![[Diagram.png]]` finds `diagram.png` there and used
  // to miss it here. Only this fallback folds case: an exact path below is a
  // real filesystem entry, and folding that would let a reference resolve to a
  // different file on a case-sensitive disk.
  const byName = new Map<string, string[]>()
  for (const path of figurePaths) {
    const name = basenameOf(path).toLowerCase()
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
    const directory = directoryOf(fromPart)

    // The literal reading first, the percent-decoded one second. A file whose
    // name really does contain a `%` therefore wins over the path its escape
    // would spell out, and everything else still decodes.
    const literal = normalise(reference, false)
    const decoded = normalise(reference, true)
    const readings = decoded === literal ? [literal] : [literal, decoded]

    for (const wanted of readings) {
      if (wanted === '') continue
      const relative =
        directory === '' ? wanted : normalise(`${directory}/${wanted}`, false)
      if (exact.has(relative)) return relative
      if (exact.has(wanted)) return wanted
    }

    for (const wanted of readings) {
      if (wanted === '') continue
      const bucket = byName.get(basenameOf(wanted).toLowerCase())
      if (!bucket) continue
      // An exactly-cased name beats a merely case-insensitive one, however
      // deep it sits: `![[Diagram.png]]` meaning the file actually called
      // `Diagram.png` is a better guess than a shallower `diagram.png`.
      const name = basenameOf(wanted)
      return bucket.find((path) => basenameOf(path) === name) ?? bucket[0]
    }

    return null
  }
}
