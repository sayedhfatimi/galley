import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type GalleyConfig, presetFor } from '../config'
import { allFontFiles, TYPEFACE_NAMES } from '../fonts'
import { buildPreamble } from './preamble'

const cfg = (over: Partial<GalleyConfig> = {}): GalleyConfig => ({
  ...DEFAULT_CONFIG,
  ...over,
})

describe('buildPreamble', () => {
  it('opens with the document class for the chosen character', () => {
    // oneside is redundant for article, but stated explicitly so a reader of the
    // .tex can see the choice rather than having to know the class default.
    expect(buildPreamble(cfg({ character: 'article' }))).toContain(
      '\\documentclass[11pt,oneside]{article}',
    )
    expect(buildPreamble(cfg({ character: 'book' }))).toMatch(
      /\\documentclass\[[^\]]*\]\{book\}/,
    )
  })

  it('passes twoside only when two-sided layout is on', () => {
    expect(buildPreamble(cfg({ twoSided: true }))).toMatch(
      /\\documentclass\[[^\]]*twoside/,
    )
    expect(buildPreamble(cfg({ twoSided: false }))).not.toContain('twoside')
  })

  it('carries the chosen base font size into the class options', () => {
    expect(buildPreamble(cfg({ fontSize: 12 }))).toContain('12pt')
  })

  // The spike found this: without Ligatures=TeX, fontspec leaves `` and ---
  // unconverted, so curly quotes and em dashes never appear. For a tool whose
  // claim is typographic quality that is a shipping blocker.
  it('enables TeX ligatures on the main font', () => {
    const out = buildPreamble(cfg())
    expect(out).toContain('Ligatures=TeX')
  })

  it('loads fonts by filename, since there is no fontconfig in a browser', () => {
    const out = buildPreamble(cfg())
    expect(out).toContain('lmroman10-regular.otf')
    expect(out).toContain('BoldFont=lmroman10-bold.otf')
    expect(out).not.toMatch(/\\setmainfont\{Latin Modern/)
  })

  // Also from the spike: TeX Live 2026's microtype needs \partokencontext,
  // which the 2022 XeTeX binary does not have.
  it('does not load microtype while the v1 engine cannot run it', () => {
    expect(buildPreamble(cfg())).not.toContain('microtype')
  })

  it('loads xltabular rather than relying on longtable for X columns', () => {
    const out = buildPreamble(cfg())
    expect(out).toContain('\\usepackage{xltabular}')
  })

  // Caught by compiling rather than by string-matching: breaklines is an
  // fvextra option, so bare fancyvrb fails with "keyval Error: breaklines
  // undefined" even though the emitted string looked correct.
  it('loads fvextra, which is what provides breaklines on Verbatim', () => {
    expect(buildPreamble(cfg())).toContain('\\usepackage{fvextra}')
  })

  describe('geometry', () => {
    it('emits explicit dimensions for a named size', () => {
      const out = buildPreamble(cfg({ paper: { kind: 'named', name: 'a4' } }))
      expect(out).toContain('paperwidth=210mm')
      expect(out).toContain('paperheight=297mm')
    })

    it('emits custom dimensions with their unit', () => {
      const out = buildPreamble(
        cfg({ paper: { kind: 'custom', width: 6, height: 9, unit: 'in' } }),
      )
      expect(out).toContain('paperwidth=6in')
      expect(out).toContain('paperheight=9in')
    })

    it('uses inner/outer for two-sided and left/right for one-sided', () => {
      const two = buildPreamble(cfg({ twoSided: true }))
      expect(two).toContain('inner=')
      expect(two).toContain('outer=')

      const one = buildPreamble(cfg({ twoSided: false }))
      expect(one).toContain('left=')
      expect(one).toContain('right=')
      expect(one).not.toContain('inner=')
    })
  })

  describe('chapter behaviour', () => {
    it('passes openright when chapters are forced onto a recto', () => {
      const out = buildPreamble(presetFor('book'))
      expect(out).toMatch(/\\documentclass\[[^\]]*openright/)
    })

    it('passes openany when they are not', () => {
      const book = presetFor('book')
      book.chapters.forceRecto = false
      expect(buildPreamble(book)).toMatch(/\\documentclass\[[^\]]*openany/)
    })

    it('says nothing about chapter openings for an article', () => {
      const out = buildPreamble(cfg({ character: 'article' }))
      expect(out).not.toContain('openright')
      expect(out).not.toContain('openany')
    })
  })

  describe('line spacing', () => {
    it.each([
      ['onehalf', '\\onehalfspacing'],
      ['double', '\\doublespacing'],
    ] as const)('applies %s', (spacing, command) => {
      expect(buildPreamble(cfg({ lineSpacing: spacing }))).toContain(command)
    })

    it('emits no spacing command for single, which is the class default', () => {
      const out = buildPreamble(cfg({ lineSpacing: 'single' }))
      expect(out).not.toContain('\\onehalfspacing')
      expect(out).not.toContain('\\doublespacing')
    })
  })

  describe('metadata', () => {
    it('escapes special characters in the title', () => {
      const out = buildPreamble(cfg({ metadata: { title: 'Profit & Loss: 100% of it' } }))
      expect(out).toContain('Profit \\& Loss: 100\\% of it')
    })

    it('omits the title block entirely when there is no metadata', () => {
      expect(buildPreamble(cfg({ metadata: {} }))).not.toContain('\\title{')
    })

    it('folds a subtitle into the title', () => {
      const out = buildPreamble(
        cfg({ metadata: { title: 'Main', subtitle: 'Secondary' } }),
      )
      expect(out).toContain('Main')
      expect(out).toContain('Secondary')
    })
  })

  describe('table of contents', () => {
    it('sets tocdepth when a contents list is requested', () => {
      expect(buildPreamble(cfg({ toc: { include: true, depth: 3 } }))).toContain(
        '\\setcounter{tocdepth}{3}',
      )
    })

    it('sets no tocdepth when it is not', () => {
      expect(buildPreamble(cfg({ toc: { include: false, depth: 2 } }))).not.toContain(
        'tocdepth',
      )
    })
  })

  it('is written for a human reader: commented and not run together', () => {
    const out = buildPreamble(presetFor('book'))
    expect(
      out.split('\n').filter((l) => l.trim().startsWith('%')).length,
    ).toBeGreaterThan(4)
    expect(out).toContain('\n\n')
  })

  // A face named in the preamble but absent from the bundle is not a degraded
  // render, it is a hard stop: XeTeX reports "Font ... not loadable" and no PDF
  // is produced. That is how the sans family was missed — nothing selects it
  // from Markdown, so only \mathsf reached it, and only in a compiled document.
  // Every typeface in the menu, not just the default: a reader can select any
  // of them, and a face missing from the bundle fails only in their browser.
  it.each(TYPEFACE_NAMES)('names only fonts the bundle ships (%s)', (typeface) => {
    const bundle = join(import.meta.dirname, '../../../public/texlive')
    const shipped = new Set(readdirSync(bundle))
    const named = new Set(
      [...buildPreamble(cfg({ typeface })).matchAll(/[\w-]+\.otf/g)].map((m) => m[0]),
    )
    expect(named.size).toBeGreaterThan(0)
    expect([...named].filter((f) => !shipped.has(f))).toEqual([])
  })

  // The registry is what the bundle script copies from, so anything it can
  // name must be shipped even if no preamble happens to mention it.
  it('ships every face the registry can reach', () => {
    const bundle = join(import.meta.dirname, '../../../public/texlive')
    const shipped = new Set(readdirSync(bundle))
    expect(allFontFiles().filter((f) => !shipped.has(f))).toEqual([])
  })

  it('omits BoldItalicFont for a family that has no such face', () => {
    // Latin Modern Mono has none. Naming one that does not exist is a hard stop.
    const mono = buildPreamble(cfg({ typeface: 'latin-modern' }))
      .split('\\setmonofont')[1]
      .split(']')[0]
    expect(mono).not.toContain('BoldItalicFont')
    expect(mono).toContain('BoldFont=lmmonolt10-bold.otf')
  })

  it('sets every family from the chosen typeface', () => {
    const out = buildPreamble(cfg({ typeface: 'pagella' }))
    expect(out).toContain('\\setmainfont{texgyrepagella-regular.otf}')
    expect(out).toContain('\\setsansfont{texgyreheros-regular.otf}')
    expect(out).toContain('\\setmonofont{texgyrecursor-regular.otf}')
    expect(out).not.toContain('lmroman')
  })

  it('loads hyperref last, as hyperref requires', () => {
    const out = buildPreamble(cfg())
    const packages = [...out.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)].map(
      (m) => m[1],
    )
    expect(packages.at(-1)).toBe('hyperref')
  })
})
