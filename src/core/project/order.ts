/**
 * The order parts appear in the book: the natural sort of each file's path.
 *
 * The filesystem already records the order, so nothing records it a second
 * time — no `order:` field, no manifest. A second record is the shape behind
 * four separate v2.1.0 defects, and Obsidian would not fix a path string in a
 * manifest the way it fixes a wikilink on rename.
 */

/**
 * Pinned to 'en' rather than the ambient locale: core runs in Node under
 * Vitest, on the main thread and inside the worker, and the order of someone's
 * chapters must not depend on which.
 */
const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' })
// Note this cannot be unit-tested from inside one environment: pinning the
// locale buys agreement BETWEEN environments, and a test asserting that 'en'
// differs from the ambient locale would just encode the test machine's own
// locale. Measured on one such machine, ambient resolved to en-GB and agreed
// with 'en' on every sample — which is exactly why the pin is a stated
// invariant rather than an assertion.

export function partOrder(paths: readonly string[]): string[] {
  return [...paths].sort((a, b) => {
    // A collator is not guaranteed to be a TOTAL order: two distinct strings
    // can compare equal, and the order of someone's chapters would then fall
    // through to whatever order the filesystem happened to hand them over in.
    // Break any tie on the raw strings so the answer is the same every time.
    const collated = COLLATOR.compare(a, b)
    if (collated !== 0) return collated
    return a < b ? -1 : a > b ? 1 : 0
  })
}
