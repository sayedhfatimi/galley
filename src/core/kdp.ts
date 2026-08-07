import type { GalleyConfig, Margins, PaperName } from './config'

/**
 * Amazon KDP paperback print requirements.
 *
 * Source: KDP help topic GVBQ3CMEQW3W2VL6, "Format your paperback manuscript".
 * The numbers are theirs; the shape of the problem is ours.
 *
 * The awkward part is that **the required inside margin depends on the finished
 * page count**, which nobody knows until the document has been typeset. A
 * preset therefore cannot be correct on its own — it can only be correct for an
 * assumed length. So galley states the assumption, and checks it against the
 * real page count once the PDF exists rather than leaving the reader to
 * discover a rejected upload.
 *
 * Bleed is deliberately not modelled. It only matters when artwork runs to the
 * edge of the page, and galley does not place images at all, so offering a
 * bleed control would imply a capability that does not exist.
 */

/** Inside (gutter) margin required for a given finished page count, in inches. */
export const GUTTER_BANDS = [
  { maxPages: 150, inches: 0.375 },
  { maxPages: 300, inches: 0.5 },
  { maxPages: 500, inches: 0.625 },
  { maxPages: 700, inches: 0.75 },
  { maxPages: 828, inches: 0.875 },
] as const

/** The largest book KDP will print. */
export const MAX_PAGES = 828

/** Minimum outside, top and bottom margin without bleed, in inches. */
export const EDGE_MINIMUM_IN = 0.25

/**
 * Galley's own edge margin, comfortably above the KDP floor. The floor is what
 * the printer will accept, not what reads well — a quarter-inch margin on a
 * novel looks like a photocopy.
 */
const EDGE_IN = 0.5

export type PageBand = (typeof GUTTER_BANDS)[number]['maxPages']

/** The band a page count falls in, or the largest if it exceeds every band. */
export function bandFor(pageCount: number): (typeof GUTTER_BANDS)[number] {
  return GUTTER_BANDS.find((b) => pageCount <= b.maxPages) ?? GUTTER_BANDS.at(-1)!
}

/** Margins meeting KDP's requirements for a book of at most `maxPages` pages. */
export function kdpMargins(maxPages: number): Margins {
  return {
    top: EDGE_IN,
    bottom: EDGE_IN,
    inner: bandFor(maxPages).inches,
    outer: EDGE_IN,
    unit: 'in',
  }
}

/** Trim sizes KDP prints, restricted to those galley already offers. */
export const KDP_TRIMS: readonly PaperName[] = ['digest', 'trade6x9', 'a5', 'letter']

export interface ComplianceProblem {
  message: string
}

/**
 * Check a rendered document against the print requirements.
 *
 * Runs on the real page count, which is the only moment the gutter rule can
 * actually be evaluated. Returning nothing means the file meets the stated
 * minimums — it is not a promise that KDP will accept the upload, and the
 * wording avoids implying otherwise.
 */
export function checkCompliance(
  config: GalleyConfig,
  pageCount: number,
): ComplianceProblem[] {
  const problems: ComplianceProblem[] = []
  const m = config.margins
  const toIn = (v: number) => (m.unit === 'in' ? v : v / 25.4)

  const required = bandFor(pageCount).inches
  if (toIn(m.inner) < required) {
    problems.push({
      message:
        `At ${pageCount} pages, the inside margin must be at least ` +
        `${required} in — this document has ${toIn(m.inner).toFixed(3)} in.`,
    })
  }

  for (const [name, value] of [
    ['top', m.top],
    ['bottom', m.bottom],
    ['outside', m.outer],
  ] as const) {
    if (toIn(value) < EDGE_MINIMUM_IN) {
      problems.push({
        message:
          `The ${name} margin must be at least ${EDGE_MINIMUM_IN} in — ` +
          `this document has ${toIn(value).toFixed(3)} in.`,
      })
    }
  }

  if (pageCount > MAX_PAGES) {
    problems.push({
      message: `A paperback can be at most ${MAX_PAGES} pages; this one is ${pageCount}.`,
    })
  }

  if (!config.twoSided) {
    problems.push({
      message:
        'A printed book is two-sided. Without it the inside margin lands on the ' +
        'same edge of every page rather than alternating towards the spine.',
    })
  }

  return problems
}
