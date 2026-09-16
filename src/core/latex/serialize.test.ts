import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type GalleyConfig, presetFor } from '../config'
import { parseMarkdown } from '../markdown/parse'
import { type SerializePart, serializeParts, serializeToLatex } from './serialize'

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

describe('part structure', () => {
  const book = (source: string, over: Partial<GalleyConfig> = {}) =>
    tex(source, { character: 'book', ...over })

  it('numbers a chapter by default, exactly as before', () => {
    expect(book('# A Chapter\n')).toContain('\\chapter{A Chapter}')
    expect(book('# A Chapter\n')).not.toContain('\\chapter*')
  })

  // A contents page has to be requested for \addcontentsline to be worth
  // writing at all — see Fix 8 below — so these part/toc tests turn one on.
  const withToc = { toc: { include: true, depth: 1 } }

  it('stars an unnumbered part and lists it by hand', () => {
    const tex = book(
      '---\nstructure:\n  Dedication: { role: front }\n---\n\n# Dedication\n\nTo my mother.\n',
      withToc,
    )
    expect(tex).toContain('\\chapter*{Dedication}')
    expect(tex).toContain('\\addcontentsline{toc}{chapter}{Dedication}')
  })

  it('omits the contents entry when a part is unlisted, even with a contents page', () => {
    const tex = book(
      '---\nstructure:\n  Copyright: { role: front, listed: false }\n---\n\n# Copyright\n\n(c) 2026.\n',
      withToc,
    )
    expect(tex).toContain('\\chapter*{Copyright}')
    expect(tex).not.toContain('\\addcontentsline')
  })

  it('uses the short title in the contents and the full one in the heading', () => {
    const tex = book(
      '---\nstructure:\n  "Introduction: Reality is a Stage": { role: front, toc_title: Introduction }\n---\n\n# Introduction: Reality is a Stage\n',
      withToc,
    )
    expect(tex).toContain('\\chapter*{Introduction: Reality is a Stage}')
    expect(tex).toContain('\\addcontentsline{toc}{chapter}{Introduction}')
  })

  it('escapes a contents entry, which is LaTeX like any other argument', () => {
    const tex = book(
      '---\nstructure:\n  Cost: { role: front, toc_title: "100% & rising" }\n---\n\n# Cost\n',
      withToc,
    )
    expect(tex).toContain('\\addcontentsline{toc}{chapter}{100\\% \\& rising}')
  })

  it('diagnoses an entry that matches no heading rather than ignoring it', () => {
    // "Dedicaton" is a deliberate misspelling: this is what a retitled heading
    // looks like from the structure block's point of view.
    const found = diags(
      '---\nstructure:\n  Dedicaton: { role: front }\n---\n\n# Dedication\n',
      { character: 'book' },
    ).find((d) => d.kind === 'structure-unmatched')
    expect(found).toBeDefined()
    expect(found?.detail).toBe('Dedicaton')
  })

  it('ignores roles in an article and says so, but still honours numbering', () => {
    const source = '---\nstructure:\n  Preface: { role: front }\n---\n\n# Preface\n'
    const body = tex(source, { character: 'article' })
    expect(body).toContain('\\section*{Preface}')
    expect(body).not.toContain('\\frontmatter')
    expect(
      diags(source, { character: 'article' }).some((d) => d.kind === 'structure-ignored'),
    ).toBe(true)
  })

  // ---- Fix 1: only a ROOT-level heading is a part ----

  it('does not treat a blockquoted heading as a part (Fix 1)', () => {
    // Obsidian callouts are blockquotes, so `> # …` is reachable from an
    // ordinary paste. Before the fix this heading matched the structure map
    // by text, opened \mainmatter INSIDE the quote environment, and latched
    // the open role so the real chapter after it got no transition at all.
    const source =
      '---\nstructure:\n  Notes: { role: back }\n---\n\n> # A quoted headline\n\n# Real Chapter\n\n# Notes\n'
    const body = tex(source, { character: 'book' })
    // The quoted heading is an ordinary, unstarred chapter — no part lookup,
    // no transition — typeset where it sits, inside the quote.
    expect(body).toContain('\\begin{quote}\n\\chapter{A quoted headline}\n\\end{quote}')
    // The real chapter after it still gets \mainmatter: the whole point.
    expect(body).toContain('\\mainmatter\n\n\\chapter{Real Chapter}')
    expect(body.indexOf('\\mainmatter')).toBeGreaterThan(body.indexOf('\\end{quote}'))
  })

  // ---- Fix 2: an out-of-order part still opens its division ----

  it('still opens each division when parts are declared out of matter order (Fix 2)', () => {
    // book.cls's \backmatter clears \@mainmatterfalse WITHOUT restoring
    // \pagenumbering{arabic}, so returning '' for the transition here (the
    // old behaviour) left the chapter after it, and everything after THAT,
    // stuck in roman numerals with no chapter numbers at all. The diagnostic
    // still fires; the division still opens — document order is honoured,
    // not corrected.
    const source =
      '---\nstructure:\n  Afterword: { role: back }\n  Chapter One: { role: main }\n---\n\n# Afterword\n\n# Chapter One\n'
    expect(
      diags(source, { character: 'book' }).some((d) => d.kind === 'structure-order'),
    ).toBe(true)

    const body = tex(source, { character: 'book' })
    expect(body).toContain('\\backmatter\n\n\\chapter*{Afterword}')
    expect(body).toContain('\\mainmatter\n\n\\chapter{Chapter One}')
    // Still typeset in document order, not rearranged into book order.
    expect(body.indexOf('Afterword')).toBeLessThan(body.indexOf('Chapter One'))
  })

  // ---- Fix 3: \chapter[short]{long} for a numbered part with a tocTitle ----

  it('emits the short/long chapter form for a numbered part with a tocTitle (Fix 3)', () => {
    const source =
      '---\nstructure:\n  "Cost & Value": { toc_title: "100% Off" }\n---\n\n# Cost & Value\n'
    // Both arguments are LaTeX arguments and are escaped independently. The
    // optional argument carries its own brace guard — see the re-review
    // Fix 1 test below — which is inert here since the title has no ']'.
    expect(book(source)).toBe('\\chapter[{100\\% Off}]{Cost \\& Value}')
  })

  // ---- Fix 4: listed:false on a numbered part cannot be honoured ----

  it('diagnoses listed:false on a numbered part rather than silently ignoring it (Fix 4)', () => {
    const source =
      '---\nstructure:\n  Chapter One: { listed: false }\n---\n\n# Chapter One\n'
    const found = diags(source, { character: 'book' }).find(
      (d) => d.kind === 'structure-unlistable',
    )
    expect(found).toBeDefined()
    expect(found?.detail).toBe('Chapter One')
    // The setting does nothing: an unstarred \chapter always writes its own
    // contents entry (book.cls:361-362), so the output is the plain form.
    expect(book(source)).toBe('\\chapter{Chapter One}')
  })

  // ---- Fix 5: duplicate root-level headings share one PartSpec ----

  it('diagnoses two root headings that share a title (Fix 5)', () => {
    // Front, then main, then front again by TEXT — even though the second
    // "Notes" is meant as end matter, it shares the first Notes's PartSpec
    // and so re-opens front matter, which is also why structure-order fires
    // on a document that, in the writer's intent, is in perfect order.
    const source =
      '---\nstructure:\n  Notes: { role: front }\n  Chapter One: { role: main }\n---\n\n# Notes\n\n# Chapter One\n\n# Notes\n'
    const found = diags(source, { character: 'book' }).find(
      (d) => d.kind === 'structure-duplicate-heading',
    )
    expect(found).toBeDefined()
    expect(found?.detail).toBe('Notes')
  })

  // ---- Fix 6: ownsMatterDivisions reflects only parts that actually matched ----

  it('does not own the matter divisions when no declared part matches a heading (Fix 6)', () => {
    const source =
      '---\nstructure:\n  Preface: { role: front }\n---\n\nNo heading at all.\n'
    const result = serializeToLatex(parseMarkdown(source), {
      ...DEFAULT_CONFIG,
      character: 'book',
    })
    expect(result.ownsMatterDivisions).toBe(false)
  })

  // ---- Fix 7: secnumdepth, not starring, controls section numbering ----

  it('never stars a heading for section numbering, in any character (Fix 7)', () => {
    // Starring is gone from #heading entirely; secnumdepth in the preamble
    // (see preamble.test.ts) is the lever now.
    const source = '# Top\n\n## Sub\n\n### Subsub\n'
    for (const character of ['article', 'book'] as const) {
      expect(tex(source, { character, sections: { numbered: false } })).not.toContain('*')
    }
  })

  // ---- Fix 8: no \addcontentsline when the contents page is switched off ----

  it('omits \\addcontentsline entirely when there is no contents page to receive it (Fix 8)', () => {
    const source = '---\nstructure:\n  Dedication: { role: front }\n---\n\n# Dedication\n'
    const out = book(source, { toc: { include: false, depth: 2 } })
    expect(out).toContain('\\chapter*{Dedication}')
    expect(out).not.toContain('\\addcontentsline')
  })

  // ---- Re-review Fix 1: a ']' in a short title tears the chapter apart ----

  it('guards a short title containing "]" in braces so it cannot close the optional argument early (Fix 1)', () => {
    const source =
      '---\nstructure:\n  "Notes on Method": { toc_title: "Notes [Revised]" }\n---\n\n# Notes on Method\n'
    // Unguarded, \@chapter's optional-argument scanner would read up to the
    // FIRST ']' — the one inside the title — leaving "Notes on Method" typeset
    // as the chapter's opening paragraph rather than its heading. The [{...}]
    // guard keeps the whole bracketed title inside one brace group, so the
    // scanner only sees the outer ']'.
    expect(book(source)).toBe('\\chapter[{Notes [Revised]}]{Notes on Method}')
  })

  // ---- Re-review Fix 2: main -> front -> main must not double \mainmatter ----

  it('latches #openRole only when a transition actually opens a division (Fix 2)', () => {
    // The regression: `front` returned '' but still set #openRole = 'front',
    // so the SECOND `main` part looked like a role change and re-emitted
    // \mainmatter, calling \pagenumbering{arabic} a second time and
    // restarting the page counter mid-book.
    const source =
      '---\nstructure:\n  Chapter One: { role: main }\n  Preface: { role: front }\n  Chapter Two: { role: main }\n---\n\n# Chapter One\n\n# Preface\n\n# Chapter Two\n'
    const body = tex(source, { character: 'book' })
    expect(body.match(/\\mainmatter/g)?.length).toBe(1)
    expect(body).toContain('\\chapter{Chapter One}')
    expect(body).toContain('\\chapter*{Preface}')
    expect(body).toContain('\\chapter{Chapter Two}')
  })

  it('opens front, main and back exactly once each in document order (Fix 2)', () => {
    const source =
      '---\nstructure:\n  Notes: { role: front }\n  Afterword: { role: back }\n---\n\n# Notes\n\n# Chapter One\n\n# Afterword\n'
    const body = tex(source, { character: 'book' })
    expect(body.match(/\\mainmatter/g)?.length).toBe(1)
    expect(body.match(/\\backmatter/g)?.length).toBe(1)
  })

  it('still opens back then main exactly once each, per the previous fix (Fix 2)', () => {
    const source =
      '---\nstructure:\n  Afterword: { role: back }\n  Chapter One: { role: main }\n---\n\n# Afterword\n\n# Chapter One\n'
    const body = tex(source, { character: 'book' })
    expect(body.match(/\\backmatter/g)?.length).toBe(1)
    expect(body.match(/\\mainmatter/g)?.length).toBe(1)
  })

  // ---- Re-review Fix 3: a duplicated heading must not ALSO raise a false structure-order ----

  it('suppresses structure-order on a duplicated title, which is not out of order (Fix 3)', () => {
    // Notes (front), Chapter One (main), Notes (shares the first Notes's
    // front PartSpec by text) — correctly ordered from the writer's point of
    // view, but the repeated "Notes" looks like a front part written after a
    // main one unless the duplicate is accounted for.
    const source =
      '---\nstructure:\n  Notes: { role: front }\n---\n\n# Notes\n\n# Chapter One\n\n# Notes\n'
    const found = diags(source, { character: 'book' })
    expect(found.some((d) => d.kind === 'structure-duplicate-heading')).toBe(true)
    expect(found.some((d) => d.kind === 'structure-order')).toBe(false)
  })

  // ---- Re-review Fix 4: the unlistable/unmatched notices say "heading", not "chapter" ----

  it('calls it a heading, not a chapter, in an Article (Fix 4)', () => {
    const source = '---\nstructure:\n  Preface: { listed: false }\n---\n\n# Preface\n'
    const found = diags(source, { character: 'article' }).find(
      (d) => d.kind === 'structure-unlistable',
    )
    expect(found?.message).toContain('numbered heading always appears')
    expect(found?.message).not.toContain('chapter')
  })

  it('calls it a heading, not a chapter heading, in structure-unmatched (Fix 4)', () => {
    const source = '---\nstructure:\n  Dedicaton: { role: front }\n---\n\n# Dedication\n'
    const found = diags(source, { character: 'book' }).find(
      (d) => d.kind === 'structure-unmatched',
    )
    expect(found?.message).toContain('matches any heading')
    expect(found?.message).not.toContain('chapter')
  })
})

describe('serializeParts', () => {
  const book = presetFor('book')
  const part = (source: string, role: 'front' | 'main' | 'back') => ({
    tree: parseMarkdown(source),
    spec: { role, numbered: role === 'main', listed: true },
    path: `${role}.md`,
  })

  it('emits each matter division exactly once across many files', () => {
    const result = serializeParts(
      [
        part('# Copyright\n', 'front'),
        part('# Dedication\n', 'front'),
        part('# Chapter One\n', 'main'),
        part('# Chapter Two\n', 'main'),
        part('# About\n', 'back'),
      ],
      book,
    )
    expect(result.body.match(/\\mainmatter/g)).toHaveLength(1)
    expect(result.body.match(/\\backmatter/g)).toHaveLength(1)
    expect(result.ownsMatterDivisions).toBe(true)
    expect(result.body.indexOf('\\mainmatter')).toBeLessThan(
      result.body.indexOf('Chapter One'),
    )
  })

  it('applies each file’s own spec, not a heading-text lookup', () => {
    const result = serializeParts(
      [part('# Same Title\n', 'front'), part('# Same Title\n', 'main')],
      book,
    )
    // Front matter is unnumbered, main matter numbered: two headings with
    // identical text no longer share one setting.
    expect(result.body).toContain('\\chapter*{Same Title}')
    expect(result.body).toContain('\\chapter{Same Title}')
    expect(result.diagnostics.map((d) => d.kind)).not.toContain(
      'structure-duplicate-heading',
    )
  })

  /**
   * Parts built by cutting ONE parsed tree at its root headings.
   *
   * Deliberately NOT one `parseMarkdown` per part. A reference is resolved by
   * the PARSER, not by this serializer: micromark only emits a
   * `linkReference`/`footnoteReference` node for an identifier that is defined
   * in the same source, and an undefined one stays plain text (pinned by the
   * test below). So parsing per file produces parts that contain no reference
   * node at all, and a cross-file assertion over them would pass for a
   * serializer that never collected anything. Cutting one tree hands the
   * serializer the input this behaviour is actually about: a reference in one
   * part whose definition lives in another.
   */
  const cutAtChapters = (source: string): SerializePart[] => {
    const cut: SerializePart[] = []
    for (const node of parseMarkdown(source).children) {
      if (node.type === 'heading' && node.depth === 1) {
        cut.push({ tree: { type: 'root', children: [] }, path: `${cut.length}.md` })
      }
      cut.at(-1)?.tree.children.push(node)
    }
    return cut
  }

  it('collects link and footnote definitions across files', () => {
    // Catches collecting definitions per part DURING the walk rather than over
    // every part before it: the reference in the first part is then serialized
    // before the second part's definitions are known, and both fall back to
    // their bare text.
    const result = serializeParts(
      cutAtChapters(
        '# One\n\nSee [the site][ref].[^a]\n\n# Two\n\n[ref]: https://example.com\n\n[^a]: The note.\n',
      ),
      book,
    )
    expect(result.body).toContain('\\href{https://example.com}{the site}')
    expect(result.body).toContain('\\footnote{The note.}')
  })

  it('cannot resolve a reference across separately PARSED files', () => {
    // A known limitation of the stage before this one, pinned so the test
    // above is not mistaken for proof that the product resolves references
    // across chapters. It does not: a project parses each file on its own, and
    // micromark leaves an undefined reference as plain text, so no reference
    // node ever reaches the serializer. Closing this needs a change at the
    // PARSE stage (project-wide definitions made visible to every file), not
    // here. Delete this test when that lands.
    const result = serializeParts(
      [
        { tree: parseMarkdown('# One\n\nSee [the site][ref].\n'), path: 'a.md' },
        { tree: parseMarkdown('# Two\n\n[ref]: https://example.com\n'), path: 'b.md' },
      ],
      book,
    )
    expect(result.body).not.toContain('\\href')
    expect(result.body).toContain('See [the site][ref].')
  })

  it('diagnoses a part with no top-level heading', () => {
    const result = serializeParts(
      [
        {
          tree: parseMarkdown('Just prose.\n'),
          spec: { role: 'main', numbered: true, listed: true },
          path: 'orphan.md',
        },
      ],
      book,
    )
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ kind: 'project-part-headingless', file: 'orphan.md' }),
    )
  })

  it('diagnoses a part with more than one top-level heading', () => {
    const result = serializeParts(
      [
        {
          tree: parseMarkdown('# One\n\n# Two\n'),
          spec: { role: 'main', numbered: true, listed: true },
          path: 'two.md',
        },
      ],
      book,
    )
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        kind: 'project-part-multiple-headings',
        file: 'two.md',
      }),
    )
  })
})
