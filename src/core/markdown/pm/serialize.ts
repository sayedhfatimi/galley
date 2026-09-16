import type { Root, RootContent } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { parseMarkdown } from '../parse'
import { pmToMdast } from './pm-to-mdast'
import type { PMDoc } from './types'

/**
 * ProseMirror JSON → Markdown. Pure — no DOM, no React.
 *
 * Markdown stays galley's single source of truth: the store holds it, the
 * converter reads it, the source view shows it, and it is what persists. The
 * rich editor is a *view* over that string rather than a parallel model, which
 * keeps one representation authoritative instead of two that can drift.
 *
 * The options below are chosen for stability rather than taste — a round trip
 * should not reflow a document a writer has already formatted.
 */
const processor = unified()
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '*',
    strong: '*',
    fence: '`',
    fences: true,
    listItemIndent: 'one',
    rule: '-',
    ruleSpaces: false,
    tightDefinitions: true,
  })
  .use(remarkGfm)
  .use(remarkMath)

/**
 * The escapes that change what a vault renders, and the narrower bracket-only
 * set used as a fallback.
 *
 * `remark-stringify` escapes a character wherever it *could* begin a
 * construct, not where it does. That is the right default for a string galley
 * owns and the wrong one for a file in someone's Obsidian vault, where `\[`
 * stops a callout being a callout, `\#` stops a tag being a tag and
 * `\==` stops a highlight highlighting.
 */
const VAULT_SYNTAX_ESCAPE = /\\([[\]#=])/g
const BRACKET_ESCAPE = /\\([[\]])/g

/** Is any escape in this text one that could be changing what a vault renders? */
const WORTH_CHECKING = /\\[[\]#=]/

/**
 * Candidates to try, most faithful first. The first frees everything that
 * changes what a vault renders; the second gives back `#` and `=` for the
 * documents where one of those was itself doing the work — a paragraph that
 * genuinely begins `# ` keeps that escape and still gets its brackets.
 *
 * A greedy rung freeing EVERY escaped punctuation character was tried and
 * removed. It was more faithful — it returned `a_b` rather than `a\_b` — but
 * it made the check run on essentially every document rather than only those
 * with vault syntax in them, and measured 9x to 18x slower on a debounced
 * keystroke for an escape that no renderer treats differently. Byte churn of
 * that kind belongs with the other accepted normalisation, not in the hot
 * path.
 */
const CANDIDATES = [VAULT_SYNTAX_ESCAPE, BRACKET_ESCAPE]

/**
 * The same tree, ignoring where each node sat in its source.
 *
 * `position` is the one field that MUST differ — the two strings have
 * different lengths by construction — so skipping it is what makes this a
 * comparison of meaning rather than of bytes. Hand-rolled rather than
 * `JSON.stringify` with a replacer: that builds two full strings of a
 * book-sized tree before comparing a single character, and this returns at
 * the first difference.
 */
function sameTree(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => sameTree(item, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left).filter((key) => key !== 'position')
  const otherKeys = Object.keys(right).filter((key) => key !== 'position')
  if (keys.length !== otherKeys.length) return false
  return keys.every((key) => key in right && sameTree(left[key], right[key]))
}

/**
 * Markdown for this document, carrying no escape it does not need.
 *
 * ## Why the emitted text is checked rather than reasoned about
 *
 * The obvious fix is a rule for when `[` is safe to leave alone. Every attempt
 * at one is wrong on an input nobody thought of, because Markdown constructs
 * interact with their neighbours: `[` + *italic* + `](url)` is a link only in
 * composition, and no per-character rule can see that. That lesson cost six
 * review rounds and five Criticals on `project/definitions.ts`, and
 * `decisions/check-emitted-markdown-do-not-argue-it.md` records it.
 *
 * So nothing is argued. `escaped` is what `remark-stringify` produces and is
 * correct by construction. A candidate is emitted ONLY if it parses to the
 * identical tree — otherwise the escaped form stands, and the worst case is
 * exactly today's output rather than a corrupted file.
 *
 * The candidates are tried most faithful first, so one load-bearing escape
 * costs a document only as much fidelity as it has to: a paragraph opening
 * with a literal `- ` keeps that one escape and still gets its brackets back.
 *
 * The comparison is against `escaped`, NOT against the incoming `PMDoc`.
 * `doc` arrives from `editor.getJSON()`, whose shape is TipTap's — default
 * attributes present, key order its own — so comparing a freshly converted
 * tree against it would differ for reasons that have nothing to do with
 * escaping, and the check would refuse every candidate in the real editor
 * while passing in tests. An inert control is a bug this project has fixed
 * twice; it is not being introduced here.
 */
export function serializeToMarkdown(doc: PMDoc): string {
  const tree = pmToMdast(doc) as Root
  const escaped = `${processor.stringify(tree).trimEnd()}\n`

  // The overwhelmingly common case: prose with no vault syntax in it, where
  // the answer cannot change. Worth testing for, because the alternative is
  // parsing the document again on every debounced keystroke to learn nothing.
  if (!WORTH_CHECKING.test(escaped)) return escaped

  let reference: Root
  try {
    reference = parseMarkdown(escaped)
  } catch {
    // `src/core` never throws, and the escaped form is always safe to emit.
    return escaped
  }

  // Block by block, because a document is not all-or-nothing.
  //
  // Checking the whole string at once means one awkward escape anywhere costs
  // every other paragraph its fix, and it re-parses the entire manuscript per
  // candidate. Per block, only the blocks that actually contain vault syntax
  // are parsed, and each is a few lines long.
  //
  // Measured 2026-09-16, milliseconds per serialise, against the bare
  // stringify this replaced:
  //
  //             3k words   10k words   90k words
  //   before        14         27         186
  //   whole-string 106        257        2329
  //   per block     61        152        1357
  //
  // This runs on a 300 ms debounce after typing stops, so a chapter costs
  // well under one frame of delay and a whole book pasted into single-document
  // mode costs about a second — the latter already cost 186 ms before this
  // change, and a folder project opens in source mode, which does not round
  // trip at all. A document whose every paragraph carries vault syntax is the
  // worst case at roughly 410 ms for 10k words.
  //
  // This is sound for THIS escape set and would not be for a wider one: `[`,
  // `]`, `#` and `=` can each only begin a construct that a blank line
  // terminates, and `processor.stringify` separates top-level blocks with a
  // blank line. So a block freed here cannot reach across into its neighbour.
  // `parsesAsOneBlock` below re-checks that claim per block rather than
  // trusting it.
  let out = ''
  let cursor = 0
  let changed = false

  for (const child of reference.children) {
    const start = child.position?.start.offset
    const end = child.position?.end.offset
    if (start === undefined || end === undefined) continue

    const block = escaped.slice(start, end)
    if (!WORTH_CHECKING.test(block)) continue

    for (const pattern of CANDIDATES) {
      const candidate = block.replace(pattern, '$1')
      if (candidate === block) continue
      if (!parsesAsOneBlock(candidate, child)) continue
      out += escaped.slice(cursor, start) + candidate
      cursor = end
      changed = true
      break
    }
  }

  return changed ? out + escaped.slice(cursor) : escaped
}

/**
 * Does this text still parse to exactly the block it came from?
 *
 * One node, of the same shape, and nothing beside it.
 *
 * The length check is deliberately belt-and-braces and no test can currently
 * fail without it: for THIS escape set, a candidate that split into two blocks
 * would leave `children[0]` a strict prefix of the original, which `sameTree`
 * already rejects. It stays because it states the invariant the splice below
 * depends on — one block in, one block out — rather than leaving it a
 * consequence of another function's behaviour. Widening `CANDIDATES` is
 * exactly when that stops being incidental, and this is what would hold.
 */
function parsesAsOneBlock(candidate: string, original: RootContent): boolean {
  try {
    const parsed = parseMarkdown(candidate)
    return parsed.children.length === 1 && sameTree(parsed.children[0], original)
  } catch {
    return false
  }
}
