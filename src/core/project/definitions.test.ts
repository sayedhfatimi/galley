import type { Nodes } from 'mdast'
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../markdown/parse'
import { sharedDefinitions } from './definitions'

const types = (src: string) => {
  const out: string[] = []
  const walk = (n: Nodes) => {
    out.push(n.type)
    if ('children' in n) for (const c of n.children) walk(c as Nodes)
  }
  walk(parseMarkdown(src))
  return out
}

describe('sharedDefinitions', () => {
  it('collects a link definition from one part', () => {
    expect(sharedDefinitions(['[ref]: https://e.com\n'])).toBe('[ref]: <https://e.com>')
  })

  it('does not collect a footnote definition', () => {
    expect(sharedDefinitions(['[^a]: the note\n'])).toBe('')
  })

  // The defect this exclusion exists to prevent. A footnoteDefinition is a
  // CONTAINER: injected at the top of a body that opens with indented content,
  // it absorbs that content as its own continuation, moving it into another
  // chapter. A leaf `definition` leaves it alone.
  it('never lets an injected definition absorb the body that follows it', () => {
    const body = '    indented code\n\nAfter.\n'
    const injected = `${sharedDefinitions(['[ref]: https://e.com\n', '[^a]: note\n'])}\n\n${body}`
    expect(types(injected)).toContain('code')
  })

  it('collects across every part', () => {
    const out = sharedDefinitions([
      '[a]: https://a.com\n',
      '# C\n',
      '[b]: https://b.com\n',
    ])
    expect(out).toContain('[a]: <https://a.com>')
    expect(out).toContain('[b]: <https://b.com>')
  })

  it('returns an empty string when the book defines nothing', () => {
    expect(sharedDefinitions(['# C\n\nProse.\n'])).toBe('')
  })

  // The point of the whole module: this is the before/after that fails without it.
  it('makes a reference in one part resolve against a definition in another', () => {
    const chapter = 'See [the site][ref].\n'
    const other = '[ref]: https://e.com\n'
    expect(types(chapter)).not.toContain('linkReference')
    expect(types(`${chapter}\n\n${sharedDefinitions([chapter, other])}`)).toContain(
      'linkReference',
    )
  })

  // The third defect in this mechanism. A definition node is a leaf, but its
  // SOURCE SLICE is not self-contained: written inside a blockquote, the
  // continuation line carrying the title still has the `>` marker attached,
  // and slicing takes it along. Measured: re-parsing the slice yields a
  // `definition` PLUS a stray blockquote, which prints a spurious
  // `\begin{quote}` at the top of every part it is injected into.
  it('strips the blockquote marker from a definition written inside one', () => {
    const source = '> [ref]: https://e.com\n> "A Title"\n'
    const out = sharedDefinitions([source])
    // No line carries a blockquote marker. (The rendered URL legitimately
    // contains `>` as its own delimiter, e.g. `<https://e.com>` — so the
    // check is for a `>`-led LINE, not for the character anywhere at all.)
    expect(out).not.toMatch(/^>/m)
    // The synthesised line has no continuation, so it cannot carry a marker.
    expect(out.split('\n')).toHaveLength(1)
    expect(types(out)).not.toContain('blockquote')
    expect(types(out)).toContain('definition')
  })

  // Same defect, list-item container. Re-parsing the raw sliced text in
  // isolation happens not to resurrect a `list` node here (a definition's
  // continuation line tolerates arbitrary indentation), so the structural
  // no-container-node check from the blockquote case would pass even on the
  // unfixed code and prove nothing. The defect is that the slice still
  // carries the container's leading whitespace on a continuation line at
  // all — assert on that directly: one synthesised line, no line with
  // leading whitespace.
  it('strips list-item indentation from a definition written inside one', () => {
    const source = '- [ref]: https://e.com\n  "A Title"\n'
    const out = sharedDefinitions([source])
    expect(out).not.toMatch(/^\s/m)
    expect(out.split('\n')).toHaveLength(1)
    expect(types(out)).toContain('definition')
  })

  // Round-trip: the synthesised line must still carry a title and a URL
  // (including one with angle brackets, which must survive re-escaping) all
  // the way through a second parse.
  it('round-trips a title and an angle-bracket destination through re-parsing', () => {
    const withTitle = sharedDefinitions(['[ref]: https://e.com "A Title"\n'])
    const reparsedTitle = parseMarkdown(withTitle)
    const titleDef = reparsedTitle.children.find((n) => n.type === 'definition')
    expect(titleDef).toBeDefined()
    if (titleDef?.type === 'definition') {
      expect(titleDef.url).toBe('https://e.com')
      expect(titleDef.title).toBe('A Title')
    }

    const withAngles = sharedDefinitions(['[ref]: <https://e.com/a(b)>\n'])
    const reparsedAngles = parseMarkdown(withAngles)
    const angleDef = reparsedAngles.children.find((n) => n.type === 'definition')
    expect(angleDef).toBeDefined()
    if (angleDef?.type === 'definition') {
      expect(angleDef.url).toBe('https://e.com/a(b)')
    }
  })
})
