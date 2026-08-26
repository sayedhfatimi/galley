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
  /**
   * Sanitised names of the images this document draws. The caller supplies
   * exactly these to the engine — a document referencing one figure should not
   * drag every image the reader has ever attached into the compile.
   */
  images: string[]
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

export function convert(
  source: string,
  config: GalleyConfig,
  /** Image names the caller holds bytes for; omit when it cannot know. */
  available?: ReadonlySet<string>,
): ConvertResult {
  const tree = parseMarkdown(source)
  const frontmatter = extractFrontmatter(tree)
  const { body, diagnostics, images } = serializeToLatex(tree, config, available)

  const { title, subtitle, author, date } = config.metadata
  const hasTitleBlock = Boolean(title || subtitle || author || date)

  // A book numbers its title page and contents in roman and starts the body
  // again at arabic 1, which is what makes the front of it read as a printed
  // book rather than as page one of a long article. Only the book class
  // defines these; report and article do not.
  const matter = config.character === 'book'

  const parts = [buildPreamble(config), '', '\\begin{document}', '']
  if (matter) parts.push('\\frontmatter', '')
  if (hasTitleBlock) parts.push('\\maketitle', '')
  if (config.toc.include) parts.push('\\tableofcontents', '')
  if (matter) parts.push('\\mainmatter', '')
  // A frontmatter-only document still compiles; the body is simply empty.
  if (body.length > 0) parts.push(body, '')
  parts.push('\\end{document}', '')

  return {
    tex: parts.join('\n'),
    diagnostics,
    frontmatter,
    images,
    hasFrontmatter: hasFrontmatter(tree),
  }
}
