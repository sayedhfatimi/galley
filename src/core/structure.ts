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
