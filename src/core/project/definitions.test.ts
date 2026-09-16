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

  // The fourth Critical in this mechanism, and the first three found no test
  // coverage strong enough to catch them: `render` used `node.label` (the
  // DECODED text) instead of `node.identifier`, stripped `<`/`>` from the URL
  // instead of escaping them, and let a title's trailing backslash escape its
  // own closing quote. All three collapse the synthesised line — and with it
  // the WHOLE injected block — into a paragraph.

  // Finding 1: `label` is decoded, `identifier` is not. A label containing an
  // escaped bracket re-emits as a bare bracket, which is no longer a valid
  // definition line — and because every part's definitions are joined into
  // ONE block, that single bad line turns the entire block into a paragraph,
  // so even the unrelated `good` definition alongside it stops resolving.
  it('keeps the whole block resolvable when one label contains an escaped bracket', () => {
    const withEscapedLabel = '[a\\]b]: https://e.com\n'
    const good = '[good]: https://good.com\n'
    const out = sharedDefinitions([withEscapedLabel, good])

    expect(types(out)).not.toContain('paragraph')
    expect(types(out)).toContain('definition')

    // The `good` definition specifically must still resolve a reference.
    const chapter = 'See [it][good].\n'
    expect(types(`${chapter}\n\n${out}`)).toContain('linkReference')
  })

  // Finding 2: `<` and `>` are legal, meaningful characters in a bare
  // destination. Stripping them (as opposed to escaping them) silently
  // retargets the link with no diagnostic.
  it('escapes rather than strips angle brackets in a URL', () => {
    const source = '[r]: https://e.com/q?a=1>b\n'
    const out = sharedDefinitions([source])
    const reparsed = parseMarkdown(out)
    const def = reparsed.children.find((n) => n.type === 'definition')
    expect(def).toBeDefined()
    if (def?.type === 'definition') {
      expect(def.url).toBe('https://e.com/q?a=1>b')
    }
  })

  // `serialize.ts` resolves a `linkReference` through `def.url` alone and
  // never reads `def.title` (see its `linkReference` case), so carrying a
  // title buys nothing but an escaping surface. Assert none is emitted.
  it('emits no title', () => {
    const out = sharedDefinitions(['[ref]: https://e.com "A Title"\n'])
    expect(out).not.toContain('"')
  })

  // The fifth Critical: an identifier ending in a backslash. `normalizeIdentifier`
  // trims, so `[a\ ]: ...` normalises to identifier `a\` — emitting
  // `[a\]: <...>` escapes its own closing bracket, collapsing the synthesised
  // line (and with it the whole joined block) into a paragraph.
  it('keeps the whole block resolvable when one identifier ends in a backslash', () => {
    const poison = '[a\\ ]: https://poison.com\n'
    const good = '[good]: https://good.com\n'
    const out = sharedDefinitions([poison, good])

    expect(types(out)).not.toContain('paragraph')
    expect(types(out)).toContain('definition')

    const chapter = 'See [it][good].\n'
    expect(types(`${chapter}\n\n${out}`)).toContain('linkReference')
  })

  // Same class of defect, different source: mdast DECODES character
  // references, so `&#10;` in a URL becomes a literal newline by the time
  // `render` sees `node.url`. `<...>` forbids a raw newline, so the emitted
  // line is broken across two lines and the block collapses the same way.
  it('keeps the whole block resolvable when a URL contains a decoded newline', () => {
    const poison = '[r]: https://e.com/&#10;x\n'
    const good = '[good]: https://good.com\n'
    const out = sharedDefinitions([poison, good])

    expect(types(out)).not.toContain('paragraph')
    expect(types(out)).toContain('definition')

    const chapter = 'See [it][good].\n'
    expect(types(`${chapter}\n\n${out}`)).toContain('linkReference')
  })

  // A dropped definition must drop SILENTLY (conversion never throws) and
  // must not take any other definition down with it.
  it('drops a poisoned definition silently while the rest survive', () => {
    const poison = '[a\\ ]: https://poison.com\n'
    const good = '[good]: https://good.com\n'
    const out = sharedDefinitions([poison, good])

    expect(out).toContain('good')
    expect(out).not.toContain('poison')
  })
})
