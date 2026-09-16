import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../parse'
import { bodyTree } from '../split'
import { mdastToPm } from './mdast-to-pm'
import { serializeToMarkdown } from './serialize'

/**
 * What galley does to an author's own file.
 *
 * `roundtrip.test.ts` asks whether a trip through ProseMirror changes the
 * LaTeX. That is the right question for a document galley owns and the WRONG
 * one for a folder project, where the editor writes straight back over a file
 * in someone's Obsidian vault: two forms can produce identical LaTeX while one
 * of them has quietly rewritten the author's manuscript. Its own "preserves a
 * reference-style link" passes for exactly that reason, and the rewrite it
 * misses is pinned below.
 *
 * So this file asks a different question, in bytes: given a source, what comes
 * back out? Every construct is pinned exactly, so a fix reads as a deliberate
 * edit to a pinned string and a regression reads as a failure.
 *
 * Measured 2026-09-16.
 */

const roundTrip = (source: string): string =>
  serializeToMarkdown(mdastToPm(bodyTree(parseMarkdown(source))))

describe('survives byte for byte', () => {
  it.each([
    // Ordinary Markdown.
    ['a lone image', '![](fig.png)\n'],
    ['an image with a title', '![a](f.png "T")\n'],
    ['an inline link', 'A [real](https://x.com) link\n'],
    ['an autolink', 'See <https://example.com> ok\n'],
    ['a footnote', 'Text[^1] more\n\n[^1]: The note.\n'],
    ['a task item that merely looks bracketed', '- [x] not really\n'],
    ['a table', '| a | b |\n| - | - |\n| 1 | 2 |\n'],
    ['a fenced block holding brackets', '```\n[[not a link]]\n```\n'],
    ['inline code holding brackets', 'Text `[[not a link]]` more\n'],
    ['prose brackets', 'Brackets [not a link] here\n'],
    // Obsidian's own syntax. Every one of these was broken before the
    // checked-emission gate in `serialize.ts`, and every one of them is
    // something an author sees rendered in their vault.
    ['a wikilink', '[[some note]]\n'],
    ['an aliased wikilink', '[[some note|the alias]]\n'],
    ['an embed', '![[diagram.png]]\n'],
    ['a sized embed', '![[diagram.png|400]]\n'],
    ['an inline embed', 'Text ![[diagram.png]] more\n'],
    ['a note transclusion', '![[Appendix A]]\n'],
    ['a callout', '> [!note] Title\n> body\n'],
    ['a collapsed callout', '> [!warning]- Collapsed\n> body\n'],
    ['a tag at the line start', '#tag and more\n'],
    ['a tag away from the line start', 'text #tag and more\n'],
    ['a highlight', '==highlight==\n'],
    ['a block reference', 'A paragraph ^block-id\n'],
    // Raw HTML. Carried rather than typeset — `serialize.ts` still emits it as
    // literal text with a `raw-html` diagnostic — but an author's `<br>` is
    // theirs, and deleting it from their file was never a reasonable way to
    // decline to typeset it.
    ['a block of raw HTML', '<div class="x">hi</div>\n'],
    ['inline raw HTML', 'Text <u>x</u> more\n'],
    ['a line-break tag', 'Text <br> more\n'],
    ['HTML wrapping real Markdown', '<div>\n\nmixed *md*\n\n</div>\n'],
    // Link definitions. A note that is nothing but a list of them used to
    // round-trip to an EMPTY FILE.
    ['a bare link definition', '[ref]: https://example.com\n'],
    ['several link definitions', '[a]: http://x.com "T"\n[b]: http://y.com\n'],
    // Inline images — the block image node cannot live inside a paragraph, so
    // these were dropped outright.
    ['an inline image', 'Text ![](fig.png) more\n'],
    ['an inline image with alt text', 'Text ![alt](fig.png) more\n'],
    ['an inline image with a title', 'Text ![a](f.png "T") more\n'],
    ['a fenced block carrying meta', '```js title=x\ncode\n```\n'],
    ['an HTML comment', '<!-- a comment -->\n'],
    ['an Obsidian comment', '%%hidden%%\n'],
    ['a wikilink to a heading', '[[note#Heading]]\n'],
    ['a wikilink to a block', '[[note^block]]\n'],
  ])('keeps %s', (_name, source) => {
    expect(roundTrip(source)).toBe(source)
  })

  /**
   * A table cell frees its wikilink like anything else, but a table is also
   * re-padded to its column widths, so byte identity is the wrong assertion
   * here — that padding is the same accepted normalisation as `*` bullets.
   */
  it('keeps a wikilink in a table cell, though the table is re-padded', () => {
    const out = roundTrip('| a | b |\n| - | - |\n| [[x]] | 2 |\n')
    expect(out).toContain('[[x]]')
    expect(out).not.toContain('\\[')
  })
})

/**
 * The gate in `serialize.ts` emits an unescaped candidate only when it parses
 * to the same tree. These are the documents where it must REFUSE: in each one
 * the escape is load-bearing, and dropping it would turn a paragraph into some
 * other block entirely.
 *
 * Built as ProseMirror documents by hand rather than round-tripped, because
 * the whole point is text that the parser would read differently — a round
 * trip could never produce it.
 *
 * Without these, a gate that always accepted would still pass every test
 * above, which is the version of this change that silently corrupts files.
 */
describe('keeps an escape that is load-bearing', () => {
  const paragraph = (text: string) => ({
    type: 'doc' as const,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

  it.each([
    [
      'a definition line',
      '[ref]: https://example.com',
      '\\[ref]: https\\://example.com\n',
    ],
    ['a list marker', '- not a list', '\\- not a list\n'],
    ['a heading marker', '# not a heading', '\\# not a heading\n'],
    ['a thematic break', '---', '\\---\n'],
  ])('escapes %s that is only prose', (_name, text, expected) => {
    const emitted = serializeToMarkdown(paragraph(text))
    expect(emitted).toBe(expected)
    // The assertion that matters: whatever it emitted still reads back as one
    // paragraph holding exactly that text.
    const reparsed = parseMarkdown(emitted)
    expect(reparsed.children.map((c) => c.type)).toEqual(['paragraph'])
  })

  /**
   * One load-bearing escape must not cost the whole document its fix.
   *
   * Each row reaches the narrow rung of the candidate ladder: unescaping
   * everything would turn the paragraph into a list or a heading, so only the
   * brackets come back. Delete that rung and all three fail.
   */
  it.each([
    [
      'frees a bracket but keeps a list marker',
      '- not a list [x]',
      '\\- not a list [x]\n',
    ],
    ['frees a bracket but keeps a heading marker', '# not one [x]', '\\# not one [x]\n'],
    [
      'frees a highlight but keeps a list marker',
      '- not a list ==hi==',
      '\\- not a list ==hi==\n',
    ],
  ])('%s', (_name, text, expected) => {
    expect(serializeToMarkdown(paragraph(text))).toBe(expected)
  })

  /**
   * One stubborn block must not cost the rest of the document its fix.
   *
   * This is the whole reason the check runs per block rather than over the
   * whole string. Under a whole-document check the first paragraph here
   * refuses, and the wikilink in the second stays escaped for no reason —
   * which is how a single odd line in a long chapter would quietly undo the
   * fix everywhere else in it.
   */
  it('frees the blocks it can and leaves the one it cannot', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '[ref]: https://e.com' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'See [[a note]] here' }] },
      ],
    }
    expect(serializeToMarkdown(doc)).toBe(
      '\\[ref]: https\\://e.com\n\nSee [[a note]] here\n',
    )
  })
})

/**
 * Vault syntax nested inside another block still comes back whole. The check
 * works on TOP-LEVEL blocks, so anything deeper rides along inside one — worth
 * pinning, because it is the difference between "paragraphs are handled" and
 * "documents are handled".
 */
describe('survives inside a containing block', () => {
  it.each([
    ['a list item', '- item with [[a wikilink]]\n'],
    ['a nested list item', '- outer\n  - inner [[link]]\n'],
    ['a blockquote', '> quoted [[link]] here\n'],
    ['a callout body', '> [!note] Title\n> body with [[a link]]\n'],
  ])('keeps %s', (_name, source) => {
    expect(roundTrip(source)).toBe(source)
  })

  /**
   * A table cell frees its wikilink like anything else, but a table is also
   * re-padded to its column widths, so byte identity is the wrong assertion
   * here — that padding is the same accepted normalisation as `*` bullets.
   */
  it('keeps a wikilink in a table cell, though the table is re-padded', () => {
    const out = roundTrip('| a | b |\n| - | - |\n| [[x]] | 2 |\n')
    expect(out).toContain('[[x]]')
    expect(out).not.toContain('\\[')
  })
})

/**
 * ACCEPTED — cosmetic normalisation.
 *
 * These change the bytes without changing what the file means in any renderer.
 * They are the reason a folder project opens in SOURCE mode, where no round
 * trip happens at all, and the reason switching to the rich editor warns
 * first. Pinned so that warning's list stays true, not because they are bugs.
 */
describe('normalises formatting (accepted, and what rich mode warns about)', () => {
  it.each([
    ['a setext heading', 'Title\n=====\n', '# Title\n'],
    ['a two-space hard break', 'one  \ntwo\n', 'one\\\ntwo\n'],
    ['underscore emphasis', '_emphasis_\n', '*emphasis*\n'],
    ['star bullets', '* one\n* two\n', '- one\n- two\n'],
    ['a loose list', '- one\n\n- two\n', '- one\n- two\n'],
    ['an intraword underscore', 'Cost 100% of a_b\n', 'Cost 100% of a\\_b\n'],
    // The DEFINITION survives; only the reference form is normalised, so the
    // link still resolves and nothing is lost. Carrying the reference form on
    // the mark was rejected — see `ui/editor/link-definition.ts`.
    [
      'a reference link into inline form',
      'A [reference][ref].\n\n[ref]: https://example.com/t\n',
      'A [reference](https://example.com/t).\n\n[ref]: https://example.com/t\n',
    ],
    [
      'a reference-style image into inline form',
      '![alt][ref]\n\n[ref]: fig.png\n',
      '![alt](fig.png)\n\n[ref]: fig.png\n',
    ],
    [
      'a shortcut reference into inline form',
      'A [ref] here.\n\n[ref]: https://example.com/t\n',
      'A [ref](https://example.com/t) here.\n\n[ref]: https://example.com/t\n',
    ],
  ])('rewrites %s', (_name, source, current) => {
    expect(roundTrip(source)).toBe(current)
  })
})
