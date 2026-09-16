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
    expect(sharedDefinitions(['[ref]: https://e.com\n'])).toBe('[ref]: https://e.com')
  })

  it('collects a footnote definition', () => {
    expect(sharedDefinitions(['[^a]: the note\n'])).toContain('[^a]: the note')
  })

  it('collects across every part', () => {
    const out = sharedDefinitions([
      '[a]: https://a.com\n',
      '# C\n',
      '[b]: https://b.com\n',
    ])
    expect(out).toContain('[a]: https://a.com')
    expect(out).toContain('[b]: https://b.com')
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
})
