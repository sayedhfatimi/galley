import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../parse'
import { bodyTree } from '../split'
import { mdastToPm } from './mdast-to-pm'
import { serializeToMarkdown } from './serialize'

/**
 * What galley does to an author's own file.
 *
 * `roundtrip.test.ts` asks whether a trip through ProseMirror changes the
 * LaTeX. That is the right question for a document galley owns. It is the
 * WRONG question for a folder project, where the editor writes straight back
 * over a file in someone's Obsidian vault: two forms can produce identical
 * LaTeX while one of them has quietly rewritten the author's manuscript.
 * "preserves a reference-style link" in that file passes for exactly that
 * reason, and the rewrite it misses is pinned below.
 *
 * So this file asks a different question, in bytes: given a source, what comes
 * back out? Every construct is pinned to its EXACT current output, so that a
 * fix reads as a deliberate edit to a pinned string and a regression reads as a
 * failure. Nothing here is aspirational — the groups named "not yet faithful"
 * record damage that is real today.
 *
 * Measured 2026-09-16 against `main` at `de80384`.
 */

const roundTrip = (source: string): string =>
  serializeToMarkdown(mdastToPm(bodyTree(parseMarkdown(source))))

/**
 * Faithful already. These are the regression guard: whatever is done to fix
 * the groups below must not cost any of these.
 */
describe('survives byte for byte', () => {
  it.each([
    ['a lone image', '![](fig.png)\n'],
    ['an image with a title', '![a](f.png "T")\n'],
    ['an inline link', 'A [real](https://x.com) link\n'],
    ['an autolink', 'See <https://example.com> ok\n'],
    ['a footnote', 'Text[^1] more\n\n[^1]: The note.\n'],
    ['a task item that merely looks bracketed', '- [x] not really\n'],
    ['a block reference', 'A paragraph ^block-id\n'],
    ['a tag away from the line start', 'text #tag and more\n'],
    ['a table', '| a | b |\n| - | - |\n| 1 | 2 |\n'],
    ['a fenced block holding brackets', '```\n[[not a link]]\n```\n'],
    ['inline code holding brackets', 'Text `[[not a link]]` more\n'],
    ['an intraword underscore', 'Cost 100% of a\\_b\n'],
  ])('keeps %s', (_name, source) => {
    expect(roundTrip(source)).toBe(source)
  })
})

/**
 * NOT YET FAITHFUL — content destroyed.
 *
 * Every row here loses something the author wrote. None of it was tracked
 * before 2026-09-16. `![](…)` inline and raw HTML are dropped because the PM
 * schema has no inline image and no html node at all; a link definition is
 * dropped because `blockToPm` has no `definition` case.
 */
describe('destroys content (pinned until fixed)', () => {
  it.each([
    ['an inline image', 'Text ![](fig.png) more\n', 'Text  more\n'],
    ['an inline image with alt text', 'Text ![alt](fig.png) more\n', 'Text  more\n'],
    ['a block of raw HTML', '<div class="x">hi</div>\n', '\n'],
    ['inline raw HTML', 'Text <u>x</u> more\n', 'Text x more\n'],
    ['a line-break tag', 'Text <br> more\n', 'Text  more\n'],
    ['a bare link definition', '[ref]: https://example.com\n', '\n'],
    [
      'a reference link, whose definition is deleted',
      'A [reference][ref].\n\n[ref]: https://example.com/t\n',
      'A [reference](https://example.com/t).\n',
    ],
    [
      'a shortcut reference, whose definition is deleted',
      'A [ref] here.\n\n[ref]: https://example.com/t\n',
      'A [ref](https://example.com/t) here.\n',
    ],
  ])('loses %s', (_name, source, current) => {
    expect(roundTrip(source)).toBe(current)
  })
})

/**
 * NOT YET FAITHFUL — Obsidian syntax broken by the bracket escape.
 *
 * `remark-stringify` escapes `[` anywhere in phrasing and `#` at a line start.
 * Nothing is lost, but the file stops meaning what it meant: `\[!note]` is no
 * longer a callout and `\#tag` is no longer a tag. The bracket entry in
 * `issues/open.md` named only the wikilink case; these are the same defect.
 */
describe('breaks Obsidian syntax by escaping (pinned until fixed)', () => {
  it.each([
    ['a wikilink', '[[some note]]\n', '\\[\\[some note]]\n'],
    ['an aliased wikilink', '[[some note|the alias]]\n', '\\[\\[some note|the alias]]\n'],
    ['an embed', '![[diagram.png]]\n', '!\\[\\[diagram.png]]\n'],
    ['a sized embed', '![[diagram.png|400]]\n', '!\\[\\[diagram.png|400]]\n'],
    [
      'an inline embed',
      'Text ![[diagram.png]] more\n',
      'Text !\\[\\[diagram.png]] more\n',
    ],
    ['a note transclusion', '![[Appendix A]]\n', '!\\[\\[Appendix A]]\n'],
    ['a callout', '> [!note] Title\n> body\n', '> \\[!note] Title\n> body\n'],
    [
      'a collapsed callout',
      '> [!warning]- Collapsed\n> body\n',
      '> \\[!warning]- Collapsed\n> body\n',
    ],
    ['a tag at the line start', '#tag and more\n', '\\#tag and more\n'],
    ['a highlight', '==highlight==\n', '\\==highlight==\n'],
    ['prose brackets', 'Brackets [not a link] here\n', 'Brackets \\[not a link] here\n'],
  ])('breaks %s', (_name, source, current) => {
    expect(roundTrip(source)).toBe(current)
  })
})

/**
 * ACCEPTED — cosmetic normalisation.
 *
 * These change the bytes without changing what the file means in any renderer.
 * They are the reason a folder project opens in SOURCE mode, where no round
 * trip happens at all, and the reason switching to the rich editor warns first.
 * Pinned so the warning's list stays true, not because they are defects.
 */
describe('normalises formatting (accepted, and what rich mode warns about)', () => {
  it.each([
    ['a setext heading', 'Title\n=====\n', '# Title\n'],
    ['a two-space hard break', 'one  \ntwo\n', 'one\\\ntwo\n'],
    ['underscore emphasis', '_emphasis_\n', '*emphasis*\n'],
    ['star bullets', '* one\n* two\n', '- one\n- two\n'],
    ['a loose list', '- one\n\n- two\n', '- one\n- two\n'],
  ])('rewrites %s', (_name, source, current) => {
    expect(roundTrip(source)).toBe(current)
  })
})
