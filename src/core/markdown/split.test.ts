import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './parse'
import { mdastToPm } from './pm/mdast-to-pm'
import { serializeToMarkdown } from './pm/serialize'
import { joinFrontmatter, splitFrontmatter } from './split'

describe('splitFrontmatter', () => {
  it('separates a frontmatter block from the body', () => {
    expect(splitFrontmatter('---\ntitle: T\n---\n\n# H\n\nBody.\n')).toEqual({
      frontmatter: 'title: T',
      body: '# H\n\nBody.\n',
    })
  })

  it('returns a null block when there is no frontmatter', () => {
    expect(splitFrontmatter('# H\n\nBody.\n')).toEqual({
      frontmatter: null,
      body: '# H\n\nBody.\n',
    })
  })

  it('ignores a fence that is not at the very start', () => {
    const source = 'Intro.\n\n---\ntitle: T\n---\n'
    expect(splitFrontmatter(source)).toEqual({ frontmatter: null, body: source })
  })

  it('does not mistake a thematic break for frontmatter', () => {
    // A document opening with a horizontal rule has no closing fence, so there
    // is no block to lift. Treating it as one would swallow the document.
    expect(splitFrontmatter('---\n\nBody.\n').frontmatter).toBeNull()
  })

  it('does not let a --- inside a block scalar close the block', () => {
    // The case a regex gets wrong. Everything after the inner --- would be
    // shown as body text and serialised away on the next keystroke.
    const source = '---\nabstract: |\n  one\n  ---\n  two\ntitle: Kept\n---\n\nBody.\n'
    const { frontmatter, body } = splitFrontmatter(source)
    expect(frontmatter).toContain('title: Kept')
    expect(body).toBe('Body.\n')
  })

  it('strips the separator after a CRLF block without leaving a stray newline', () => {
    expect(splitFrontmatter('---\r\ntitle: T\r\n---\r\n\r\n# H\r\n')).toEqual({
      frontmatter: 'title: T',
      body: '# H\r\n',
    })
  })

  it('tolerates an empty block', () => {
    expect(splitFrontmatter('---\n---\n\nBody.\n')).toEqual({
      frontmatter: '',
      body: 'Body.\n',
    })
  })
})

describe('joinFrontmatter', () => {
  it('round-trips a document with frontmatter', () => {
    const source = '---\ntitle: T\n---\n\n# H\n\nBody.\n'
    const { frontmatter, body } = splitFrontmatter(source)
    expect(joinFrontmatter(frontmatter, body)).toBe(source)
  })

  it('returns the body unchanged when there is no block', () => {
    expect(joinFrontmatter(null, '# H\n')).toBe('# H\n')
  })
})

describe('frontmatter survives the rich-editor round trip', () => {
  // This is the actual bug: mdastToPm has no yaml case, so the node was
  // dropped on load and the next keystroke serialised a document without it.
  // splitFrontmatter/joinFrontmatter fix it by keeping the block out of the
  // editor entirely rather than by teaching the editor to model it.
  it('preserves frontmatter and body across split -> parse -> pm -> serialize -> join', () => {
    const source = '---\ntitle: T\n---\n\n# Copyright\n\nBody.\n'
    const { frontmatter, body } = splitFrontmatter(source)
    const pmDoc = mdastToPm(parseMarkdown(body))
    const serializedBody = serializeToMarkdown(pmDoc as never)
    const result = joinFrontmatter(frontmatter, serializedBody)

    expect(result).toContain('---\ntitle: T\n---')
    expect(result).toContain('# Copyright')
    expect(result).toContain('Body.')
  })
})
