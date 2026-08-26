/**
 * LaTeX escaping. Pure — no DOM, no React.
 *
 * This is historically the largest source of correctness bugs in Markdown→LaTeX
 * converters, so the rules are spelled out rather than left implicit:
 *
 * - Escaping happens in ONE pass. Doing it as a sequence of replacements is the
 *   classic bug: `%` becomes `\%`, then the new backslash is itself escaped and
 *   you emit `\textbackslash{}%`. A single regex with a lookup table cannot
 *   reorder itself into that mistake.
 * - Four characters cannot take a bare backslash. `\~` and `\^` are accent
 *   commands that would silently consume the next character, `\\` is a line
 *   break, and `` \` `` is a grave accent. They get text commands instead.
 * - Hyphens and apostrophes are deliberately left alone. With `Ligatures=TeX`
 *   on the main font, `--`/`---` become en/em dashes and `'` becomes a right
 *   single quote, which is what a writer typing prose actually wants.
 * - Backticks ARE escaped, because the same ligature machinery would turn a
 *   literal `` `` `` into an opening curly quote.
 * - Non-ASCII passes straight through. The engine is XeTeX and the document is
 *   UTF-8, so accented and non-Latin characters need no help.
 */

const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  '#': '\\#',
  $: '\\$',
  '%': '\\%',
  '&': '\\&',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '\\': '\\textbackslash{}',
  '`': '\\textasciigrave{}',
}

const TEXT_PATTERN = /[#$%&_{}~^\\`]/g

/**
 * Straight double quotes → directional curly quotes.
 *
 * Necessary, not decorative. With `Ligatures=TeX` a bare `"` renders as a
 * CLOSING curly quote on both sides, so `"hello"` typesets as ”hello” — visibly
 * wrong in a tool whose claim is typographic quality. Emitting the Unicode
 * characters directly rather than TeX's `` `` ``/`''` keeps this independent of
 * the escaping pass, since neither character is a LaTeX special.
 *
 * A quote opens if it starts the run or follows whitespace or an opening
 * bracket or a dash; otherwise it closes.
 */
function curlyQuotes(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch !== '"') {
      out += ch
      continue
    }
    const prev = input[i - 1]
    const opens = prev === undefined || /[\s([{<—–-]/.test(prev)
    out += opens ? '“' : '”'
  }
  return out
}

/** Escape a run of body text so LaTeX renders it exactly as written. */
export function escapeText(input: string): string {
  return curlyQuotes(input).replace(TEXT_PATTERN, (ch) => TEXT_ESCAPES[ch] ?? ch)
}

/**
 * Escape a URL for the first argument of `\href`.
 *
 * Deliberately narrower than escapeText: hyperref treats the argument close to
 * verbatim, and mangling `/`, `?`, `&`-free query syntax or Unicode would break
 * the link. Only the characters TeX itself would eat are touched, each with a
 * bare backslash — `\~` is safe here because it is followed by URL text rather
 * than being asked to accent it.
 */
const URL_PATTERN = /[#$%&_{}~^\\]/g

export function escapeUrl(input: string): string {
  return input.replace(URL_PATTERN, (ch) => `\\${ch}`)
}

/**
 * Code blocks are emitted inside a `Verbatim` environment and are NOT escaped —
 * that is the point of verbatim. The only way user content can break out is by
 * containing the closing delimiter, so that is the one thing worth checking.
 * Callers that get `false` should fall back to a delimiter-safe rendering rather
 * than emitting broken LaTeX.
 */
export function isVerbatimSafe(code: string): boolean {
  return !/\\end\s*\{\s*Verbatim\s*\}/.test(code)
}

/**
 * Escaping for a PDF information string — `pdftitle`, `pdfauthor`, `pdfsubject`.
 *
 * A different context from body text, so deliberately not `escapeText`. These
 * values are read by hyperref's `\pdfstringdef`, which builds a PDF string
 * rather than typesetting anything: font-dependent commands mean nothing there,
 * and hyperref warns about tokens it cannot convert. What still has to be
 * handled is TeX's own tokenisation, which happens before hyperref sees the
 * value at all — an unbalanced brace or a bare `%` breaks the argument itself.
 *
 * Non-ASCII passes straight through. The engine is XeTeX and hyperref writes
 * these as Unicode, so an accented author name needs no help.
 */
const PDF_STRING_ESCAPES: Readonly<Record<string, string>> = {
  '#': '\\#',
  $: '\\$',
  '%': '\\%',
  '&': '\\&',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  // Dropped rather than escaped: the text-symbol commands that would represent
  // these are exactly what hyperref cannot put in a PDF string, and a metadata
  // field is not worth a warning in the log over a character nobody typed on
  // purpose.
  '~': '',
  '^': '',
  '\\': '',
}

const PDF_STRING_PATTERN = /[#$%&_{}~^\\]/g

export function escapePdfString(input: string): string {
  return input.replace(PDF_STRING_PATTERN, (c) => PDF_STRING_ESCAPES[c] ?? c).trim()
}
