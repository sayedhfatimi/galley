import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { presetFor } from '../../config'
import { serializeToLatex } from '../../latex/serialize'
import { parseMarkdown } from '../parse'
import { mdastToPm } from './mdast-to-pm'
import { pmToMdast } from './pm-to-mdast'

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
