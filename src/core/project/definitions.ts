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

import type { Definition, Nodes } from 'mdast'
import { parseMarkdown } from '../markdown/parse'

export function sharedDefinitions(sources: readonly string[]): string {
  const lines: string[] = []

  for (const source of sources) {
    const visit = (node: Nodes): void => {
      // Link definitions ONLY. A `definition` is a LEAF node; a
      // `footnoteDefinition` is a CONTAINER, and injecting one absorbs any
      // following indented block as its own continuation — measured: a
      // chapter's code block vanished into another chapter's footnote.
      if (node.type === 'definition') lines.push(render(node))
      if ('children' in node) for (const child of node.children) visit(child as Nodes)
    }
    visit(parseMarkdown(source))
  }

  return lines.join('\n')
}

/**
 * Rebuild a definition from the NODE, never from its source text.
 *
 * Slicing the source looks equivalent and is not: a definition written inside a
 * container carries that container's markers on its continuation lines, and the
 * slice takes them with it. Measured — `> [ref]: https://e.com` with a `> "A
 * Title"` continuation slices to `[ref]: https://e.com\n> "A Title"`, which
 * re-parses as a definition PLUS a stray blockquote, printing a spurious quote
 * block at the top of every chapter in the book.
 *
 * Synthesising one line per definition makes that structurally impossible:
 * there is no continuation line to carry anything.
 */
function render(node: Definition): string {
  // `identifier`, NEVER `label`. Measured: `[a\]b]: url` parses to
  // identifier 'a\]b' but label 'a]b' — label is the DECODED text, so
  // re-emitting it drops the escape and the line stops being a definition.
  // One such label collapses the whole injected block into a paragraph, which
  // then prints in every chapter AND kills every cross-chapter link in the
  // book. `identifier` is also whitespace-collapsed, which is what makes the
  // "always one line" claim structurally true rather than merely usual.
  //
  // The URL is ESCAPED, not stripped: `<` and `>` are legal in a bare
  // destination, and deleting them silently retargets the link
  // (`https://e.com/q?a=1>b` became `https://e.com/q?a=1b`).
  //
  // No title. `serialize.ts` resolves a reference through `def.url` alone
  // (see its `linkReference` case) and never reads `def.title`, so carrying
  // one buys nothing but an escaping surface and the last multi-line case.
  return `[${node.identifier}]: <${node.url.replace(/[\\<>]/g, '\\$&')}>`
}
