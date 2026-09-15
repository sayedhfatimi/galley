/**
 * Separating a document's frontmatter from its body. Pure — no DOM, no React.
 *
 * The rich editor has no node type for frontmatter, so anything it is handed
 * comes back without it. Rather than model YAML as an editable node — which
 * puts raw metadata in a writing surface and lets a reader delete it with a
 * keystroke — the editor is handed the body alone and the block is reattached
 * on the way out.
 *
 * Source view is unaffected: it shows the document, and the document includes
 * its frontmatter.
 */

import type { Root } from 'mdast'
import { parseMarkdown } from './parse'

export interface SplitSource {
  /** The text between the fences, without them. Null when there is no block. */
  frontmatter: string | null
  body: string
}

/**
 * Where the frontmatter ends is decided by the SAME parser that converts the
 * document, never by a second pattern of our own.
 *
 * A regex here looks obviously correct and is not. `remark-frontmatter` knows
 * that a `---` line inside a YAML block scalar does not close the block; a
 * regex does not, and truncates:
 *
 *     abstract: |
 *       one
 *       ---          <- a regex closes the block here
 *       two
 *     title: Kept    <- and the editor then shows this as BODY TEXT,
 *                       which the next keystroke serialises away
 *
 * Deriving the boundary from the parsed tree cannot disagree with the
 * converter, because it IS the converter's own parse.
 */
export function splitFrontmatter(source: string): SplitSource {
  return splitFromTree(source, parseMarkdown(source))
}

/**
 * For callers that have already parsed, so a document is not parsed twice.
 *
 * `tree` must be `parseMarkdown(source)` — the SAME parse of the SAME string —
 * because `position.end.offset` is an index into that exact string. Hand it a
 * tree parsed from a different source (a stale tree, a differently-normalised
 * copy) and the offset still looks valid, so the split still succeeds; it
 * just slices the wrong string, silently.
 */
export function splitFromTree(source: string, tree: Root): SplitSource {
  const head = tree.children[0]
  if (head?.type !== 'yaml') return { frontmatter: null, body: source }

  const end = head.position?.end?.offset
  if (end === undefined) return { frontmatter: null, body: source }

  // The blank line after the closing fence is separator, not content, and
  // `joinFrontmatter` puts it back. `(?:\r?\n)+` rather than `\r?\n+` so a CRLF
  // document does not keep a stray `\r\n`.
  return { frontmatter: head.value, body: source.slice(end).replace(/^(?:\r?\n)+/, '') }
}

/**
 * The parsed tree, minus a leading frontmatter block, for a caller that wants
 * the editor's ProseMirror document without re-parsing the body string it
 * already extracted. There is no `yaml` node type in the rich editor, so this
 * is what `splitFromTree` hands the tree side of, the way `.body` is the
 * string side.
 */
export function bodyTree(tree: Root): Root {
  const head = tree.children[0]
  if (head?.type !== 'yaml') return tree
  return { ...tree, children: tree.children.slice(1) }
}

export function joinFrontmatter(frontmatter: string | null, body: string): string {
  if (frontmatter === null) return body
  return `---\n${frontmatter}\n---\n\n${body}`
}
