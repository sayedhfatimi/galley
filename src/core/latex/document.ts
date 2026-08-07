/**
 * The whole conversion: Markdown → a complete, compilable .tex.
 * Pure — no DOM, no React.
 *
 * This is the module the UI calls. It never throws: any input is valid Markdown
 * once unrecognised constructs are treated as text, so conversion always
 * produces a document. Anything galley cannot represent well comes back as a
 * diagnostic rather than an exception.
 */

import type { GalleyConfig, Metadata } from '../config'
import type { Diagnostic } from '../diagnostics'
import { extractFrontmatter, hasFrontmatter } from '../markdown/frontmatter'
import { parseMarkdown } from '../markdown/parse'
import { buildPreamble } from './preamble'
import { serializeToLatex } from './serialize'

export interface ConvertResult {
  /** A complete, self-contained document ready to compile. */
  tex: string
  diagnostics: Diagnostic[]
  /** Metadata found in frontmatter, for pre-filling the configuration panel. */
  frontmatter: Metadata
  hasFrontmatter: boolean
}

/**
 * Read metadata out of a document without converting it.
 *
 * The UI calls this on input so it can pre-fill the configuration panel before
 * the reader touches anything — the detail that makes a note-taking export work
 * correctly on the first paste.
 */
export function readFrontmatter(source: string): Metadata {
  return extractFrontmatter(parseMarkdown(source))
}

export function convert(source: string, config: GalleyConfig): ConvertResult {
  const tree = parseMarkdown(source)
  const frontmatter = extractFrontmatter(tree)
  const { body, diagnostics } = serializeToLatex(tree, config)

  const { title, subtitle, author, date } = config.metadata
  const hasTitleBlock = Boolean(title || subtitle || author || date)

  const parts = [buildPreamble(config), '', '\\begin{document}', '']
  if (hasTitleBlock) parts.push('\\maketitle', '')
  if (config.toc.include) parts.push('\\tableofcontents', '')
  // A frontmatter-only document still compiles; the body is simply empty.
  if (body.length > 0) parts.push(body, '')
  parts.push('\\end{document}', '')

  return {
    tex: parts.join('\n'),
    diagnostics,
    frontmatter,
    hasFrontmatter: hasFrontmatter(tree),
  }
}
