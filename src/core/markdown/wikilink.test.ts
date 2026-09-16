import type { Paragraph, Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './parse'
import { applyWikilinkEmbeds } from './wikilink'

/**
 * Parse, then transform — the order the conversion path uses.
 *
 * `parseMarkdown` deliberately does NOT apply this transform: it is also the
 * rich editor's parse, and an embed rewritten there is written back over the
 * author's own vault file. `latex/document.ts` applies it on the way to LaTeX
 * and nowhere else, so these tests call it the same way.
 */
function transformed(source: string): Root {
  const tree: Root = parseMarkdown(source)
  applyWikilinkEmbeds(tree)
  return tree
}

function firstParagraph(source: string): Paragraph {
  return transformed(source).children.find((n) => n.type === 'paragraph') as Paragraph
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

  // In Obsidian the pipe on an EMBED is a display width in pixels, not alt
  // text: `![[cover.png|400]]` means "render this 400px wide". Reading it as
  // alt text put `\caption{400}` under every sized figure in a real vault.
  it('discards the pipe portion, which is a display width and not a caption', () => {
    expect(firstParagraph('![[diagram.png|400]]\n').children[0]).toMatchObject({
      type: 'image',
      url: 'diagram.png',
      alt: '',
    })
    expect(firstParagraph('![[diagram.png|A diagram]]\n').children[0]).toMatchObject({
      type: 'image',
      url: 'diagram.png',
      alt: '',
    })
  })

  // `![[Appendix A]]` transcludes a NOTE. Treating it as an image made galley
  // answer "That image format cannot be typeset. Use PNG, JPG, JPEG, PDF." —
  // the wrong cause, in the exact case folder projects exist for. A target
  // with no file extension is left exactly as the author wrote it.
  it('leaves a note transclusion untouched', () => {
    const p = firstParagraph('![[Appendix A]]\n')
    expect(p.children.map((c) => c.type)).toEqual(['text'])
    expect((p.children[0] as { value: string }).value).toBe('![[Appendix A]]')
  })

  it('still converts an embed that names a file', () => {
    const p = firstParagraph('![[figures/plot.png]]\n')
    expect(p.children[0]).toMatchObject({ type: 'image', url: 'figures/plot.png' })
  })

  it('converts a file embed sitting beside a note transclusion', () => {
    const p = firstParagraph('![[Appendix A]] then ![[plot.png]]\n')
    expect(p.children.map((c) => c.type)).toEqual(['text', 'image'])
    expect((p.children[0] as { value: string }).value).toBe('![[Appendix A]] then ')
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
    const tree = transformed('```\n![[diagram.png]]\n```\n')
    expect(tree.children[0]).toMatchObject({ type: 'code' })
  })

  it('leaves a standard Markdown image alone', () => {
    const p = firstParagraph('![alt](diagram.png)\n')
    expect(p.children[0]).toMatchObject({ type: 'image', url: 'diagram.png', alt: 'alt' })
  })
})
