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
 * Read metadata from a document's frontmatter.
 *
 * Returns an empty object when there is no frontmatter, when it is malformed, or
 * when it holds nothing galley recognises.
 */
export function extractFrontmatter(tree: Root): Metadata {
  const node = firstYamlNode(tree)
  if (!node) return {}

  let data: unknown
  try {
    data = parseYaml(node.value)
  } catch {
    // Malformed frontmatter is not a failure — the document still converts.
    return {}
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {}

  const record = data as Record<string, unknown>
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
