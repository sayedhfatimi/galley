import { describe, expect, it } from 'vitest'
import { type GalleyConfig, presetFor } from '../config'
import { convert, readFrontmatter } from './document'

/**
 * The configuration a reader actually has, not a synthetic one.
 *
 * Deliberately NOT `{ ...DEFAULT_CONFIG, character: 'book' }`. `DEFAULT_CONFIG`
 * describes an *article*, so it leaves the contents page switched off; choosing
 * Book in the dialog applies `presetFor('book')`, which turns it on. And
 * `convert` reads the title from `config.metadata`, never from the document —
 * the frontmatter merge happens in the UI, through `applyFrontmatter`.
 *
 * An acceptance test that skips either step is asserting against a setup no
 * reader ever has, which is how a test comes to pass while the product is
 * broken. Deriving `metadata` from the source keeps the two in step.
 */
const asReader = (source: string, over: Partial<GalleyConfig> = {}): GalleyConfig => ({
  ...presetFor('book'),
  metadata: readFrontmatter(source),
  ...over,
})

/**
 * The compatibility contract. galley is live and holds readers' work; a
 * document that says nothing about structure must come out exactly as it did
 * before structure existed.
 */
describe('documents without a structure block', () => {
  const SOURCE = `---
title: An Ordinary Book
author: A Writer
---

# First Chapter

Body text with *emphasis* and a footnote.[^a]

## A Section

More body.

# Second Chapter

Closing.

[^a]: The note.
`

  it('opens the divisions exactly where it always did', () => {
    const { tex } = convert(SOURCE, asReader(SOURCE))
    const order = [
      '\\frontmatter',
      '\\maketitle',
      // Regression: the contents push was moved from before \mainmatter to
      // after the body, which typesets it outside front matter, at the end
      // of the book. Pinning its position here is the only place in the repo
      // that does so.
      '\\tableofcontents',
      '\\mainmatter',
      '\\chapter{First Chapter}',
      '\\section{A Section}',
      '\\chapter{Second Chapter}',
    ]
    let last = -1
    for (const marker of order) {
      const at = tex.indexOf(marker)
      expect(at, `${marker} is missing`).toBeGreaterThan(-1)
      expect(at, `${marker} is out of order`).toBeGreaterThan(last)
      last = at
    }
  })

  it('stars nothing and adds no contents entries by hand', () => {
    const { tex } = convert(SOURCE, asReader(SOURCE))
    // Anchor: every assertion below is negative, so all of them would pass
    // against an empty string. Confirm convert actually produced a document.
    expect(tex).toContain('\\end{document}')
    expect(tex).not.toContain('\\chapter*')
    // Not currently reachable: no implementation stars a section today. Kept
    // as a forward guard against unnumbering sections by starring them, the
    // design this project explicitly rejected in favour of secnumdepth.
    expect(tex).not.toContain('\\section*')
    expect(tex).not.toContain('\\addcontentsline')
    expect(tex).not.toContain('\\backmatter')
  })

  it('raises no structure diagnostics', () => {
    const { tex, diagnostics } = convert(SOURCE, asReader(SOURCE))
    // Anchor: an empty diagnostics array would also result from a conversion
    // that produced nothing at all. Confirm a document was actually built.
    expect(tex).toContain('\\end{document}')
    expect(diagnostics.filter((d) => d.kind.startsWith('structure-'))).toEqual([])
  })
})

/**
 * The reference manuscript. The published book sets Copyright at roman i and
 * absent from the contents, Dedication through Introduction unnumbered and
 * listed, "The Illusion of Identity" as Chapter 1 at arabic 1, sections
 * unnumbered, and "Introduction" as the contents entry for a much longer
 * heading. Reproducing that is what Phase 1 is for.
 */
describe('the reference book', () => {
  const SOURCE = `---
title: The Philosophy of Illusions
subtitle: Beyond the Throne, Beneath the Veil
author: Sayed Hamid Fatimi
structure:
  Copyright: { role: front, listed: false }
  Dedication: { role: front }
  Foreword: { role: front }
  Preface: { role: front }
  The Stage and the Veil: { role: front }
  "Introduction: Reality is a Stage, Illusion is the Script":
    role: front
    toc_title: Introduction
  The Illusion of Truth & Power:
    role: main
    toc_title: Truth & Power
  Author's Note: { role: back }
  Acknowledgements: { role: back }
  About the Author: { role: back }
---

# Copyright

Copyright 2025.

# Dedication

To my mother.

# Foreword

It emerged from fracture.

# Preface

A note before beginning.

# The Stage and the Veil

An epigraph.

# Introduction: Reality is a Stage, Illusion is the Script

We are born onto a stage already in motion.

# The Illusion of Identity

## The Self We Inherit

Body.

# The Illusion of Truth & Power

## The Myth of Objective Truth

Body.

# Author's Note

A closing note.

# Acknowledgements

Thanks.

# About the Author

A writer and thinker.
`

  const render = () =>
    convert(SOURCE, asReader(SOURCE, { sections: { numbered: false } })).tex

  it('sets every front matter part unnumbered', () => {
    const tex = render()
    for (const part of [
      'Copyright',
      'Dedication',
      'Foreword',
      'Preface',
      'The Stage and the Veil',
    ]) {
      expect(tex).toContain(`\\chapter*{${part}}`)
    }
    expect(tex).toContain(
      '\\chapter*{Introduction: Reality is a Stage, Illusion is the Script}',
    )
  })

  it('keeps Copyright out of the contents and everything else in', () => {
    const tex = render()
    expect(tex).not.toContain('\\addcontentsline{toc}{chapter}{Copyright}')
    expect(tex).toContain('\\addcontentsline{toc}{chapter}{Dedication}')
    expect(tex).toContain('\\addcontentsline{toc}{chapter}{Foreword}')
    expect(tex).toContain('\\addcontentsline{toc}{chapter}{Introduction}')
  })

  it('numbers the real first chapter and nothing before it', () => {
    const tex = render()
    expect(tex).toContain('\\chapter{The Illusion of Identity}')
    // Renamed with a toc_title (see the fixture-coverage tests below), so the
    // plain \chapter{...} form no longer appears for it — this is now
    // \chapter[{short}]{full}.
    expect(tex).toContain('\\chapter[{Truth \\& Power}]{The Illusion of Truth \\& Power}')
    expect(tex.indexOf('\\mainmatter')).toBeLessThan(
      tex.indexOf('\\chapter{The Illusion of Identity}'),
    )
    expect(tex.indexOf('\\chapter*{Introduction')).toBeLessThan(
      tex.indexOf('\\mainmatter'),
    )
    // Regression: document.ts:68 mutated to `if (matter && !ownsMatterDivisions)`
    // dropped \frontmatter entirely whenever the body owns its own
    // \mainmatter/\backmatter — which every document declaring front matter
    // does. That would set Copyright at arabic page 1 instead of roman i, the
    // exact property this reference-book comparison exists to prove.
    expect(tex).toContain('\\frontmatter')
    expect(tex.indexOf('\\frontmatter')).toBeLessThan(
      tex.indexOf('\\chapter*{Copyright}'),
    )
  })

  it('opens back matter before the closing parts', () => {
    const tex = render()
    expect(tex.indexOf('\\backmatter')).toBeGreaterThan(
      tex.indexOf('\\chapter[{Truth \\& Power}]{The Illusion of Truth \\& Power}'),
    )
    expect(tex.indexOf('\\backmatter')).toBeLessThan(tex.indexOf("Author's Note"))
    expect(tex).toContain("\\chapter*{Author's Note}")
    expect(tex).toContain('\\chapter*{About the Author}')
  })

  it('opens \\mainmatter and \\backmatter exactly once, not once per part', () => {
    // Regression: deleting the `if (role === this.#openRole) return ''` guard
    // in serialize.ts makes every subsequent part of the SAME role re-emit its
    // transition command — here, the second main-matter chapter re-emitting
    // \mainmatter, which restarts arabic page numbering mid-book. indexOf only
    // ever finds the first occurrence, so only a count catches this.
    const tex = render()
    expect(tex.match(/\\mainmatter/g)).toHaveLength(1)
    expect(tex.match(/\\backmatter/g)).toHaveLength(1)
  })

  it('gives a numbered part its own short contents title', () => {
    // Regression coverage: the fixture previously gave toc_title only to
    // unnumbered parts, so \chapter[{short}]{full} — and the brace guard that
    // stops a ']' in the short title spilling the chapter title into running
    // text (serialize.ts, next to this form) — was never exercised.
    const tex = render()
    expect(tex).toContain('\\chapter[{Truth \\& Power}]{The Illusion of Truth \\& Power}')
  })

  it('escapes an ampersand the same way in the heading and its short title', () => {
    // Heading text reaches \chapter{...} through #inline; a short/contents
    // title reaches its argument through escapeText directly. Two separate
    // call sites that must agree on escaping — this is the only heading in
    // the fixture with a character that needs it.
    const tex = render()
    expect(tex).toContain('The Illusion of Truth \\& Power') // the \chapter argument, via #inline
    expect(tex).toContain('Truth \\& Power') // the short title, via escapeText
    expect(tex).not.toContain('The Illusion of Truth & Power') // unescaped would be a raw & in LaTeX
  })

  it('leaves sections unnumbered throughout', () => {
    // Unnumbered sections come from the preamble, not from starred commands:
    // \section* writes nothing to the .toc and would silently empty a contents
    // page the reader asked for. secnumdepth unnumbers them and keeps the
    // entries. So the sectioning commands here are the ORDINARY ones.
    const tex = render()
    expect(tex).toContain('\\setcounter{secnumdepth}{0}')
    expect(tex).toContain('\\section{The Self We Inherit}')
    expect(tex).toContain('\\section{The Myth of Objective Truth}')
    expect(tex).not.toContain('\\section*')
  })

  it('raises no structure diagnostics, because every entry matches', () => {
    const { diagnostics } = convert(
      SOURCE,
      asReader(SOURCE, { sections: { numbered: false } }),
    )
    expect(diagnostics.filter((d) => d.kind.startsWith('structure-'))).toEqual([])
  })
})
