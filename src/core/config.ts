/**
 * Document configuration. Pure — no DOM, no React.
 *
 * Every option here must be expressible in the preamble and visible in the
 * preview immediately. Options are deliberately constrained rather than free:
 * the useful range for font size and line spacing is narrow, and unconstrained
 * values produce bad typography.
 */

/** What the reader is making, in their terms rather than LaTeX's. */
import { DEFAULT_TYPEFACE, type TypefaceName } from './fonts'

export type DocumentCharacter = 'article' | 'report' | 'book'

export type LengthUnit = 'mm' | 'in'

export interface CustomPaper {
  kind: 'custom'
  width: number
  height: number
  unit: LengthUnit
}

export interface NamedPaper {
  kind: 'named'
  name: PaperName
}

export type Paper = NamedPaper | CustomPaper

export type PaperName = keyof typeof PAPER_SIZES

/**
 * Standard sizes plus the common trade paperback trims. The trims matter: the
 * standard sizes do not include any of them, and a book-length document set on
 * A4 does not read as a book.
 */
export const PAPER_SIZES = {
  a4: { label: 'A4', width: 210, height: 297, unit: 'mm' },
  letter: { label: 'US Letter', width: 8.5, height: 11, unit: 'in' },
  a5: { label: 'A5', width: 148, height: 210, unit: 'mm' },
  b5: { label: 'B5', width: 176, height: 250, unit: 'mm' },
  digest: { label: 'Digest (5.5 × 8.5 in)', width: 5.5, height: 8.5, unit: 'in' },
  trade6x9: { label: 'US Trade (6 × 9 in)', width: 6, height: 9, unit: 'in' },
  royal: { label: 'Royal (156 × 234 mm)', width: 156, height: 234, unit: 'mm' },
  demy: { label: 'Demy (138 × 216 mm)', width: 138, height: 216, unit: 'mm' },
} as const satisfies Record<
  string,
  { label: string; width: number; height: number; unit: LengthUnit }
>

export interface Margins {
  top: number
  bottom: number
  /** Spine side. For one-sided documents the UI presents this as "left". */
  inner: number
  /** Outer edge. For one-sided documents the UI presents this as "right". */
  outer: number
  unit: LengthUnit
}

export type FontSize = 10 | 11 | 12
export type LineSpacing = 'single' | 'onehalf' | 'double'

export interface Metadata {
  title?: string
  subtitle?: string
  author?: string
  date?: string
}

export interface GalleyConfig {
  character: DocumentCharacter
  paper: Paper
  margins: Margins
  /** Alternates margins and differentiates running heads on facing pages. */
  twoSided: boolean
  fontSize: FontSize
  /**
   * The face the document is set in. Chosen from a fixed menu rather than
   * freely, so the set of files the bundle must ship stays finite — see
   * `fonts.ts`. Latin Modern is the default and the only one without Greek.
   */
  typeface: TypefaceName
  lineSpacing: LineSpacing
  toc: { include: boolean; depth: number }
  /**
   * Reproduce each link's target as a footnote. Right for something that will
   * be printed, where an invisible destination is useless; noise in a PDF that
   * will only ever be read on screen, where the link is clickable.
   */
  links: { footnoteUrls: boolean }
  /** Only meaningful when top-level headings become chapters. */
  chapters: { startOnNewPage: boolean; forceRecto: boolean }
  /**
   * Set when the reader has asked for a specific print target, so the render
   * can check the finished document against that target's requirements. Left
   * unset, galley makes no claim about printability and says nothing about it.
   */
  printTarget?: 'kdp'
  metadata: Metadata
}

/** Does this character map top-level Markdown headings to chapters? */
export function usesChapters(character: DocumentCharacter): boolean {
  return character === 'book' || character === 'report'
}

/** The LaTeX document class for a character. */
export function documentClass(character: DocumentCharacter): string {
  return character
}

export function resolvePaper(paper: Paper): {
  width: number
  height: number
  unit: LengthUnit
} {
  if (paper.kind === 'custom') {
    return { width: paper.width, height: paper.height, unit: paper.unit }
  }
  const size = PAPER_SIZES[paper.name]
  return { width: size.width, height: size.height, unit: size.unit }
}

/**
 * Defaults chosen so that a reader who never opens the configuration panel gets
 * a good result — most first-time users paste a page, render, and judge the
 * whole product on what comes back.
 */
export const DEFAULT_CONFIG: GalleyConfig = {
  character: 'article',
  paper: { kind: 'named', name: 'a4' },
  margins: { top: 25, bottom: 25, inner: 25, outer: 25, unit: 'mm' },
  twoSided: false,
  fontSize: 11,
  typeface: DEFAULT_TYPEFACE,
  lineSpacing: 'single',
  toc: { include: false, depth: 2 },
  links: { footnoteUrls: true },
  chapters: { startOnNewPage: true, forceRecto: false },
  metadata: {},
}

/**
 * Sensible starting points per character. Selecting a character in the UI
 * applies these, then the reader adjusts. A book defaults to a real trim size,
 * two-sided layout and a table of contents, because those are what make it read
 * as a printed book rather than a printed webpage.
 */
export function presetFor(character: DocumentCharacter): GalleyConfig {
  switch (character) {
    case 'book':
      return {
        ...DEFAULT_CONFIG,
        character,
        paper: { kind: 'named', name: 'royal' },
        margins: { top: 20, bottom: 22, inner: 22, outer: 18, unit: 'mm' },
        twoSided: true,
        lineSpacing: 'onehalf',
        toc: { include: true, depth: 1 },
        chapters: { startOnNewPage: true, forceRecto: true },
      }
    case 'report':
      return {
        ...DEFAULT_CONFIG,
        character,
        toc: { include: true, depth: 2 },
        chapters: { startOnNewPage: true, forceRecto: false },
      }
    default:
      return { ...DEFAULT_CONFIG, character }
  }
}
