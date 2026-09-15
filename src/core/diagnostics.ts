/**
 * Structured notices raised during conversion. Pure — no DOM, no React.
 *
 * Conversion to LaTeX never fails, so anything galley cannot represent well must
 * surface here instead of being dropped. The rule is that a reader learns about
 * a limitation at conversion time, not at the point of download — discovering a
 * missing figure after waiting for a render is a worse experience than necessary.
 */

export type DiagnosticKind =
  /** An image galley will not draw: hosted elsewhere, an unsupported format, or not attached. */
  | 'image-unsupported'
  /** Raw HTML cannot be typeset, so it is carried through as literal text. */
  | 'raw-html'
  /** Code contained the Verbatim end delimiter and needed a safer rendering. */
  | 'verbatim-delimiter'
  /** A construct galley has no LaTeX mapping for; emitted as literal text. */
  | 'unsupported-construct'
  /** Text in a script the chosen typeface cannot draw; XeTeX drops it silently. */
  | 'missing-glyphs'
  /** A part named in the setup matches no heading, so it was set as main matter. */
  | 'structure-unmatched'
  /** Parts appear out of matter order; they are emitted where they were written. */
  | 'structure-order'
  /** Front and back matter were asked for in an Article or Report, which have neither. */
  | 'structure-ignored'
  /** A numbered part was also set unlisted, which an unstarred \chapter cannot honour. */
  | 'structure-unlistable'
  /** Two root-level headings share the same text, so one setting governs both. */
  | 'structure-duplicate-heading'

export interface Diagnostic {
  kind: DiagnosticKind
  /** Plain-language, addressed to a writer rather than a LaTeX user. */
  message: string
  /** The offending source fragment, where quoting it helps. */
  detail?: string
}

/**
 * Collects diagnostics during a walk, de-duplicating by kind+detail so a
 * document with forty images produces one notice per distinct problem rather
 * than forty identical lines.
 */
export class DiagnosticCollector {
  readonly #seen = new Set<string>()
  readonly #items: Diagnostic[] = []

  add(kind: DiagnosticKind, message: string, detail?: string): void {
    const key = `${kind}\u0000${detail ?? ''}`
    if (this.#seen.has(key)) return
    this.#seen.add(key)
    this.#items.push(detail === undefined ? { kind, message } : { kind, message, detail })
  }

  /** How many times a kind was raised, counting duplicates as one. */
  count(kind: DiagnosticKind): number {
    return this.#items.filter((d) => d.kind === kind).length
  }

  list(): Diagnostic[] {
    return [...this.#items]
  }
}
