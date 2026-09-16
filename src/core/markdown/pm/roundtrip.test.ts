import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { presetFor } from '../../config'
import { serializeToLatex } from '../../latex/serialize'
import { parseMarkdown } from '../parse'
import { bodyTree } from '../split'
import { mdastToPm } from './mdast-to-pm'
import { pmToMdast } from './pm-to-mdast'
import { serializeToMarkdown } from './serialize'

/**
 * The guard for the TipTap editor.
 *
 * Once a rich editor is the writing surface, every document takes a longer
 * route: Markdown → mdast → ProseMirror → (editing) → mdast → LaTeX. Any
 * construct galley supports that the ProseMirror schema cannot represent is
 * dropped in the middle, silently, and the first place a writer would notice is
 * the PDF — the worst possible place to discover it.
 *
 * So the contract is simply: a trip through ProseMirror must not change the
 * LaTeX. These tests exist to fail loudly when it does.
 */

const config = presetFor('book')

/** LaTeX from the direct path galley uses today. */
function direct(markdown: string): string {
  return serializeToLatex(parseMarkdown(markdown), config).body
}

/** LaTeX after a round trip through the ProseMirror document model. */
function viaProseMirror(markdown: string): string {
  const tree = parseMarkdown(markdown)
  return serializeToLatex(pmToMdast(mdastToPm(tree)), config).body
}

function expectLossless(markdown: string) {
  expect(viaProseMirror(markdown)).toBe(direct(markdown))
}

describe('ProseMirror round trip preserves galley constructs', () => {
  it.each([
    ['a heading', '# Chapter One'],
    ['nested headings', '# One\n\n## Two\n\n### Three'],
    ['a paragraph', 'Plain body text.'],
    ['emphasis and strong', 'Some *emphasis* and **strong** together.'],
    ['strikethrough', 'A ~~struck~~ phrase.'],
    ['inline code', 'Some `inline_code(a, b)` here.'],
    ['an unordered list', '- one\n- two'],
    ['an ordered list', '1. one\n2. two'],
    ['a nested list', '- outer\n  - inner'],
    ['a task list', '- [x] done\n- [ ] todo'],
    ['a block quote', '> quoted text'],
    ['a fenced code block', '```python\ndef f():\n    return 1\n```'],
    ['a thematic break', 'before\n\n---\n\nafter'],
    ['a table with alignment', '| A | B |\n| :-- | --: |\n| 1 | 2 |'],
    ['inline maths', 'Inline $\\alpha^2 + \\beta_i$ here.'],
    ['display maths', '$$\n\\int_0^\\infty e^{-x^2}\\,dx\n$$'],
    ['an inline link', 'A [link with text](https://example.com/a) here.'],
    ['a hard break', 'first line  \nsecond line'],
    ['escaped specials', 'Costs 100% of a_b & c #d.'],
    ['accented characters', 'Chloë Ångström, José.'],
  ])('preserves %s', (_name, markdown) => {
    expectLossless(markdown)
  })

  // The two the fidelity audit found missing upstream. A manuscript tool that
  // eats footnotes is broken, so these are not optional.
  it('preserves a footnote', () => {
    expectLossless('Some text.[^note]\n\n[^note]: The note itself.')
  })

  it('preserves a reference-style link', () => {
    expectLossless('A [reference link][ref].\n\n[ref]: https://example.com/target')
  })

  // The real thing, end to end: everything galley claims to support, at once.
  it('preserves the whole fixture manuscript', () => {
    const fixture = readFileSync(
      join(import.meta.dirname, '../../__fixtures__/manuscript.md'),
      'utf8',
    )
    expectLossless(fixture)
  })
})

/**
 * Regression guard for `MarkdownEditor.tsx`'s re-hydrate effect (Important 1
 * of the Structure-section re-review).
 *
 * The editor must not run `setContent` on its own edits — that would throw
 * the writer's caret to the start of the document on every keystroke — so a
 * re-hydrate effect skips it when the incoming body already matches what the
 * editor was last synchronised to. An earlier version of that guard compared
 * the incoming body against the editor's CURRENT content, RE-SERIALISED,
 * rather than against a ref recording the last body it was actually set
 * to. That only equals the incoming source when the source is already
 * written in the serialiser's own canonical spelling — ATX headings, `*`
 * emphasis, `-` bullets — which a hand-written or Obsidian-exported
 * manuscript routinely is not. This test proves the re-serialised form does
 * NOT converge to the source for exactly that kind of input, which is why
 * that guard could never work and a synchronised-body ref is required
 * instead.
 */
it('does not re-serialise non-canonical Markdown back to its own source', () => {
  const source =
    'Chapter One\n===========\n\nSome text with _emphasis_ and a list:\n\n* one\n* two\n'
  const reserialized = serializeToMarkdown(mdastToPm(bodyTree(parseMarkdown(source))))
  expect(reserialized).not.toBe(source)
})

/**
 * The editor must not rewrite the author's own files.
 *
 * A folder project opens Markdown that lives in the writer's vault, so
 * `MarkdownEditor.tsx`'s route — parse, `mdastToPm`, edit, `serializeToMarkdown`
 * — writes straight back over their file. Obsidian's `![[…]]` embed is not part
 * of CommonMark, so nothing downstream can put it back once it is gone: opening
 * a chapter and typing one character has to leave it as written.
 *
 * Measured with the embed transform running inside `parseMarkdown`, which is
 * what this pins against:
 *
 *     "Text ![[diagram.png]] more\n" -> "Text  more\n"        <- DELETED
 *     "![[diagram.png]]\n"           -> "![](diagram.png)\n"
 *     "![[diagram.png|400]]\n"       -> "![400](diagram.png)\n"
 *     "![[Appendix A]]\n"            -> "![](<Appendix A>)\n"
 *
 * The inline case lost the embed outright, because `mdastToPm` returns null for
 * an `image` inside a paragraph. The transform therefore belongs to the
 * conversion path (`latex/document.ts`) and never to the parse that every
 * keystroke runs.
 *
 * ## The bracket escapes are gone too
 *
 * `remark-stringify` escapes an opening bracket anywhere in prose, so this
 * round trip used to return `!\[\[diagram.png]]` rather than
 * `![[diagram.png]]` — a separate defect, on the editor's serialiser, which
 * `pm/serialize.ts` now closes by checking its emitted text rather than
 * reasoning about it. So these assert byte identity outright. The wider
 * corpus, including the Obsidian callouts and tags the same escape broke,
 * lives in `vault-fidelity.test.ts`.
 */
describe('the editor carries Obsidian embeds through unrewritten', () => {
  const roundTrip = (source: string): string =>
    serializeToMarkdown(mdastToPm(bodyTree(parseMarkdown(source))))

  it.each([
    ['an inline embed', 'Text ![[diagram.png]] more\n'],
    ['an embed alone in a paragraph', '![[diagram.png]]\n'],
    ['a sized embed', '![[diagram.png|400]]\n'],
    ['a note transclusion', '![[Appendix A]]\n'],
  ])('keeps %s', (_name, source) => {
    // Character for character. Nothing deleted, nothing rewritten into
    // another syntax, and no escape the author did not write.
    expect(roundTrip(source)).toBe(source)
  })
})
