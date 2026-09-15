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
    expect(tex).not.toContain('\\chapter*')
    expect(tex).not.toContain('\\section*')
    expect(tex).not.toContain('\\addcontentsline')
    expect(tex).not.toContain('\\backmatter')
  })

  it('raises no structure diagnostics', () => {
    const { diagnostics } = convert(SOURCE, asReader(SOURCE))
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

# The Illusion of Truth

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
    expect(tex).toContain('\\chapter{The Illusion of Truth}')
    expect(tex.indexOf('\\mainmatter')).toBeLessThan(
      tex.indexOf('\\chapter{The Illusion of Identity}'),
    )
    expect(tex.indexOf('\\chapter*{Introduction')).toBeLessThan(
      tex.indexOf('\\mainmatter'),
    )
  })

  it('opens back matter before the closing parts', () => {
    const tex = render()
    expect(tex.indexOf('\\backmatter')).toBeGreaterThan(
      tex.indexOf('\\chapter{The Illusion of Truth}'),
    )
    expect(tex.indexOf('\\backmatter')).toBeLessThan(tex.indexOf("Author's Note"))
    expect(tex).toContain("\\chapter*{Author's Note}")
    expect(tex).toContain('\\chapter*{About the Author}')
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
