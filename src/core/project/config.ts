/**
 * The book's settings, carried in `book.md` so a folder is portable: hand
 * someone the folder and they get the same book, not the same text at default
 * settings.
 *
 * Every read is total and validating. A value outside the supported set is
 * DROPPED rather than accepted, so a hand-edited or hand-copied file can never
 * put the renderer into a state the UI cannot represent — the caller layers
 * what survives over `presetFor`/`DEFAULT_CONFIG` and always holds a complete,
 * valid config.
 */

import {
  type FontSize,
  type GalleyConfig,
  type LengthUnit,
  type LineSpacing,
  type Margins,
  PAPER_SIZES,
  type Paper,
} from '../config'
import { TYPEFACES, type TypefaceName } from '../fonts'
import { writeFrontmatterKey } from '../structure'

/**
 * Deliberately not `galley:`. That key answers "is this file in the book?" for
 * every Markdown file; this one answers "how is the book set?" and is read only
 * from `book.md`. One name per question.
 */
const KEY = 'book'

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * A number the UI can also represent. Finiteness alone is not enough: the
 * module's contract is that nothing surviving this reader can put the renderer
 * into a state the interface cannot show, and `ConfigPanel` enforces `min={0}`
 * on margins and offers only depths 0-3. A negative margin or a depth of 99
 * would pass a finiteness check and then be unshowable.
 */
function bounded(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined
}

function readMargins(value: unknown): Margins | undefined {
  const raw = record(value)
  if (!raw) return undefined
  const unit = oneOf<LengthUnit>(raw.unit, ['mm', 'in'])
  const top = bounded(raw.top, 0, 500)
  const bottom = bounded(raw.bottom, 0, 500)
  const inner = bounded(raw.inner, 0, 500)
  const outer = bounded(raw.outer, 0, 500)
  if (unit === undefined) return undefined
  if ([top, bottom, inner, outer].some((n) => n === undefined)) return undefined
  return {
    top: top as number,
    bottom: bottom as number,
    inner: inner as number,
    outer: outer as number,
    unit,
  }
}

function readPaper(value: unknown): Paper | undefined {
  const name = oneOf(value, Object.keys(PAPER_SIZES) as (keyof typeof PAPER_SIZES)[])
  if (name) return { kind: 'named', name }
  const raw = record(value)
  if (!raw) return undefined
  const width = bounded(raw.width, 1, 2000)
  const height = bounded(raw.height, 1, 2000)
  const unit = oneOf<LengthUnit>(raw.unit, ['mm', 'in'])
  if (width === undefined || height === undefined || unit === undefined) return undefined
  return { kind: 'custom', width, height, unit }
}

export function readBookConfig(
  data: Record<string, unknown> | null,
): Partial<GalleyConfig> {
  const raw = data === null ? null : record(data[KEY])
  if (!raw) return {}

  const out: Partial<GalleyConfig> = {}
  const character = oneOf(raw.character, ['article', 'report', 'book'] as const)
  if (character) out.character = character

  const paper = readPaper(raw.paper)
  if (paper) out.paper = paper

  const margins = readMargins(raw.margins)
  if (margins) out.margins = margins

  const twoSided = bool(raw.two_sided)
  if (twoSided !== undefined) out.twoSided = twoSided

  // Strict, not coerced. `String(raw.font_size)` would accept the string
  // "11" AND the single-element array ["11"], which stringifies to "11" —
  // every other field here checks its type outright.
  const fontSize = raw.font_size
  if (fontSize === 10 || fontSize === 11 || fontSize === 12) {
    out.fontSize = fontSize as FontSize
  }

  const typeface = oneOf(raw.typeface, Object.keys(TYPEFACES) as TypefaceName[])
  if (typeface) out.typeface = typeface

  const lineSpacing = oneOf<LineSpacing>(raw.line_spacing, [
    'single',
    'onehalf',
    'double',
  ])
  if (lineSpacing) out.lineSpacing = lineSpacing

  const toc = record(raw.toc)
  if (toc) {
    const include = bool(toc.include)
    const depth = bounded(toc.depth, 0, 3)
    if (include !== undefined && depth !== undefined) out.toc = { include, depth }
  }

  const links = record(raw.links)
  const footnoteUrls = links ? bool(links.footnote_urls) : undefined
  if (footnoteUrls !== undefined) out.links = { footnoteUrls }

  const chapters = record(raw.chapters)
  if (chapters) {
    const startOnNewPage = bool(chapters.start_on_new_page)
    const forceRecto = bool(chapters.force_recto)
    if (startOnNewPage !== undefined && forceRecto !== undefined) {
      out.chapters = { startOnNewPage, forceRecto }
    }
  }

  const sections = record(raw.sections)
  const numbered = sections ? bool(sections.numbered) : undefined
  if (numbered !== undefined) out.sections = { numbered }

  if (oneOf(raw.print_target, ['kdp'] as const)) out.printTarget = 'kdp'

  return out
}

/** Write the book's settings into `book.md`, preserving everything else. */
export function writeBookConfig(source: string, config: GalleyConfig): string {
  return writeFrontmatterKey(source, KEY, {
    character: config.character,
    // A named size writes as its bare name; a custom one writes its
    // dimensions. `kind` is galley's own discriminator and never goes in the
    // author's file — spreading it with `kind: undefined` would emit a
    // literal `kind: null`, which `readPaper` would then reject.
    paper:
      config.paper.kind === 'named'
        ? config.paper.name
        : {
            width: config.paper.width,
            height: config.paper.height,
            unit: config.paper.unit,
          },
    margins: config.margins,
    two_sided: config.twoSided,
    font_size: config.fontSize,
    typeface: config.typeface,
    line_spacing: config.lineSpacing,
    toc: { include: config.toc.include, depth: config.toc.depth },
    links: { footnote_urls: config.links.footnoteUrls },
    chapters: {
      start_on_new_page: config.chapters.startOnNewPage,
      force_recto: config.chapters.forceRecto,
    },
    sections: { numbered: config.sections.numbered },
    ...(config.printTarget ? { print_target: config.printTarget } : {}),
  })
}
