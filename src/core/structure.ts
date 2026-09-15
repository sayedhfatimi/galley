/**
 * The part model: which division of a book a top-level heading belongs to, and
 * how it is numbered and listed. Pure — no DOM, no React.
 *
 * Three independent attributes rather than one enum, because a real book uses
 * all three combinations: a copyright page is unnumbered AND unlisted, a
 * dedication is unnumbered AND listed, a chapter is numbered AND listed. One
 * "front matter" flag cannot express that, and any two of the three silently
 * mis-set one of the real cases.
 *
 * Keyed by heading text, which is what the reader sees in the Configure dialog.
 * The cost is that retitling a heading orphans its entry — closed by the
 * `structure-unmatched` diagnostic rather than left silent, because a control
 * that stops working without saying so is the bug class this codebase has
 * already shipped four times.
 */

import type { Heading, Nodes } from 'mdast'
import { Document, isMap, parseDocument } from 'yaml'
import { splitFrontmatter } from './markdown/split'

export type PartRole = 'front' | 'main' | 'back'

export interface PartSpec {
  role: PartRole
  /** \chapter versus \chapter* */
  numbered: boolean
  /** Whether the part appears in the table of contents. */
  listed: boolean
  /** Contents entry, when it should differ from the heading itself. */
  tocTitle?: string
}

/** What a heading is when the document says nothing about it. */
export const DEFAULT_PART: PartSpec = { role: 'main', numbered: true, listed: true }

const ROLES: readonly PartRole[] = ['front', 'main', 'back']

/**
 * The plain text of a heading, for matching against a `structure:` key and for
 * writing a contents entry. Deliberately NOT the LaTeX form: the reader typed
 * "The Illusion of Truth", not "The Illusion of \textbf{Truth}".
 *
 * KNOWN LIMITATION, not handled here: maths and inline code inside a heading
 * reach the contents entry as their escaped literal source (`$x^2$`, `` `f(x)`
 * ``) rather than something a reader would recognise as the formula or the
 * code. Fixing that needs a design decision — what a formula should even look
 * like in running contents-page text — that has not been made. Left as-is
 * deliberately, so the next reader does not assume it was considered.
 */
export function headingText(node: Heading): string {
  let out = ''
  const visit = (n: Nodes): void => {
    if (n.type === 'text' || n.type === 'inlineCode' || n.type === 'inlineMath') {
      out += n.value
    } else if ('children' in n) {
      for (const child of n.children as Nodes[]) visit(child)
    }
  }
  visit(node)
  return out.trim()
}

/** Apply role defaults to one raw entry. An explicit field always wins. */
function resolvePart(raw: Record<string, unknown>): PartSpec {
  const declared = raw.role
  const role: PartRole =
    typeof declared === 'string' && (ROLES as readonly string[]).includes(declared)
      ? (declared as PartRole)
      : 'main'

  // Front and back matter are unnumbered because that is what the division
  // means; main matter is numbered. Either can be overridden outright.
  const numbered = typeof raw.numbered === 'boolean' ? raw.numbered : role === 'main'
  const listed = typeof raw.listed === 'boolean' ? raw.listed : true

  const title = raw.toc_title
  const tocTitle = typeof title === 'string' && title.trim() ? title.trim() : undefined

  return tocTitle === undefined
    ? { role, numbered, listed }
    : { role, numbered, listed, tocTitle }
}

/**
 * Read the `structure:` block. Returns an empty map for anything unexpected —
 * a missing block, a scalar, a list, or unparseable YAML — because a document
 * with no structure is the overwhelmingly common case and must behave exactly
 * as it did before this existed.
 */
export function readStructure(
  data: Record<string, unknown> | null,
): Map<string, PartSpec> {
  const out = new Map<string, PartSpec>()
  const block = data?.structure
  if (typeof block !== 'object' || block === null || Array.isArray(block)) return out

  for (const [heading, value] of Object.entries(block as Record<string, unknown>)) {
    const key = heading.trim()
    if (!key) continue
    const raw =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
    out.set(key, resolvePart(raw))
  }
  return out
}

/**
 * Matter divisions in print order, so a part written out of sequence can be
 * detected. galley emits parts in DOCUMENT order regardless — silently
 * reordering somebody's manuscript is not a formatting decision — so this
 * exists to raise a diagnostic, not to sort.
 */
export function roleRank(role: PartRole): number {
  return ROLES.indexOf(role)
}

/**
 * Parse a frontmatter block into a document `writeStructure` can safely
 * `set`/`delete` on, or `null` when it cannot.
 *
 * Shared by `writeStructure` and `canWriteStructure` so the two can never
 * describe different sets of documents. That drift already happened once:
 * the UI grew its own "is this readable" check alongside this guard, the two
 * were written independently, and they disagreed on empty/whitespace/
 * comment-only frontmatter — `yaml.parse` calls it unreadable (returns
 * `null`), this guard calls it writable (`contents === null`, which `yaml`
 * upgrades to a map on the first `set`). Routing both callers through this
 * one function makes that kind of drift impossible rather than merely
 * unlikely: there is only one place the "can this be rewritten" question is
 * answered.
 *
 * `parseDocument` does not throw, but it *collects* errors, and
 * `Document.toString()` refuses ("Document with errors cannot be
 * stringified") once any are present; `set`/`delete` likewise assert the
 * contents are a keyable collection and throw otherwise (a sequence
 * document, a scalar document). The try/catch is a backstop, not the primary
 * defence: the checks below are what make this correct; the catch is
 * insurance against a `yaml` edge case neither of them anticipated. This
 * function is therefore TOTAL: it must never throw.
 */
function parseWritableFrontmatter(frontmatter: string | null) {
  try {
    const doc = frontmatter === null ? new Document({}) : parseDocument(frontmatter)

    // A document that already failed to parse cleanly (duplicate keys, tab
    // indentation, an unclosed flow collection, …) cannot be safely rewritten:
    // `toString()` would throw on it regardless of what we do to `structure`.
    // Existing content the writer already had takes priority over this
    // feature working, so it is left untouched.
    if (doc.errors.length > 0) return null

    // `set`/`delete` require the document's contents to be a mapping (or
    // empty — `contents === null`, which `yaml` happily upgrades to a map on
    // the first `set`). A sequence or scalar document (`- one\n- two`, `just
    // text`) is valid YAML but not one this feature can add a `structure:`
    // key to.
    if (doc.contents !== null && !isMap(doc.contents)) return null

    return doc
  } catch {
    return null
  }
}

/**
 * Whether `writeStructure` will actually rewrite this document's frontmatter,
 * as opposed to handing the source back unchanged.
 *
 * Exists so the UI can explain a no-op before the writer hits it, rather than
 * showing controls that silently do nothing. It has to run on every keystroke
 * of the surrounding document (`ConfigPanel`'s Structure section recomputes
 * it from `source`), so it stays cheap: parse the frontmatter block once,
 * same as `writeStructure` itself, via the shared guard above rather than a
 * second parse of `frontmatterData`'s making — the whole point is that this
 * and `writeStructure` see this document the same way.
 */
export function canWriteStructure(source: string): boolean {
  const { frontmatter } = splitFrontmatter(source)
  return parseWritableFrontmatter(frontmatter) !== null
}

/**
 * Write a structure block back into a document's own frontmatter.
 *
 * The boundary comes from `splitFrontmatter`, which derives it from the real
 * parse — NOT from a fence pattern of this module's own. A second pattern is
 * how the editor and the converter come to disagree about where a document
 * starts, and a `---` line inside a YAML block scalar is enough to cause it.
 *
 * Uses `parseDocument` rather than `parse`, so a reader's comments, key order
 * and quoting style survive being written through. Only fields that differ from
 * the role default are emitted, because a block full of redundant `numbered:
 * true` lines is one nobody will read.
 *
 * This function is TOTAL: it must never throw, because it runs from a Select's
 * `onValueChange` and there is no React error boundary anywhere in this app —
 * an uncaught throw here unmounts the whole root to a white page. Whether the
 * frontmatter can be rewritten at all is decided by `parseWritableFrontmatter`
 * (see there for why that check is shared with `canWriteStructure` rather than
 * repeated here); building and applying the `structure:` block itself is
 * still wrapped in its own try/catch as a second backstop, per that function's
 * docstring.
 */
export function writeStructure(source: string, structure: Map<string, PartSpec>): string {
  const { frontmatter, body } = splitFrontmatter(source)
  if (frontmatter === null && structure.size === 0) return source

  const doc = parseWritableFrontmatter(frontmatter)
  if (doc === null) return source

  try {
    const block: Record<string, Record<string, unknown>> = {}
    for (const [heading, part] of structure) {
      const entry: Record<string, unknown> = { role: part.role }
      if (part.numbered !== (part.role === 'main')) entry.numbered = part.numbered
      if (!part.listed) entry.listed = false
      if (part.tocTitle) entry.toc_title = part.tocTitle
      block[heading] = entry
    }

    if (structure.size === 0) doc.delete('structure')
    else doc.set('structure', block)

    const yaml = doc.toString().trimEnd()

    // An emptied block can leave nothing behind; a bare fence pair is noise.
    // `parseDocument('').toString()` is '{}', so both forms have to be caught.
    if (yaml === '' || yaml === '{}') return body
    return `---\n${yaml}\n---\n\n${body}`
  } catch {
    // Backstop only — see `parseWritableFrontmatter`'s docstring. Any future
    // `yaml` edge case the checks there did not anticipate falls back to the
    // one answer that is always safe: the writer's manuscript, unchanged.
    return source
  }
}
