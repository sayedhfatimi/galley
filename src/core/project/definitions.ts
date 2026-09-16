/**
 * Every link definition in the book, as source text.
 *
 * A reference resolves only against a definition in the SAME parsed source
 * (measured: `[x][ref]` alone parses to plain text). A book split across files
 * would therefore lose every cross-chapter link silently, so each part is
 * parsed with the whole book's definitions appended.
 *
 * Boundaries come from the parsed tree's own offsets, never from a pattern —
 * the same rule `splitFromTree` follows, and for the same reason: a regex and
 * the parser will eventually disagree about what a definition is.
 *
 * KNOWN LIMITATION, deliberate: a footnote whose definition lives in a
 * DIFFERENT chapter still prints as literal text. Footnote definitions are
 * container constructs and cannot be injected safely (see below), and a
 * footnote is in practice always defined in the chapter that uses it — in
 * Obsidian a cross-note footnote never resolved either. It cannot be
 * diagnosed, because an unresolved footnote reference parses as plain text.
 */

import type { Nodes, Root } from 'mdast'
import { parseMarkdown } from '../markdown/parse'

export function sharedDefinitions(sources: readonly string[]): string {
  const blocks: string[] = []

  for (const source of sources) {
    const visit = (node: Nodes): void => {
      // Link definitions ONLY. A `definition` is a LEAF node; a
      // `footnoteDefinition` is a CONTAINER, and injecting one absorbs any
      // following indented block as its own continuation. Measured: with
      // `[^a]: note` injected at the top of a chapter whose body opens with an
      // indented code block, that code block VANISHES from the chapter and is
      // appended into the footnote's text — content silently moved between
      // chapters, needing no malformed input at all. `[ref]: url` followed by
      // the same indented block leaves it intact as a sibling.
      if (node.type === 'definition') {
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
