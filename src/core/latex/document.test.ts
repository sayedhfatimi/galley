import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type GalleyConfig, presetFor } from '../config'
import { convert, convertProject, readFrontmatter } from './document'

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
    // Raw HTML has no typeset equivalent, so it is reported rather than dropped.
    const result = convert('<div>raw</div>\n', DEFAULT_CONFIG)
    expect(result.diagnostics.map((d) => d.kind)).toContain('raw-html')
    expect(result.tex).toContain('\\begin{document}')
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
describe('front and main matter', () => {
  it("numbers a book's front matter separately from its body", () => {
    const tex = convert('# One\n\nText.\n', presetFor('book')).tex
    expect(tex).toContain('\\frontmatter')
    expect(tex).toContain('\\mainmatter')
    // Order matters: contents belong to the front matter, the body does not.
    expect(tex.indexOf('\\frontmatter')).toBeLessThan(tex.indexOf('\\mainmatter'))
    expect(tex.indexOf('\\mainmatter')).toBeLessThan(tex.indexOf('\\chapter{One}'))
  })

  it('leaves article and report alone, which have no such commands', () => {
    for (const character of ['article', 'report'] as const) {
      const tex = convert('# One\n', presetFor(character)).tex
      expect(tex).not.toContain('\\frontmatter')
      expect(tex).not.toContain('\\mainmatter')
    }
  })
})

describe('convertProject', () => {
  const book = {
    ...presetFor('book'),
    metadata: { title: 'A Book', author: 'A. Writer' },
  }
  const part = (path: string, source: string, role: 'front' | 'main' | 'back') => ({
    path,
    source,
    spec: { role, numbered: role === 'main', listed: true },
  })

  it('opens front matter before the first part and main matter once', () => {
    const { tex } = convertProject(
      [
        part('01-copyright.md', '# Copyright\n', 'front'),
        part('02-one.md', '# Chapter One\n', 'main'),
        part('03-two.md', '# Chapter Two\n', 'main'),
      ],
      book,
    )
    expect(tex.match(/\\frontmatter/g)).toHaveLength(1)
    expect(tex.match(/\\mainmatter/g)).toHaveLength(1)
    expect(tex.indexOf('\\frontmatter')).toBeLessThan(tex.indexOf('Copyright'))
    expect(tex.indexOf('\\tableofcontents')).toBeLessThan(tex.indexOf('\\mainmatter'))
  })

  it('takes metadata from the config, not from a chapter’s frontmatter', () => {
    const { tex } = convertProject(
      [
        part(
          '01-a.md',
          '---\ntitle: Not This\ngalley:\n  role: main\n---\n\n# A\n',
          'main',
        ),
      ],
      book,
    )
    expect(tex).toContain('A Book')
    expect(tex).not.toContain('Not This')
  })

  it('compiles a project with no parts at all', () => {
    const { tex } = convertProject([], book)
    expect(tex).toContain('\\begin{document}')
    expect(tex).toContain('\\end{document}')
  })

  // The owner's decision measured in Task 9: a reference only becomes a
  // reference NODE when its definition is in the same parsed source. Two
  // parts, a link in one resolving only against a definition in the other —
  // this fails silently (renders as literal text) without project-wide
  // definitions.
  it('resolves a link reference defined in a different part', () => {
    const { tex } = convertProject(
      [
        part('01-a.md', '# A\n\nSee [the site][ref].\n', 'main'),
        part('02-b.md', '# B\n\n[ref]: https://example.com\n', 'main'),
      ],
      book,
    )
    expect(tex).toContain('\\href{https://example.com}{the site}')
    expect(tex).not.toContain('[the site][ref]')
  })

  // Appending a part's own definition back to itself must be inert: a
  // duplicate `definition` node serialises to the empty string (serialize.ts's
  // `case 'definition'`). This proves the page a project produces when every
  // part is already self-contained is exactly what it would have been without
  // project-wide definitions at all. (Retargeted from a footnote example:
  // footnoteDefinition is no longer collected by `sharedDefinitions` at all —
  // see definitions.ts — so it can no longer be duplicated by injection, and
  // is no longer a useful example of this inertness property. Footnotes still
  // resolve locally within their own part, unaffected by this test.)
  it('adds nothing to the page when every part already defines its own link', () => {
    const { tex } = convertProject(
      [
        part('01-a.md', '# A\n\nSee [ref A][a].\n\n[a]: https://a.example\n', 'main'),
        part('02-b.md', '# B\n\nSee [ref B][b].\n\n[b]: https://b.example\n', 'main'),
      ],
      book,
    )
    // `\href{...}` count, not a raw URL count: the book preset's
    // `footnoteUrls` also repeats a link's target in a footnote by design
    // (see serialize.ts's `#link`), which is unrelated to definition
    // duplication and would make a raw URL count of 1 a false failure.
    expect(tex.match(/\\href\{https:\/\/a\.example\}/g)).toHaveLength(1)
    expect(tex.match(/\\href\{https:\/\/b\.example\}/g)).toHaveLength(1)
    expect(tex).not.toContain('[a]:')
    expect(tex).not.toContain('[b]:')
  })

  // The Critical review finding this pin exists for: a footnoteDefinition is
  // a CONTAINER, so injecting one at the top of a part's body absorbs any
  // indented block that body opens with as the footnote's own continuation —
  // moving content from one chapter into another footnote, with no malformed
  // input required. Reproduction as measured: Part A defines a footnote; Part
  // B's body opens with an indented code block.
  it('never absorbs another chapter’s indented body into an injected footnote', () => {
    const { tex } = convertProject(
      [
        part('01-a.md', '# Alpha\n\nText[^a]\n\n[^a]: first line\n', 'main'),
        part('02-b.md', '    genuinely indented code block\n\nAfter code.\n', 'main'),
      ],
      book,
    )
    expect(tex).toContain('\\begin{Verbatim}')
    expect(tex).toContain('genuinely indented code block')
    const footnoteMatch = tex.match(/\\footnote\{([^}]*)\}/)
    expect(footnoteMatch?.[1]).not.toContain('genuinely indented')
  })

  // Review finding: appending shared definitions to the END of a part's
  // source is swallowed whole when that part ends inside an unterminated
  // construct — an unclosed ``` fence consumes to end-of-file, so the
  // appended `[ref]: ...` definition line is printed as literal text inside
  // the reader's code block instead of resolving invisibly. Placing the
  // definitions at the TOP of the body instead means nothing earlier in the
  // file can swallow them.
  it('never prints a definition appended after an unclosed fence in another part', () => {
    const { tex } = convertProject(
      [
        part('01-a.md', '# A\n\nSee [the site][ref].\n\n```\nunclosed fence\n', 'main'),
        part('02-b.md', '# B\n\n[ref]: https://example.com\n', 'main'),
      ],
      book,
    )
    expect(tex).not.toContain('[ref]:')
  })
})

describe('matter divisions', () => {
  it('opens main matter before the body when the document declares no parts', () => {
    const { tex } = convert('# A Chapter\n', cfg({ character: 'book' }))
    expect(tex).toContain('\\frontmatter')
    expect(tex.indexOf('\\mainmatter')).toBeLessThan(tex.indexOf('\\chapter{A Chapter}'))
    expect(tex.split('\\mainmatter').length - 1).toBe(1)
  })

  it('leaves main matter to the body when the document declares front matter', () => {
    const source =
      '---\nstructure:\n  Dedication: { role: front }\n---\n\n# Dedication\n\n# A Chapter\n'
    const { tex } = convert(source, cfg({ character: 'book' }))
    // Exactly one \mainmatter, and it falls between the two parts rather than
    // before both of them.
    expect(tex.split('\\mainmatter').length - 1).toBe(1)
    expect(tex.indexOf('Dedication')).toBeLessThan(tex.indexOf('\\mainmatter'))
    expect(tex.indexOf('\\mainmatter')).toBeLessThan(tex.indexOf('\\chapter{A Chapter}'))
  })

  it('never emits matter divisions in an article', () => {
    const source = '---\nstructure:\n  Preface: { role: front }\n---\n\n# Preface\n'
    const { tex } = convert(source, cfg({ character: 'article' }))
    expect(tex).not.toContain('\\frontmatter')
    expect(tex).not.toContain('\\mainmatter')
    expect(tex).not.toContain('\\backmatter')
  })
})

/**
 * A DELIBERATE change from pre-branch behaviour, pinned here because nothing
 * else pins it.
 *
 * Before this branch, `convert('# H\n\n![[cover.png]]\n', …)` emitted the embed
 * as escaped literal text — galley had never heard of `![[…]]`. It now emits a
 * real figure, because a chapter pasted out of Obsidian into the single-document
 * editor should draw its pictures rather than print their filenames.
 *
 * The transform that does this moved OFF `parseMarkdown` and onto the
 * conversion path (see `document.ts` and `markdown/pm/roundtrip.test.ts`), so
 * this behaviour now rests on `convert` applying it explicitly. Delete that call
 * and nothing else in the suite notices — the mutation-tested structure
 * guardrail contains no wikilink. Hence this test.
 */
describe('Obsidian embeds in a single document', () => {
  it('draws a figure for an embed rather than printing its filename', () => {
    const { tex, images, diagnostics } = convert('# H\n\n![[cover.png]]\n', cfg())
    expect(tex).toContain(
      '\\includegraphics[width=\\linewidth,keepaspectratio]{cover.png}',
    )
    expect(images).toEqual(['cover.png'])
    expect(diagnostics).toEqual([])
  })

  it('reports the embed as a missing figure when its bytes are absent', () => {
    const { tex, diagnostics } = convert('![[cover.png]]\n', cfg(), new Set<string>())
    expect(tex).toContain('[Figure not included:')
    expect(diagnostics.map((d) => d.kind)).toEqual(['image-unsupported'])
  })
})
