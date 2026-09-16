/**
 * A folder of files becomes a book.
 *
 * A project IS a folder — it may be a whole Obsidian vault, or one book among
 * several inside one. Every Markdown file in it is editable; the ones carrying a
 * `galley:` block are the book and the rest are notes. Notes are not an ignore
 * rule: they are how a book gets written, and they reach the UI as first-class
 * files. What they never reach is the typeset output.
 */

import type { GalleyConfig, Metadata } from '../config'
import { DiagnosticCollector } from '../diagnostics'
import { SUPPORTED_IMAGE_EXTENSIONS } from '../images'
import { extractFrontmatter, frontmatterData } from '../markdown/frontmatter'
import { parseMarkdown } from '../markdown/parse'
import { readBookConfig } from './config'
import { partOrder } from './order'
import { isPart, readPartSpec } from './spec'
import type { Project, ProjectNote, ProjectPart } from './types'

/** The file at the project root that carries the book's metadata and settings. */
export const BOOK_FILE = 'book.md'

export interface SourceFile {
  /** Project-relative, forward-slashed. */
  path: string
  source: string
}

/**
 * A dotfolder is the application's, not the author's. `.obsidian/` is the one
 * that matters — never enumerate or write inside it — but the rule is general,
 * because `.trash/` and `.git/` are equally not chapters.
 */
function hidden(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'))
}

function isImage(path: string): boolean {
  const dot = path.lastIndexOf('.')
  const extension = dot > 0 ? path.slice(dot).toLowerCase() : ''
  return (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)
}

export function readProject(
  markdown: readonly SourceFile[],
  assetPaths: readonly string[],
): Project {
  const diagnostics = new DiagnosticCollector()
  const visible = markdown.filter((file) => !hidden(file.path))

  const byPath = new Map(visible.map((file) => [file.path, file]))
  const book = byPath.get(BOOK_FILE)

  let metadata: Metadata = {}
  let config: Partial<GalleyConfig> = {}
  if (book) {
    const tree = parseMarkdown(book.source)
    const data = frontmatterData(tree)
    metadata = extractFrontmatter(tree)
    config = readBookConfig(data)
    // `book.md` is the book, never a chapter of it. An author who copies a
    // chapter's frontmatter in would otherwise see nothing happen at all.
    if (isPart(data)) {
      diagnostics.add(
        'project-book-not-a-part',
        'book.md holds the book’s own settings and is never a chapter, so its galley: block does nothing. Use book: for the book’s settings.',
        undefined,
        BOOK_FILE,
      )
    }
  }

  const parts: ProjectPart[] = []
  const notes: ProjectNote[] = []

  for (const path of partOrder([...byPath.keys()])) {
    if (path === BOOK_FILE) continue
    const file = byPath.get(path)
    if (!file) continue

    const data = frontmatterData(parseMarkdown(file.source))
    if (!isPart(data)) {
      notes.push({ path, source: file.source })
      continue
    }

    const { spec, malformed } = readPartSpec(data)
    if (malformed) {
      diagnostics.add(
        'project-part-malformed',
        'This file’s galley settings could not be read, so it was included with the usual settings for a chapter. Check its frontmatter.',
        undefined,
        path,
      )
    }
    parts.push({ path, source: file.source, spec })
  }

  const figures = partOrder(assetPaths.filter((p) => !hidden(p) && isImage(p)))

  return { parts, notes, figures, metadata, config, diagnostics: diagnostics.list() }
}
