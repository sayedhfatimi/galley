import type { Paragraph, Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './parse'

function firstParagraph(source: string): Paragraph {
  const tree: Root = parseMarkdown(source)
  return tree.children.find((n) => n.type === 'paragraph') as Paragraph
}

describe('wikilink embeds', () => {
  it('turns an embed into an image node', () => {
    const p = firstParagraph('![[diagram.png]]\n')
    expect(p.children).toHaveLength(1)
    expect(p.children[0]).toMatchObject({ type: 'image', url: 'diagram.png', alt: '' })
  })

  it('keeps the text around an inline embed', () => {
    const p = firstParagraph('see ![[diagram.png]] here\n')
    expect(p.children.map((c) => c.type)).toEqual(['text', 'image', 'text'])
    expect((p.children[0] as { value: string }).value).toBe('see ')
    expect((p.children[2] as { value: string }).value).toBe(' here')
  })

  it('reads an alias as the alt text', () => {
    const p = firstParagraph('![[diagram.png|A diagram]]\n')
    expect(p.children[0]).toMatchObject({ url: 'diagram.png', alt: 'A diagram' })
  })

  it('handles two embeds in one paragraph', () => {
    const p = firstParagraph('![[a.png]] and ![[b.png]]\n')
    expect(p.children.map((c) => c.type)).toEqual(['image', 'text', 'image'])
  })

  it('leaves a plain wikilink alone — only embeds are figures', () => {
    const p = firstParagraph('[[some note]]\n')
    expect(p.children.map((c) => c.type)).toEqual(['text'])
  })

  it('leaves an embed inside inline code alone', () => {
    const p = firstParagraph('`![[diagram.png]]`\n')
    expect(p.children.map((c) => c.type)).toEqual(['inlineCode'])
  })

  it('leaves a fenced code block alone', () => {
    const tree = parseMarkdown('```\n![[diagram.png]]\n```\n')
    expect(tree.children[0]).toMatchObject({ type: 'code' })
  })

  it('leaves a standard Markdown image alone', () => {
    const p = firstParagraph('![alt](diagram.png)\n')
    expect(p.children[0]).toMatchObject({ type: 'image', url: 'diagram.png', alt: 'alt' })
  })
})
