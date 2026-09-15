/**
 * Whether a file is part of the book, and how it is set.
 *
 * Membership is the presence of a `galley:` key — nothing about where the file
 * lives. A file without one is a note: still listed, still editable, simply not
 * typeset. That makes membership a property the author can see and change in
 * one control, rather than a rule about folder layout, and means no layout is
 * forbidden.
 *
 * Defaults come from `resolvePart`, the same function `readStructure` uses, so
 * the per-file and per-heading forms can never disagree about what
 * `{ role: front }` means.
 */

import { splitFrontmatter } from '../markdown/split'
import {
  type PartSpec,
  parseWritableFrontmatter,
  partSpecFields,
  resolvePart,
  writeFrontmatterKey,
} from '../structure'

/** The key whose presence puts a file in the book. */
const KEY = 'galley'

export function isPart(data: Record<string, unknown> | null): boolean {
  return data !== null && Object.hasOwn(data, KEY)
}

export interface PartSpecResult {
  spec: PartSpec
  /**
   * The key was present but its value was not a mapping. Reported as a
   * diagnostic; the file stays IN the book, because demoting it would
   * silently shorten someone's manuscript on a typo.
   */
  malformed: boolean
}

export function readPartSpec(data: Record<string, unknown> | null): PartSpecResult {
  if (!isPart(data)) return { spec: resolvePart({}), malformed: false }

  const value = (data as Record<string, unknown>)[KEY]
  const usable = typeof value === 'object' && value !== null && !Array.isArray(value)
  return {
    spec: resolvePart(usable ? (value as Record<string, unknown>) : {}),
    malformed: !usable,
  }
}

/**
 * Whether `writePartSpec` will actually rewrite this file's frontmatter.
 *
 * Delegates to the same guard the writer uses rather than deciding a second
 * time — the UI needs to explain a no-op before the author hits it, and a
 * second predicate is exactly what drifted in v2.1.0.
 */
export function canWritePartSpec(source: string): boolean {
  return parseWritableFrontmatter(splitFrontmatter(source).frontmatter) !== null
}

/**
 * Put a file in the book, or with `null` take it out — making it a note.
 *
 * All the care lives in `writeFrontmatterKey` and `partSpecFields`; this is
 * only the statement that a part's settings are written under `galley:`.
 */
export function writePartSpec(source: string, spec: PartSpec | null): string {
  return writeFrontmatterKey(source, KEY, spec === null ? null : partSpecFields(spec))
}
