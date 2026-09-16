/**
 * Every link and footnote definition in the book, as source text.
 *
 * A reference resolves only against a definition in the SAME parsed source
 * (measured: `[x][ref]` alone parses to plain text). A book split across files
 * would therefore lose every cross-chapter link and footnote silently, so each
 * part is parsed with the whole book's definitions appended.
 *
 * Boundaries come from the parsed tree's own offsets, never from a pattern —
 * the same rule `splitFromTree` follows, and for the same reason: a regex and
 * the parser will eventually disagree about what a definition is.
 */

import type { Nodes, Root } from 'mdast'
import { parseMarkdown } from '../markdown/parse'

export function sharedDefinitions(sources: readonly string[]): string {
  const blocks: string[] = []

  for (const source of sources) {
    const visit = (node: Nodes): void => {
      if (node.type === 'definition' || node.type === 'footnoteDefinition') {
        const start = node.position?.start.offset
        const end = node.position?.end.offset
        if (start !== undefined && end !== undefined)
          blocks.push(source.slice(start, end))
      }
      if ('children' in node) for (const child of node.children) visit(child as Nodes)
    }
    visit(parseMarkdown(source) as Root)
  }

  return blocks.join('\n\n')
}
