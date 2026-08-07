/**
 * Config → LaTeX preamble. Pure — no DOM, no React.
 *
 * The output is written for a human reader: grouped, commented, and spaced so a
 * reader who downloads the .tex can find where page geometry is set and change
 * it. That is a product requirement, not a stylistic preference — the .tex is
 * the finished good for readers who already know LaTeX.
 */

import {
  type DocumentCharacter,
  documentClass,
  type GalleyConfig,
  resolvePaper,
  usesChapters,
} from '../config'
import { escapeText } from './escape'

/**
 * Latin Modern, loaded BY FILENAME. There is no fontconfig in a browser, so
 * `\setmainfont{Latin Modern Roman}` cannot resolve; the files are fetched by
 * name from the bundled TeX Live tree. `Ligatures=TeX` is mandatory — without
 * it fontspec leaves `` and --- unconverted, so curly quotes and em dashes
 * never appear.
 */
const MAIN_FONT = [
  '\\setmainfont{lmroman10-regular.otf}[',
  '  Ligatures=TeX,',
  '  BoldFont=lmroman10-bold.otf,',
  '  ItalicFont=lmroman10-italic.otf,',
  '  BoldItalicFont=lmroman10-bolditalic.otf,',
  ']',
].join('\n')

/**
 * The sans family is declared even though nothing in Markdown selects it,
 * because `\mathsf` reaches it from inside maths. Left undeclared, fontspec
 * still resolves the family to lmsans by name and the compile dies outright
 * with "Font TU/lmss/m/n not loadable" — a hard stop, not a fallback.
 *
 * Latin Modern ships an oblique rather than a true italic here.
 */
const SANS_FONT = [
  '\\setsansfont{lmsans10-regular.otf}[',
  '  Ligatures=TeX,',
  '  BoldFont=lmsans10-bold.otf,',
  '  ItalicFont=lmsans10-oblique.otf,',
  '  BoldItalicFont=lmsans10-boldoblique.otf,',
  ']',
].join('\n')

const MONO_FONT = [
  '\\setmonofont{lmmono10-regular.otf}[',
  '  Ligatures=TeX,',
  '  BoldFont=lmmonolt10-bold.otf,',
  '  ItalicFont=lmmono10-italic.otf,',
  ']',
].join('\n')

function classOptions(config: GalleyConfig): string[] {
  const opts: string[] = [`${config.fontSize}pt`]
  opts.push(config.twoSided ? 'twoside' : 'oneside')
  if (usesChapters(config.character)) {
    opts.push(config.chapters.forceRecto ? 'openright' : 'openany')
  }
  return opts
}

function geometry(config: GalleyConfig): string {
  const { width, height, unit } = resolvePaper(config.paper)
  const m = config.margins
  const dims = [`paperwidth=${width}${unit}`, `paperheight=${height}${unit}`]
  const edges = [`top=${m.top}${m.unit}`, `bottom=${m.bottom}${m.unit}`]
  // Inner/outer alternate on facing pages; for one-sided documents that
  // distinction is meaningless, so express it as plain left/right.
  const sides = config.twoSided
    ? [`inner=${m.inner}${m.unit}`, `outer=${m.outer}${m.unit}`]
    : [`left=${m.inner}${m.unit}`, `right=${m.outer}${m.unit}`]
  return `\\geometry{${[...dims, ...edges, ...sides].join(', ')}}`
}

function spacingCommand(config: GalleyConfig): string | null {
  switch (config.lineSpacing) {
    case 'onehalf':
      return '\\onehalfspacing'
    case 'double':
      return '\\doublespacing'
    default:
      return null // single is the class default; emitting nothing is clearer
  }
}

function runningHeads(character: DocumentCharacter, twoSided: boolean): string[] {
  const lines = ['\\pagestyle{fancy}', '\\fancyhf{}']
  if (twoSided) {
    lines.push(
      '\\fancyhead[LE]{\\nouppercase{\\leftmark}}',
      '\\fancyhead[RO]{\\nouppercase{\\rightmark}}',
      '\\fancyfoot[LE,RO]{\\thepage}',
    )
  } else {
    lines.push('\\fancyhead[R]{\\nouppercase{\\leftmark}}', '\\fancyfoot[C]{\\thepage}')
  }
  lines.push('\\renewcommand{\\headrulewidth}{0.4pt}')
  if (usesChapters(character)) {
    // Chapter opening pages should not carry a running head.
    lines.push('\\fancypagestyle{plain}{\\fancyhf{}\\renewcommand{\\headrulewidth}{0pt}%')
    lines.push(`  \\fancyfoot[${twoSided ? 'LE,RO' : 'C'}]{\\thepage}}`)
  }
  return lines
}

function titleBlock(config: GalleyConfig): string[] {
  const { title, subtitle, author, date } = config.metadata
  if (!title && !subtitle && !author && !date) return []

  const heading = subtitle
    ? `${escapeText(title ?? '')}\\\\[0.4em]\\large ${escapeText(subtitle)}`
    : escapeText(title ?? '')

  const lines = ['% ---- Document metadata ----', `\\title{${heading}}`]
  lines.push(`\\author{${author ? escapeText(author) : ''}}`)
  // An empty \date{} suppresses LaTeX's automatic today's-date, which is
  // rarely what someone converting a manuscript wants.
  lines.push(`\\date{${date ? escapeText(date) : ''}}`)
  return lines
}

export function buildPreamble(config: GalleyConfig): string {
  const out: string[] = []
  const push = (...lines: string[]) => out.push(...lines)

  push(
    `\\documentclass[${classOptions(config).join(',')}]{${documentClass(config.character)}}`,
    '',
    '% ---- Page geometry ----',
    '% Change these dimensions to re-trim the document.',
    '\\usepackage{geometry}',
    geometry(config),
    '',
    '% ---- Fonts ----',
    '% Loaded by filename rather than family name so the document compiles',
    '% identically in a browser, where no system font database exists.',
    '\\usepackage{fontspec}',
    MAIN_FONT,
    SANS_FONT,
    MONO_FONT,
    '',
    '% ---- Text and structure ----',
    '\\usepackage{setspace}',
  )

  const spacing = spacingCommand(config)
  if (spacing) push(spacing)

  // A chapter begins a new page in the book and report classes, and there is no
  // class option to stop it — the break is built into \chapter itself. Demoting
  // the chapter to a "straight" title class, as a section is, is what actually
  // removes it. Only emitted when asked, so the usual document carries no
  // titlesec dependency and no redefinition of a standard command.
  if (usesChapters(config.character) && !config.chapters.startOnNewPage) {
    push(
      '',
      '% ---- Chapter breaks ----',
      '% Chapters run on rather than starting a page. \\chapter forces the break',
      '% itself, so the heading is redeclared as a straight title instead.',
      '\\usepackage{titlesec}',
      '\\titleclass{\\chapter}{straight}',
      '\\titleformat{\\chapter}[hang]',
      '  {\\normalfont\\huge\\bfseries}{\\thechapter}{1em}{}',
      '\\titlespacing*{\\chapter}{0pt}{3.5ex plus 1ex minus .2ex}{2.3ex plus .2ex}',
    )
  }

  push(
    '\\usepackage{enumitem}',
    '\\usepackage[normalem]{ulem}',
    '% fvextra, not bare fancyvrb: breaklines/breakanywhere are fvextra options,',
    '% and without it a long line in a code block runs into the margin.',
    '\\usepackage{fancyvrb}',
    '\\usepackage{fvextra}',
    '',
    '% ---- Tables ----',
    '% xltabular, not longtable: X is a tabularx column type and plain',
    '% longtable cannot parse it. This combination breaks across pages AND',
    '% wraps within the text block.',
    '\\usepackage{booktabs}',
    '\\usepackage{tabularx}',
    '\\usepackage{xltabular}',
    '',
    '% ---- Mathematics ----',
    '\\usepackage{amsmath}',
    '\\usepackage{amssymb}',
    '',
    '% ---- Graphics and colour ----',
    '\\usepackage{graphicx}',
    '\\usepackage{xcolor}',
    '',
    '% ---- Running heads ----',
    '\\usepackage{fancyhdr}',
    ...runningHeads(config.character, config.twoSided),
  )

  if (config.toc.include) {
    push('', '% ---- Contents ----', `\\setcounter{tocdepth}{${config.toc.depth}}`)
  }

  const title = titleBlock(config)
  if (title.length > 0) push('', ...title)

  push(
    '',
    '% ---- Links ----',
    '% hyperref must be loaded last; it redefines commands from other packages.',
    '\\usepackage{hyperref}',
    '\\hypersetup{hidelinks}',
  )

  return out.join('\n')
}
