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
import { type Diagnostic, DiagnosticCollector } from '../diagnostics'
import { parseMarkdown } from '../markdown/parse'

export interface DefinitionSource {
  /** Project-relative, forward-slashed. Used only to name a file in a diagnostic. */
  path: string
  source: string
}

export interface SharedDefinitions {
  /** The injected block, or `''` when there is nothing to inject. */
  block: string
  diagnostics: Diagnostic[]
}

export function sharedDefinitions(parts: readonly DefinitionSource[]): SharedDefinitions {
  const lines: string[] = []
  const diagnostics = new DiagnosticCollector()

  /**
   * The first file to define each identifier, and what it pointed at.
   *
   * A book-wide definition block means an identifier is book-wide too, and
   * two chapters that each define `[1]` now silently share one target. That
   * was impossible before folder projects and is ordinary in a book, where
   * every chapter starts its references at 1.
   */
  const firstSeen = new Map<string, { url: string; path: string }>()

  for (const { path, source } of parts) {
    // Per FILE, and this set is the ONLY thing keeping a chapter that repeats
    // its own identifier quiet — that was already legal in a single document
    // and Markdown itself decides it, without galley's help or its opinion. A
    // second `earlier.path !== path` guard was tried below and removed: this
    // set makes it unreachable, and a check nothing can reach reads like a
    // safeguard while being dead code.
    const inThisFile = new Set<string>()

    const visit = (node: Nodes): void => {
      // Link definitions ONLY. A `definition` is a LEAF node; a
      // `footnoteDefinition` is a CONTAINER, and injecting one absorbs any
      // following indented block as its own continuation — measured: a
      // chapter's code block vanished into another chapter's footnote.
      if (node.type === 'definition') {
        const line = render(node)
        if (line !== null) lines.push(line)

        if (!inThisFile.has(node.identifier)) {
          inThisFile.add(node.identifier)
          const earlier = firstSeen.get(node.identifier)
          if (earlier === undefined) {
            firstSeen.set(node.identifier, { url: node.url, path })
          } else if (earlier.url !== node.url) {
            // Only when the TARGETS differ. A book that defines `[isbn]` the
            // same way in every chapter is doing nothing wrong, and saying so
            // twenty-five times would bury the one that matters.
            diagnostics.add(
              'project-definition-duplicate',
              `Two chapters define [${node.identifier}] differently, so both use the last one. Rename one of them.`,
              `${earlier.path} → ${earlier.url}; ${path} → ${node.url}`,
              path,
            )
          }
        }
      }
      if ('children' in node) for (const child of node.children) visit(child as Nodes)
    }
    visit(parseMarkdown(source))
  }

  const joined = lines.join('\n')
  if (joined === '') return { block: '', diagnostics: diagnostics.list() }

  // Backstop for anything that only misbehaves once the lines sit together.
  // Each line already round-tripped alone; if the block as a whole does not
  // parse to definitions and nothing else, none of it is injected.
  const safe = parseMarkdown(joined).children.every(
    (child) => child.type === 'definition',
  )
  return { block: safe ? joined : '', diagnostics: diagnostics.list() }
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
function render(node: Definition): string | null {
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
  const line = `[${node.identifier}]: <${node.url.replace(/[\\<>]/g, '\\$&')}>`

  // CHECKED, NOT ARGUED. Five successive attempts to reason about which inputs
  // are safe to emit were each wrong on an input nobody had thought of — an
  // unterminated fence, a container definition, a blockquote marker carried out
  // of a slice, a decoded label, an identifier ending in a backslash. The space
  // of Markdown is too large for that argument to ever be complete.
  //
  // So the line is re-parsed and kept only if it round-trips to exactly the
  // definition it was built from. An unbounded proof obligation becomes a
  // closed check, and the worst case degrades to one unresolved cross-chapter
  // link — the behaviour before this module existed — rather than a corrupted
  // book.
  const children = parseMarkdown(line).children
  const only = children[0]
  if (children.length !== 1 || only?.type !== 'definition') return null
  if (only.identifier !== node.identifier || only.url !== node.url) return null
  return line
}
