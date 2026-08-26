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

  it('reports Greek letters only when the typeface cannot set them', () => {
    // Unaccented letters: absent from Latin Modern, present in every TeX Gyre.
    expect(findScriptGaps('ΩΜΕΓΑ', lm).map((g) => g.script)).toEqual(['Greek'])
    expect(findScriptGaps('ΩΜΕΓΑ', pagella)).toEqual([])
  })

  it('marks Greek letters fixable, because another typeface solves them', () => {
    expect(findScriptGaps('ΩΜΕΓΑ', lm)[0].fixable).toBe(true)
  })

  it('never claims an accented Greek letter is fixable', () => {
    // Measured with XeTeX: no bundled face has a single precomposed accented
    // form, so Ωμέγα is still incomplete in Pagella. Saying otherwise would be
    // the overclaim this diagnostic exists to prevent.
    const gaps = findScriptGaps('Ωμέγα', pagella)
    expect(gaps.map((g) => g.script)).toEqual(['Accented Greek'])
    expect(gaps[0].fixable).toBe(false)
    expect(gaps[0].sample).toBe('έ')
  })

  it('separates the fixable letters from the unfixable accents', () => {
    const gaps = findScriptGaps('Ωμέγα', lm)
    expect(gaps.map((g) => g.script).sort()).toEqual(['Accented Greek', 'Greek'])
    expect(gaps.find((g) => g.script === 'Greek')?.fixable).toBe(true)
    expect(gaps.find((g) => g.script === 'Accented Greek')?.fixable).toBe(false)
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

  it('records that only the unaccented letters are what a typeface fixes', () => {
    expect(TYPEFACES['latin-modern'].greek).toBe(false)
    expect(TYPEFACES.pagella.greek).toBe(true)
    // ...and that is a claim about Α–Ω and α–ω only.
    expect(findScriptGaps('άέήίόύώ', TYPEFACES.pagella)).toHaveLength(1)
  })

  it('groups one entry per script rather than one per character', () => {
    // Greek letters, the accent, and Cyrillic — three, not one per character.
    expect(findScriptGaps('Ωμέγα Привет', lm)).toHaveLength(3)
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
