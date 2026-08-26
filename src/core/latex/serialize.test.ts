import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type GalleyConfig } from '../config'
import { parseMarkdown } from '../markdown/parse'
import { serializeToLatex } from './serialize'

const tex = (md: string, over: Partial<GalleyConfig> = {}): string =>
  serializeToLatex(parseMarkdown(md), { ...DEFAULT_CONFIG, ...over }).body

const diags = (md: string, over: Partial<GalleyConfig> = {}) =>
  serializeToLatex(parseMarkdown(md), { ...DEFAULT_CONFIG, ...over }).diagnostics

describe('headings', () => {
  it('maps a top-level heading to a section in an article', () => {
    expect(tex('# Title', { character: 'article' })).toBe('\\section{Title}')
  })

  it('maps a top-level heading to a chapter in a book', () => {
    expect(tex('# Title', { character: 'book' })).toBe('\\chapter{Title}')
  })

  it('shifts everything below accordingly', () => {
    expect(tex('## Sub', { character: 'book' })).toBe('\\section{Sub}')
    expect(tex('## Sub', { character: 'article' })).toBe('\\subsection{Sub}')
  })

  it('clamps rather than dropping headings past the deepest level', () => {
    expect(tex('###### Deep', { character: 'article' })).toContain('\\subparagraph{Deep}')
  })

  it('escapes special characters in heading text', () => {
    expect(tex('# 100% & more')).toBe('\\section{100\\% \\& more}')
  })
})

describe('inline formatting', () => {
  it.each([
    ['*a*', '\\emph{a}'],
    ['**a**', '\\textbf{a}'],
    ['~~a~~', '\\sout{a}'],
    ['`a`', '\\texttt{a}'],
  ])('maps %s', (md, expected) => {
    expect(tex(md)).toBe(expected)
  })

  it('escapes inside inline code', () => {
    expect(tex('`a_b%c`')).toBe('\\texttt{a\\_b\\%c}')
  })

  it('nests emphasis inside strong', () => {
    expect(tex('**bold *and* italic**')).toBe('\\textbf{bold \\emph{and} italic}')
  })

  it('renders a hard break', () => {
    expect(tex('a  \nb')).toContain('\\\\')
  })
})

describe('maths', () => {
  // Permissive by design: it runs on the reader's own CPU, bounded by the
  // compile timeout rather than by an allow-list of commands.
  it('passes inline maths through untouched', () => {
    expect(tex('$\\alpha^2 + \\beta_i$')).toBe('$\\alpha^2 + \\beta_i$')
  })

  it('passes display maths through untouched', () => {
    expect(tex('$$\n\\int_0^\\infty e^{-x^2}\n$$')).toBe(
      '\\[\n\\int_0^\\infty e^{-x^2}\n\\]',
    )
  })

  it('does not escape special characters inside maths', () => {
    expect(tex('$a_b^c$')).toBe('$a_b^c$')
  })
})

describe('lists', () => {
  it('renders an unordered list', () => {
    expect(tex('- one\n- two')).toBe(
      '\\begin{itemize}\n  \\item one\n  \\item two\n\\end{itemize}',
    )
  })

  it('renders an ordered list', () => {
    expect(tex('1. one\n2. two')).toContain('\\begin{enumerate}')
  })

  it('preserves nesting', () => {
    const out = tex('- outer\n  - inner')
    expect(out.indexOf('\\begin{itemize}')).toBeLessThan(
      out.indexOf('\\begin{itemize}', 1),
    )
    expect(out).toContain('inner')
  })

  it('renders task list state rather than dropping it', () => {
    const out = tex('- [x] done\n- [ ] todo')
    expect(out).toContain('$\\checkmark$')
    expect(out).toContain('$\\square$')
  })
})

describe('code blocks', () => {
  it('uses Verbatim and does not escape the contents', () => {
    const out = tex('```\na_b % & #\n```')
    expect(out).toContain('\\begin{Verbatim}')
    expect(out).toContain('a_b % & #')
    expect(out).not.toContain('\\_')
  })

  it('enables line breaking so long lines stay in the text block', () => {
    expect(tex('```\nx\n```')).toContain('breaklines=true')
  })

  // The one way user content can escape a verbatim environment.
  it('falls back safely when the code contains the end delimiter', () => {
    const md = '```\n\\end{Verbatim}\n```'
    expect(tex(md)).not.toContain('\\begin{Verbatim}')
    expect(diags(md).map((d) => d.kind)).toContain('verbatim-delimiter')
  })
})

describe('tables', () => {
  const md = '| A | B |\n| --- | --- |\n| 1 | 2 |'

  it('uses xltabular, not longtable, so X columns parse and pages break', () => {
    const out = tex(md)
    expect(out).toContain('\\begin{xltabular}{\\linewidth}')
    expect(out).not.toContain('\\begin{longtable}')
  })

  it('uses rules rather than boxed borders', () => {
    const out = tex(md)
    expect(out).toContain('\\toprule')
    expect(out).toContain('\\midrule')
    expect(out).toContain('\\bottomrule')
    expect(out).not.toContain('\\hline')
  })

  it('repeats the header when the table breaks across pages', () => {
    expect(tex(md)).toContain('\\endhead')
  })

  it('honours column alignment', () => {
    const out = tex('| A | B | C |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |')
    expect(out).toContain('\\raggedright')
    expect(out).toContain('\\centering')
    expect(out).toContain('\\raggedleft')
  })

  it('separates cells and terminates rows', () => {
    expect(tex(md)).toContain('1 & 2 \\\\')
  })
})

describe('links', () => {
  it('reproduces the target so it survives printing', () => {
    const out = tex('[text](https://example.com)')
    expect(out).toContain('\\href{https://example.com}{text}')
    expect(out).toContain('\\footnote{\\url{https://example.com}}')
  })

  it('does not footnote a bare URL, which would just repeat itself', () => {
    const out = tex('<https://example.com>')
    expect(out).toBe('\\url{https://example.com}')
  })

  it('escapes characters that would break the argument', () => {
    expect(tex('[t](https://x.test/a%20b)')).toContain('a\\%20b')
  })

  it('resolves reference-style links', () => {
    expect(tex('[text][ref]\n\n[ref]: https://example.com')).toContain(
      '\\href{https://example.com}',
    )
  })

  // Every character here is one TeX would otherwise eat, and a mangled address
  // in a printed book cannot be corrected after the fact.
  //
  // Escaping is only half the contract: what matters is the address that ends
  // up in the PDF. These cases were compiled and the link annotations read back
  // out of the file — each arrives byte-exact, and the visible footnote text
  // shows the unescaped address.
  it.each([
    ['a space', 'https://example.com/a%20path'],
    ['an underscore, query and fragment', 'https://example.com/a_b?x=1&y=2#frag'],
    ['a tilde', 'https://example.com/~user'],
    ['a relative path with no scheme', '../chapter-two.md'],
  ])('carries a URL containing %s through unchanged', (_label, url) => {
    const out = tex(`[label](${url})`)
    // The escaped form differs from the source; stripping the escapes must
    // recover the original exactly, in both the target and the footnote.
    const targets = [...out.matchAll(/\\href\{(.*?)\}\{|\\url\{(.*?)\}/g)].map((m) =>
      (m[1] ?? m[2]).replace(/\\([#$%&_{}~^\\])/g, '$1'),
    )
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) expect(target).toBe(url)
  })

  it('gives an email address a mailto scheme', () => {
    expect(tex('<someone@example.com>')).toContain('mailto:someone@example.com')
  })
})

describe('images', () => {
  it('sets a lone image as a figure, with the alt text as its caption', () => {
    const out = tex('![A diagram](fig.png)')
    expect(out).toContain('\\begin{figure}[htbp]')
    expect(out).toContain('\\includegraphics[width=\\linewidth,keepaspectratio]{fig.png}')
    expect(out).toContain('\\caption{A diagram}')
  })

  it('omits the caption when there is no alt text', () => {
    const out = tex('![](fig.png)')
    expect(out).toContain('\\begin{figure}')
    expect(out).not.toContain('\\caption')
  })

  it('keeps an image mixed into a sentence inline, with no float', () => {
    // A float opened mid-paragraph would reorder the reader's prose.
    const out = tex('Before ![x](fig.png) after.')
    expect(out).toContain('\\includegraphics')
    expect(out).not.toContain('\\begin{figure}')
  })

  it('reports the names it drew, so the caller supplies exactly those bytes', () => {
    const { images } = serializeToLatex(
      parseMarkdown('![a](one.png)\n\n![b](two.jpg)'),
      DEFAULT_CONFIG,
    )
    expect(images).toEqual(['one.png', 'two.jpg'])
  })

  it('sanitises the name once, so the .tex and the store agree', () => {
    // A space or a # would end \includegraphics' argument early, and a
    // directory prefix means nothing in the engine's flat filesystem.
    // Angle brackets are how CommonMark carries a URL containing spaces.
    const { body, images } = serializeToLatex(
      parseMarkdown('![x](<My Photo #2.PNG>)'),
      DEFAULT_CONFIG,
    )
    expect(images).toEqual(['My-Photo-2.png'])
    expect(body).toContain('{My-Photo-2.png}')
  })

  it('refuses a remote image rather than fetching it', () => {
    const out = tex('![x](https://example.com/a.png)')
    expect(out).toContain('Figure not included')
    expect(diags('![x](https://example.com/a.png)').map((d) => d.kind)).toContain(
      'image-unsupported',
    )
  })

  it('refuses a format it cannot typeset, naming the ones it can', () => {
    expect(diags('![x](a.svg)')[0].message).toContain('PNG, JPG, JPEG, PDF')
    expect(tex('![x](a.svg)')).toContain('Figure not included')
  })

  it('draws nothing for an unrenderable image, so nothing is silently lost', () => {
    const { images } = serializeToLatex(parseMarkdown('![x](a.svg)'), DEFAULT_CONFIG)
    expect(images).toEqual([])
  })

  it('reports a repeated bad reference once rather than flooding the reader', () => {
    expect(diags('![a](x.svg)\n\n![a](x.svg)\n\n![a](x.svg)')).toHaveLength(1)
  })
})

describe('other blocks', () => {
  it('renders a block quote', () => {
    expect(tex('> quoted')).toBe('\\begin{quote}\nquoted\n\\end{quote}')
  })

  it('renders a thematic break as a visual rule', () => {
    expect(tex('---\n')).toContain('\\rule')
  })

  it('inlines a footnote at its reference site', () => {
    const out = tex('Text.[^1]\n\n[^1]: The note.')
    expect(out).toContain('\\footnote{The note.}')
  })

  // Angle brackets need no escaping: XeTeX with fontspec renders them as
  // themselves, unlike classic OT1-encoded LaTeX where they become inverted
  // punctuation. Verified against a real xelatex compile.
  // Quotes curl because the HTML is being typeset as prose, not as code — if a
  // reader wants it verbatim, a fenced code block is the construct for that.
  it('carries raw HTML through as literal text and says so', () => {
    const md = '<div class="x">hi</div>'
    expect(tex(md)).toBe('<div class=”x”>hi</div>')
    expect(diags(md).map((d) => d.kind)).toContain('raw-html')
  })
})

describe('document shape', () => {
  it('separates blocks with a blank line so the .tex stays readable', () => {
    expect(tex('# A\n\nBody.')).toBe('\\section{A}\n\nBody.')
  })

  it('drops frontmatter from the body, since it becomes metadata', () => {
    expect(tex('---\ntitle: T\n---\n\nBody.')).toBe('Body.')
  })

  it('produces an empty body for empty input rather than failing', () => {
    expect(tex('')).toBe('')
  })

  // "A great deal of Markdown in the wild is a flat wall of paragraphs."
  it('handles a document with no headings at all', () => {
    expect(tex('One.\n\nTwo.')).toBe('One.\n\nTwo.')
  })
})

describe('link footnotes', () => {
  const md = 'See [the notes](https://example.com/notes).\n'

  it('reproduces the target as a footnote by default, for print', () => {
    const { body } = serializeToLatex(parseMarkdown(md), DEFAULT_CONFIG)
    expect(body).toContain('\\footnote{\\url{https://example.com/notes}}')
  })

  it('omits the footnote when the document is for the screen', () => {
    const config = { ...DEFAULT_CONFIG, links: { footnoteUrls: false } }
    const { body } = serializeToLatex(parseMarkdown(md), config)
    expect(body).toContain('\\href{https://example.com/notes}{the notes}')
    expect(body).not.toContain('\\footnote')
  })

  it('never footnotes a bare URL, which already shows its target', () => {
    const config = { ...DEFAULT_CONFIG, links: { footnoteUrls: true } }
    const { body } = serializeToLatex(parseMarkdown('<https://example.com>\n'), config)
    expect(body).not.toContain('\\footnote')
  })
})

describe('images the reader has not attached', () => {
  it('shows a gap rather than emitting a picture the engine cannot load', () => {
    // \includegraphics on a missing file stops the WHOLE document with
    // "Unable to load picture", so a manuscript pasted in from elsewhere would
    // fail to render entirely rather than losing one figure.
    const { body, images, diagnostics } = serializeToLatex(
      parseMarkdown('![A chart](chart.png)'),
      DEFAULT_CONFIG,
      new Set<string>(),
    )
    expect(body).not.toContain('\\includegraphics')
    expect(body).toContain('Figure not included')
    expect(images).toEqual([])
    expect(diagnostics[0].message).toContain('has not been added')
  })

  it('draws the ones it does hold', () => {
    const { body, images } = serializeToLatex(
      parseMarkdown('![a](have.png)\n\n![b](missing.png)'),
      DEFAULT_CONFIG,
      new Set(['have.png']),
    )
    expect(body).toContain('{have.png}')
    expect(body).not.toContain('{missing.png}')
    expect(images).toEqual(['have.png'])
  })

  it('assumes present when the caller cannot say', () => {
    // The bundle builder and most tests have no store to consult.
    const { images } = serializeToLatex(parseMarkdown('![a](x.png)'), DEFAULT_CONFIG)
    expect(images).toEqual(['x.png'])
  })
})
