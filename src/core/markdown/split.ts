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

/**
 * A frontmatter block only exists at the very start, and only when the opening
 * fence has a closing one. A document that opens with a thematic break has no
 * closing fence, so it is left alone rather than having half of it swallowed.
 */
const BLOCK = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/

export interface SplitSource {
  /** The text between the fences, without them. Null when there is no block. */
  frontmatter: string | null
  body: string
}

export function splitFrontmatter(source: string): SplitSource {
  const match = BLOCK.exec(source)
  if (!match) return { frontmatter: null, body: source }
  return {
    frontmatter: match[1] ?? '',
    body: source.slice(match[0].length).replace(/^\r?\n/, ''),
  }
}

export function joinFrontmatter(frontmatter: string | null, body: string): string {
  if (frontmatter === null) return body
  return `---\n${frontmatter}\n---\n\n${body}`
}
