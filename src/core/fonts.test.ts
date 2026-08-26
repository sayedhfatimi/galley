import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  allFontFiles,
  DEFAULT_TYPEFACE,
  findScriptGaps,
  previewFamily,
  TYPEFACE_NAMES,
  TYPEFACES,
  typefaceOrDefault,
} from './fonts'

describe('the typeface registry', () => {
  it.each(TYPEFACE_NAMES)('%s declares a complete set of faces', (name) => {
    const t = TYPEFACES[name]
    for (const group of [t.serif, t.sans, t.mono]) {
      // A face named but absent is a hard XeTeX stop, so every key that is
      // present must look like a real filename rather than a family name.
      for (const file of [group.regular, group.bold, group.italic]) {
        expect(file).toMatch(/^[\w-]+\.otf$/)
      }
      if (group.boldItalic) expect(group.boldItalic).toMatch(/^[\w-]+\.otf$/)
    }
    expect(t.label).toBeTruthy()
    expect(t.hint).toBeTruthy()
  })

  it('defaults to Latin Modern, so existing documents are unchanged', () => {
    expect(DEFAULT_TYPEFACE).toBe('latin-modern')
    expect(TYPEFACES[DEFAULT_TYPEFACE].serif.regular).toBe('lmroman10-regular.otf')
  })

  it('records that only Latin Modern lacks Greek', () => {
    // Measured with fc-query: every TeX Gyre face covers all 25 of U+03B1..
    // U+03C9 and every Latin Modern face covers none of them.
    expect(TYPEFACES['latin-modern'].greek).toBe(false)
    for (const name of TYPEFACE_NAMES.filter((n) => n !== 'latin-modern')) {
      expect(TYPEFACES[name].greek).toBe(true)
    }
  })

  it('falls back rather than throwing on an unknown or absent typeface', () => {
    // A config persisted before the field existed arrives undefined.
    expect(typefaceOrDefault(undefined).label).toBe(TYPEFACES[DEFAULT_TYPEFACE].label)
  })

  it('lists every face exactly once', () => {
    const files = allFontFiles()
    expect(new Set(files).size).toBe(files.length)
    expect(files.length).toBeGreaterThan(30)
  })
})

describe('findScriptGaps', () => {
  const lm = TYPEFACES['latin-modern']
  const pagella = TYPEFACES.pagella

  it('reports Greek only when the typeface cannot set it', () => {
    expect(findScriptGaps('Ωμέγα', lm).map((g) => g.script)).toEqual(['Greek'])
    expect(findScriptGaps('Ωμέγα', pagella)).toEqual([])
  })

  it('marks Greek fixable, because choosing another typeface solves it', () => {
    expect(findScriptGaps('Ωμέγα', lm)[0].fixable).toBe(true)
  })

  it('reports scripts no typeface covers as unfixable', () => {
    const gaps = findScriptGaps('Привет', pagella)
    expect(gaps.map((g) => g.script)).toEqual(['Cyrillic'])
    expect(gaps[0].fixable).toBe(false)
  })

  it('leaves ordinary Latin text alone, accents included', () => {
    expect(findScriptGaps('Chloë Ångström, José — naïve', lm)).toEqual([])
  })

  it('quotes the offending characters back, without repeating them', () => {
    const gap = findScriptGaps('ααββ', lm)[0]
    expect(gap.sample).toBe('αβ')
  })

  it('groups one entry per script rather than one per character', () => {
    expect(findScriptGaps('Ωμέγα Привет', lm)).toHaveLength(2)
  })
})

/**
 * The menu previews each typeface in its own face, using the same OTF the TeX
 * engine will fetch. That only works while the stylesheet and the registry
 * agree, and nothing else would notice them drifting apart — a new typeface
 * would simply preview in the fallback serif and look like a rendering quirk.
 */
describe('preview faces', () => {
  const css = readFileSync(join(import.meta.dirname, '../index.css'), 'utf8')

  it.each(TYPEFACE_NAMES)('declares an @font-face for %s', (name) => {
    expect(css).toContain(`font-family: "${previewFamily(name)}"`)
    // Pointed at the real bundled file, not a lookalike.
    expect(css).toContain(`/texlive/${TYPEFACES[name].serif.regular}`)
  })

  it('gives every typeface a distinct preview family', () => {
    const families = TYPEFACE_NAMES.map(previewFamily)
    expect(new Set(families).size).toBe(families.length)
  })
})
