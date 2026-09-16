/**
 * YAML frontmatter → document metadata. Pure — no DOM, no React.
 *
 * This is the highest-leverage detail in the whole interaction: a file exported
 * from a note-taking application must produce a correctly titled document on the
 * first paste, without the reader touching the configuration panel at all.
 *
 * It is deliberately forgiving. Frontmatter in the wild is full of keys galley
 * does not care about, dates as real YAML dates, authors as lists, and the
 * occasional malformed block. None of that may cause a failure — unknown keys
 * are ignored and unparseable YAML yields no metadata rather than an error.
 */

import type { Root, Yaml } from 'mdast'
import { parse as parseYaml } from 'yaml'
import type { Metadata } from '../config'
import { writeFrontmatterKey } from '../structure'
import { parseMarkdown } from './parse'

/** Keys accepted for each metadata field, in order of preference. */
const FIELD_ALIASES = {
  title: ['title'],
  subtitle: ['subtitle', 'sub_title', 'description'],
  author: ['author', 'authors', 'by'],
  date: ['date', 'created', 'published'],
} as const satisfies Record<keyof Metadata, readonly string[]>

function firstYamlNode(tree: Root): Yaml | undefined {
  // Frontmatter is only frontmatter at the very top of the document.
  const head = tree.children[0]
  return head?.type === 'yaml' ? head : undefined
}

/**
 * Coerce a YAML value to a display string.
 *
 * Lists become a comma-joined string, which is what an `authors: [a, b]` block
 * means to a title page. Dates arrive as Date objects from the YAML parser and
 * are rendered as plain ISO days rather than a full timestamp.
 */
function toDisplayString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) {
    const parts = value.map(toDisplayString).filter((v): v is string => Boolean(v))
    return parts.length > 0 ? parts.join(', ') : undefined
  }
  return undefined
}

/**
 * The document's frontmatter as a plain object, or null when there is none,
 * when it is malformed, or when it is not a mapping.
 *
 * Exported because more than metadata lives in frontmatter now — `structure.ts`
 * reads the part list from the same block, and parsing the YAML twice would let
 * the two disagree about what a malformed block means.
 */
export function frontmatterData(tree: Root): Record<string, unknown> | null {
  const node = firstYamlNode(tree)
  if (!node) return null

  let data: unknown
  try {
    data = parseYaml(node.value)
  } catch {
    // Malformed frontmatter is not a failure — the document still converts.
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

/**
 * Read metadata from a document's frontmatter.
 *
 * Returns an empty object when there is no frontmatter, when it is malformed, or
 * when it holds nothing galley recognises.
 */
export function extractFrontmatter(tree: Root): Metadata {
  const record = frontmatterData(tree)
  if (!record) return {}

  const metadata: Metadata = {}
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const key of aliases) {
      const found = toDisplayString(record[key])
      if (found !== undefined) {
        metadata[field as keyof Metadata] = found
        break
      }
    }
  }
  return metadata
}

/**
 * Does this document carry frontmatter at all? Used by the UI to explain why
 * configuration fields were pre-filled.
 */
export function hasFrontmatter(tree: Root): boolean {
  return firstYamlNode(tree) !== undefined
}

/**
 * Write the book's title, subtitle, author and date back into its frontmatter.
 *
 * The counterpart to `extractFrontmatter`, and it did not exist:
 * `writeBookConfig` writes only the `book:` key, while these four live as
 * ordinary top-level keys. Without this, editing the title in Document setup
 * had nowhere to go in a folder project — the field changed on screen and the
 * file never heard about it.
 *
 * **Written back to the alias the file already uses.** `author`, `authors` and
 * `by` all read as the author, and blindly writing `author:` into a file that
 * says `authors:` leaves a stale key behind that still parses — the reader
 * would then be looking at two different authors, with `extractFrontmatter`
 * silently preferring the one they did not edit.
 *
 * Every write goes through `writeFrontmatterKey`, so other keys, their order
 * and their comments survive, and a file whose frontmatter cannot be parsed is
 * returned unchanged rather than rewritten.
 */
export function writeMetadata(source: string, metadata: Metadata): string {
  let out = source
  const existing = frontmatterData(parseMarkdown(source))

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const value = metadata[field as keyof Metadata]
    // The alias this file already uses, falling back to the canonical name.
    const key = aliases.find((alias) => existing?.[alias] !== undefined) ?? aliases[0]
    // An empty field CLEARS the key rather than writing an empty string: a
    // `title:` with nothing after it is not the same as no title, and the
    // reader who cleared the box meant the second one.
    out = writeFrontmatterKey(out, key, value && value.length > 0 ? value : null)
  }

  return out
}
