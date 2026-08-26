/**
 * The typefaces a document can be set in. Pure — no DOM, no React.
 *
 * Faces are named by FILENAME, never by family name. There is no fontconfig
 * database in a browser, so `\setmainfont{TeX Gyre Pagella}` cannot resolve;
 * the files are fetched by name from the bundled TeX Live tree.
 *
 * This registry is the single source of truth for three consumers that used to
 * be kept in agreement by hand: the preamble writes these names into
 * `\setmainfont` and friends, `scripts/build-texlive-bundle.ts` copies exactly
 * these files into the bundle, and `preamble.test.ts` asserts the two match. A
 * face named but not bundled is not a degraded render — XeTeX reports "Font not
 * loadable" and produces no PDF at all.
 *
 * The menu is deliberately a fixed list rather than a free choice. galley's
 * bundle is tractable precisely because the set of reachable files is finite
 * and enumerable; letting a reader supply an arbitrary font would end that,
 * while a curated menu leaves it intact.
 */

export type TypefaceName = 'latin-modern' | 'pagella' | 'termes' | 'schola' | 'bonum'

export interface FontFaces {
  regular: string
  bold: string
  italic: string
  /** Latin Modern Mono has no bold-italic face; fontspec must not be told to load one. */
  boldItalic?: string
}

export interface Typeface {
  label: string
  /** Addressed to a writer choosing a look, not to someone who knows type. */
  hint: string
  serif: FontFaces
  sans: FontFaces
  mono: FontFaces
  /**
   * Whether the faces carry the UNACCENTED Greek letters, Α–Ω and α–ω.
   *
   * Latin Modern has none of them, so a word like Ωμέγα loses everything after
   * the capital — the reason this menu exists rather than being cosmetic.
   *
   * It is deliberately NOT a claim to support Greek text. No bundled face has
   * a single precomposed accented form, and monotonic Greek is accented on
   * nearly every word, so accented Greek is reported separately and as
   * unfixable. Measured with XeTeX against each face, not read from a font
   * database — fontconfig claimed characters the engine then refused.
   */
  greek: boolean
}

/** TeX Gyre pairs a sans and a mono with each serif; only the serif really varies. */
const HEROS: FontFaces = {
  regular: 'texgyreheros-regular.otf',
  bold: 'texgyreheros-bold.otf',
  italic: 'texgyreheros-italic.otf',
  boldItalic: 'texgyreheros-bolditalic.otf',
}

const ADVENTOR: FontFaces = {
  regular: 'texgyreadventor-regular.otf',
  bold: 'texgyreadventor-bold.otf',
  italic: 'texgyreadventor-italic.otf',
  boldItalic: 'texgyreadventor-bolditalic.otf',
}

const CURSOR: FontFaces = {
  regular: 'texgyrecursor-regular.otf',
  bold: 'texgyrecursor-bold.otf',
  italic: 'texgyrecursor-italic.otf',
  boldItalic: 'texgyrecursor-bolditalic.otf',
}

export const TYPEFACES: Record<TypefaceName, Typeface> = {
  'latin-modern': {
    label: 'Latin Modern',
    hint: "TeX's own face; no Greek in body text",
    serif: {
      regular: 'lmroman10-regular.otf',
      bold: 'lmroman10-bold.otf',
      italic: 'lmroman10-italic.otf',
      boldItalic: 'lmroman10-bolditalic.otf',
    },
    // Latin Modern ships an oblique here rather than a true italic.
    sans: {
      regular: 'lmsans10-regular.otf',
      bold: 'lmsans10-bold.otf',
      italic: 'lmsans10-oblique.otf',
      boldItalic: 'lmsans10-boldoblique.otf',
    },
    mono: {
      regular: 'lmmono10-regular.otf',
      bold: 'lmmonolt10-bold.otf',
      italic: 'lmmono10-italic.otf',
    },
    greek: false,
  },

  pagella: {
    label: 'Pagella',
    hint: 'Palatino — warm and open',
    serif: {
      regular: 'texgyrepagella-regular.otf',
      bold: 'texgyrepagella-bold.otf',
      italic: 'texgyrepagella-italic.otf',
      boldItalic: 'texgyrepagella-bolditalic.otf',
    },
    sans: HEROS,
    mono: CURSOR,
    greek: true,
  },

  termes: {
    label: 'Termes',
    hint: 'Times — narrow and economical',
    serif: {
      regular: 'texgyretermes-regular.otf',
      bold: 'texgyretermes-bold.otf',
      italic: 'texgyretermes-italic.otf',
      boldItalic: 'texgyretermes-bolditalic.otf',
    },
    sans: HEROS,
    mono: CURSOR,
    greek: true,
  },

  schola: {
    label: 'Schola',
    hint: 'Century Schoolbook — sturdy and legible',
    serif: {
      regular: 'texgyreschola-regular.otf',
      bold: 'texgyreschola-bold.otf',
      italic: 'texgyreschola-italic.otf',
      boldItalic: 'texgyreschola-bolditalic.otf',
    },
    sans: HEROS,
    mono: CURSOR,
    greek: true,
  },

  bonum: {
    label: 'Bonum',
    hint: 'Bookman — broad, holds up when small',
    serif: {
      regular: 'texgyrebonum-regular.otf',
      bold: 'texgyrebonum-bold.otf',
      italic: 'texgyrebonum-italic.otf',
      boldItalic: 'texgyrebonum-bolditalic.otf',
    },
    sans: ADVENTOR,
    mono: CURSOR,
    greek: true,
  },
}

export const DEFAULT_TYPEFACE: TypefaceName = 'latin-modern'

export const TYPEFACE_NAMES = Object.keys(TYPEFACES) as TypefaceName[]

export function typefaceOrDefault(name: TypefaceName | undefined): Typeface {
  return TYPEFACES[name ?? DEFAULT_TYPEFACE] ?? TYPEFACES[DEFAULT_TYPEFACE]
}

/**
 * Every face any typeface can reach. The bundle must ship all of them: a reader
 * switching typeface fetches only the files that choice needs, but the build
 * cannot know in advance which choice that will be.
 */
export function allFontFiles(): string[] {
  const files = new Set<string>()
  for (const face of TYPEFACE_NAMES) {
    const t = TYPEFACES[face]
    for (const group of [t.serif, t.sans, t.mono]) {
      files.add(group.regular)
      files.add(group.bold)
      files.add(group.italic)
      if (group.boldItalic) files.add(group.boldItalic)
    }
  }
  return [...files].sort()
}

/**
 * Script coverage, for turning silent glyph loss into a visible notice.
 *
 * XeTeX drops a character no font can draw without failing the compile, so a
 * Greek word in Latin Modern becomes a gap in the page and nothing else — the
 * reader discovers it by reading the PDF, if at all. That is the same failure
 * shape as an unsupported image, and it deserves the same treatment: say where
 * it happened and why.
 *
 * Ranges are deliberately coarse. The point is to catch a writer pasting a
 * script galley cannot set, not to model font coverage exactly.
 */
interface ScriptRange {
  name: string
  from: number
  to: number
  /** True when choosing a different bundled typeface would fix it. */
  fixable: boolean
}

/**
 * Measured with XeTeX itself against every bundled face, not taken from a font
 * database — fontconfig's charset claimed characters the engine then refused.
 *
 * What TeX Gyre actually has is the UNACCENTED letters: Α–Ω and α–ω. It has no
 * precomposed accented form at all — ά έ ή ί ό ύ ώ, and the dialytika — and
 * neither does Latin Modern. That matters more than it sounds: monotonic Greek
 * prose is accented on almost every word, so galley still cannot set Greek
 * *text*. What the typeface menu buys is Greek *letters*, which is the case
 * that actually turns up in an English document — a name, or a symbol used in
 * running prose rather than in maths.
 *
 * Saying "Greek" without that distinction would be the overclaim this whole
 * diagnostic exists to prevent, so the two are separate entries.
 */
const SCRIPTS: ScriptRange[] = [
  // Unaccented Greek letters: absent from Latin Modern, present in every TeX
  // Gyre face. U+03A2 is unassigned and falls in the gap deliberately.
  { name: 'Greek', from: 0x0391, to: 0x03a1, fixable: true },
  { name: 'Greek', from: 0x03a3, to: 0x03a9, fixable: true },
  { name: 'Greek', from: 0x03b1, to: 0x03c9, fixable: true },
  // Everything else Greek — accents, dialytika, archaic letters, polytonic.
  // No bundled face has any of it, so no typeface choice is an answer.
  { name: 'Accented Greek', from: 0x0370, to: 0x03ff, fixable: false },
  { name: 'Accented Greek', from: 0x1f00, to: 0x1fff, fixable: false },
  // Covered by nothing galley bundles. Listing them is honest; implying the
  // typeface menu is the answer would not be.
  { name: 'Cyrillic', from: 0x0400, to: 0x04ff, fixable: false },
  { name: 'Hebrew', from: 0x0590, to: 0x05ff, fixable: false },
  { name: 'Arabic', from: 0x0600, to: 0x06ff, fixable: false },
  { name: 'Devanagari', from: 0x0900, to: 0x097f, fixable: false },
  { name: 'Japanese', from: 0x3040, to: 0x30ff, fixable: false },
  { name: 'CJK', from: 0x4e00, to: 0x9fff, fixable: false },
  { name: 'Hangul', from: 0xac00, to: 0xd7af, fixable: false },
]

export interface ScriptGap {
  script: string
  /** The offending characters, so the notice can quote them back. */
  sample: string
  fixable: boolean
}

/**
 * Scripts in `text` that the chosen typeface cannot set.
 *
 * Greek is reported only when the typeface actually lacks it, so switching to
 * Pagella genuinely silences the notice rather than merely relabelling it.
 */
export function findScriptGaps(text: string, typeface: Typeface): ScriptGap[] {
  const found = new Map<string, ScriptGap>()
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code === undefined || code < 0x0370) continue
    const range = SCRIPTS.find((r) => code >= r.from && code <= r.to)
    if (!range) continue
    if (range.name === 'Greek' && typeface.greek) continue
    const existing = found.get(range.name)
    if (existing) {
      if (!existing.sample.includes(char)) existing.sample += char
    } else {
      found.set(range.name, { script: range.name, sample: char, fixable: range.fixable })
    }
  }
  return [...found.values()]
}

/** Typefaces that cover Greek, for naming a way out in the notice. */
export function typefacesWithGreek(): string[] {
  return TYPEFACE_NAMES.filter((n) => TYPEFACES[n].greek).map((n) => TYPEFACES[n].label)
}

/**
 * The CSS family name under which a typeface's serif face is registered for
 * previewing in the UI.
 *
 * The preview is drawn with the REAL font file the document will be set in —
 * the same OTF the engine fetches — rather than a web-font lookalike, so the
 * menu cannot promise something the PDF does not deliver. `index.css` declares
 * the matching `@font-face` rules; a browser downloads a face only when text
 * actually uses it, so nothing is fetched until the menu is opened.
 */
export function previewFamily(name: TypefaceName): string {
  return `galley-preview-${name}`
}
