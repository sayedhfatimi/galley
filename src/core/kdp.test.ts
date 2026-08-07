import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type GalleyConfig, presetFor } from './config'
import {
  bandFor,
  checkCompliance,
  EDGE_MINIMUM_IN,
  GUTTER_BANDS,
  kdpMargins,
  MAX_PAGES,
} from './kdp'

const book = (over: Partial<GalleyConfig> = {}): GalleyConfig => ({
  ...presetFor('book'),
  ...over,
})

describe('gutter bands', () => {
  it.each([
    [1, 0.375],
    [150, 0.375],
    [151, 0.5],
    [300, 0.5],
    [301, 0.625],
    [500, 0.625],
    [501, 0.75],
    [700, 0.75],
    [701, 0.875],
    [828, 0.875],
  ])('a %i page book needs a %f in inside margin', (pages, inches) => {
    expect(bandFor(pages).inches).toBe(inches)
  })

  // A book over the printable limit still has to report a gutter rather than
  // undefined; the page count itself is reported as the problem.
  it('clamps beyond the largest band rather than falling off the end', () => {
    expect(bandFor(5000).inches).toBe(GUTTER_BANDS.at(-1)?.inches)
  })
})

describe('kdpMargins', () => {
  it('meets the inside requirement for the band it is built for', () => {
    for (const b of GUTTER_BANDS) {
      const m = kdpMargins(b.maxPages)
      expect(m.unit).toBe('in')
      expect(m.inner).toBeGreaterThanOrEqual(b.inches)
    }
  })

  it('clears the edge minimum on every side', () => {
    const m = kdpMargins(150)
    for (const v of [m.top, m.bottom, m.outer]) {
      expect(v).toBeGreaterThanOrEqual(EDGE_MINIMUM_IN)
    }
  })

  it('produces a compliant document at the page count it was built for', () => {
    for (const b of GUTTER_BANDS) {
      const config = book({ margins: kdpMargins(b.maxPages), twoSided: true })
      expect(checkCompliance(config, b.maxPages)).toEqual([])
    }
  })
})

describe('checkCompliance', () => {
  // The whole point of the post-render check: margins built for a short book
  // are silently wrong once it grows past the band.
  it('catches a gutter that was correct until the book got longer', () => {
    const config = book({ margins: kdpMargins(150), twoSided: true })
    expect(checkCompliance(config, 150)).toEqual([])
    const problems = checkCompliance(config, 151)
    expect(problems).toHaveLength(1)
    expect(problems[0]?.message).toContain('0.5 in')
  })

  it('converts millimetre margins before comparing', () => {
    const config = book({
      // 0.3 in inner, below the 0.375 in floor, expressed in mm.
      margins: { top: 20, bottom: 20, inner: 7.62, outer: 20, unit: 'mm' },
      twoSided: true,
    })
    expect(checkCompliance(config, 100)).not.toEqual([])
  })

  it('accepts a compliant millimetre document', () => {
    const config = book({
      margins: { top: 15, bottom: 15, inner: 12, outer: 15, unit: 'mm' },
      twoSided: true,
    })
    expect(checkCompliance(config, 100)).toEqual([])
  })

  it('flags a one-sided document', () => {
    const config = book({ margins: kdpMargins(150), twoSided: false })
    expect(
      checkCompliance(config, 100)
        .map((p) => p.message)
        .join(' '),
    ).toContain('two-sided')
  })

  it('flags a book past the printable limit', () => {
    const config = book({ margins: kdpMargins(MAX_PAGES), twoSided: true })
    expect(
      checkCompliance(config, MAX_PAGES + 1).some((p) => p.message.includes('at most')),
    ).toBe(true)
  })

  it('flags the default article, which is not a printable book', () => {
    expect(checkCompliance(DEFAULT_CONFIG, 100)).not.toEqual([])
  })
})
