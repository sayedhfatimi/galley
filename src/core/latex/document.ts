/**
 * The whole conversion: Markdown → a complete, compilable .tex.
 * Pure — no DOM, no React.
 *
 * This is the module the UI calls. It never throws: any input is valid Markdown
 * once unrecognised constructs are treated as text, so conversion always
 * produces a document. Anything galley cannot represent well comes back as a
 * diagnostic rather than an exception.
 */

import { type GalleyConfig, type Metadata, usesMatter } from '../config'
import type { Diagnostic } from '../diagnostics'
import { extractFrontmatter, hasFrontmatter } from '../markdown/frontmatter'
import { parseMarkdown } from '../markdown/parse'
import { joinFrontmatter, splitFrontmatter } from '../markdown/split'
import { applyWikilinkEmbeds } from '../markdown/wikilink'
import { sharedDefinitions } from '../project/definitions'
import type { FigureResolver, ProjectPart } from '../project/types'
import { buildPreamble } from './preamble'
import { type SerializeResult, serializeParts } from './serialize'

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

export interface ProjectConvertResult {
  tex: string
  diagnostics: Diagnostic[]
  /**
   * Sanitised names of every image the project draws — see `ConvertResult.images`.
   */
  images: string[]
}

/**
 * Wrap a serialised body in a complete document.
 *
 * Shared by both entry points, because the matter-division rule below is
 * exactly the kind of fact that must not be decided in two places — a
 * project's \frontmatter and a single document's are the same \frontmatter.
 */
function assemble(config: GalleyConfig, result: SerializeResult): string {
  const { title, subtitle, author, date } = config.metadata
  const hasTitleBlock = Boolean(title || subtitle || author || date)

  // A book numbers its title page and contents in roman and starts the body
  // again at arabic 1, which is what makes the front of it read as a printed
  // book rather than as page one of a long article. Only the book class
  // defines these; report and article do not.
  const matter = usesMatter(config.character)

  const parts = [buildPreamble(config), '', '\\begin{document}', '']
  if (matter) parts.push('\\frontmatter', '')
  if (hasTitleBlock) parts.push('\\maketitle', '')
  if (config.toc.include) parts.push('\\tableofcontents', '')
  // The body opens main matter itself when it has front or back matter to
  // separate from. Emitting one here as well would open the division twice and
  // reset the page numbering in the middle of the front matter.
  if (matter && !result.ownsMatterDivisions) parts.push('\\mainmatter', '')
  // A frontmatter-only document still compiles; the body is simply empty.
  if (result.body.length > 0) parts.push(result.body, '')
  parts.push('\\end{document}', '')
  return parts.join('\n')
}

export function convert(
  source: string,
  config: GalleyConfig,
  /** Image names the caller holds bytes for; omit when it cannot know. */
  available?: ReadonlySet<string>,
): ConvertResult {
  const tree = parseMarkdown(source)
  // Applied HERE, not in `parseMarkdown`, and applied immediately before
  // serialising. `parseMarkdown` is also the rich editor's parse, and the
  // editor serialises its tree straight back over the author's file — so an
  // embed rewritten at parse time is an embed DESTROYED in a folder project's
  // vault (measured: the inline case vanished entirely). Conversion is the one
  // path that wants the rewrite, so conversion is where it runs.
  applyWikilinkEmbeds(tree)
  const result = serializeParts([{ tree }], config, available)
  return {
    tex: assemble(config, result),
    diagnostics: result.diagnostics,
    frontmatter: extractFrontmatter(tree),
    images: result.images,
    hasFrontmatter: hasFrontmatter(tree),
  }
}

/**
 * The whole of a folder project: every chapter, parsed together, as one
 * complete `.tex`.
 *
 * A book's metadata comes from the caller's config (read from `book.md`),
 * not from any one chapter's own frontmatter — see `assemble`'s doc comment
 * for the division rule this shares with `convert`.
 */
export function convertProject(
  parts: readonly ProjectPart[],
  config: GalleyConfig,
  available?: ReadonlySet<string>,
  resolver?: FigureResolver,
): ProjectConvertResult {
  // Every definition in the book, made visible to every part before parsing —
  // see `sharedDefinitions`'s doc comment for why a reference resolves only
  // against a definition in the SAME parsed source.
  const shared = sharedDefinitions(parts)

  // Placed at the TOP of the body, not appended. A markdown definition is
  // document-scoped wherever it sits, and it serialises to nothing — but an
  // APPENDED block is swallowed whole by an unterminated construct. Measured:
  // a chapter ending in an unclosed ``` fence printed another chapter's
  // `[ref]: https://example.com` verbatim inside the reader's code block.
  // Nothing earlier in the file can swallow a definition placed first.
  const withDefinitions = (source: string): string => {
    if (shared.block === '') return source
    const { frontmatter, body } = splitFrontmatter(source)
    return joinFrontmatter(frontmatter, `${shared.block}\n\n${body}`)
  }

  const result = serializeParts(
    parts.map((part) => {
      // Same rule as `convert`: the embed rewrite is conversion's, never the
      // parser's, and it runs immediately before serialising.
      const tree = parseMarkdown(withDefinitions(part.source))
      applyWikilinkEmbeds(tree)
      return { tree, spec: part.spec, path: part.path }
    }),
    config,
    available,
    resolver,
  )
  return {
    tex: assemble(config, result),
    // The book-wide ones first: a clash between two chapters is a property of
    // the book, not of whichever chapter happens to be serialised second.
    diagnostics: [...shared.diagnostics, ...result.diagnostics],
    images: result.images,
  }
}
