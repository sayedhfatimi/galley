import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type GalleyConfig, presetFor } from '../config'
import { convert, readFrontmatter } from './document'

const cfg = (over: Partial<GalleyConfig> = {}): GalleyConfig => ({
  ...DEFAULT_CONFIG,
  ...over,
})

describe('convert', () => {
  it('produces a complete, self-contained document', () => {
    const { tex } = convert('# Hello\n\nBody.', cfg())
    expect(tex).toMatch(/^\\documentclass/)
    expect(tex).toContain('\\begin{document}')
    expect(tex).toContain('\\end{document}')
    expect(tex.indexOf('\\begin{document}')).toBeLessThan(tex.indexOf('\\end{document}'))
  })

  it('places the body between the document delimiters', () => {
    const { tex } = convert('Body text.', cfg())
    const start = tex.indexOf('\\begin{document}')
    const end = tex.indexOf('\\end{document}')
    expect(tex.slice(start, end)).toContain('Body text.')
  })

  it('emits maketitle only when there is metadata', () => {
    expect(convert('x', cfg({ metadata: { title: 'T' } })).tex).toContain('\\maketitle')
    expect(convert('x', cfg({ metadata: {} })).tex).not.toContain('\\maketitle')
  })

  it('emits tableofcontents only when requested', () => {
    expect(convert('x', cfg({ toc: { include: true, depth: 2 } })).tex).toContain(
      '\\tableofcontents',
    )
    expect(convert('x', cfg({ toc: { include: false, depth: 2 } })).tex).not.toContain(
      '\\tableofcontents',
    )
  })

  it('returns frontmatter for pre-filling the configuration panel', () => {
    const { frontmatter, hasFrontmatter } = convert(
      '---\ntitle: T\nauthor: A\n---\n\nBody.',
      cfg(),
    )
    expect(frontmatter).toEqual({ title: 'T', author: 'A' })
    expect(hasFrontmatter).toBe(true)
  })

  it('surfaces diagnostics rather than throwing', () => {
    const { diagnostics } = convert('![alt](a.png)', cfg())
    expect(diagnostics.map((d) => d.kind)).toContain('image-unsupported')
  })

  // "Conversion from Markdown to LaTeX should not fail."
  it.each([
    ['', 'empty input'],
    ['   \n\n  ', 'whitespace only'],
    ['---\n: not valid yaml :\n---\n', 'malformed frontmatter'],
    ['<script>alert(1)</script>', 'raw HTML'],
    ['| broken | table\n|---', 'malformed table'],
    ['$ unclosed maths', 'unbalanced maths delimiter'],
    ['\\\\weird\\\\ backslashes %$#&_{}~^', 'a pile of special characters'],
  ])('never throws on %s (%s)', (input) => {
    expect(() => convert(input, cfg())).not.toThrow()
    expect(convert(input, cfg()).tex).toContain('\\end{document}')
  })

  it('still compiles when a document has only frontmatter', () => {
    const { tex } = convert('---\ntitle: T\n---\n', cfg({ metadata: { title: 'T' } }))
    expect(tex).toContain('\\begin{document}')
    expect(tex).toContain('\\end{document}')
  })

  it('honours the character preset end to end', () => {
    const { tex } = convert('# Part One\n\nBody.', presetFor('book'))
    expect(tex).toContain('{book}')
    expect(tex).toContain('\\chapter{Part One}')
    expect(tex).toContain('paperwidth=156mm')
  })

  it('ends with a trailing newline, as a text file should', () => {
    expect(convert('x', cfg()).tex.endsWith('\n')).toBe(true)
  })
})

describe('readFrontmatter', () => {
  it('reads metadata without doing the full conversion', () => {
    expect(readFrontmatter('---\ntitle: Quick\n---\n\nBody.')).toEqual({ title: 'Quick' })
  })

  it('returns nothing for a document without frontmatter', () => {
    expect(readFrontmatter('# Just a heading')).toEqual({})
  })
})
