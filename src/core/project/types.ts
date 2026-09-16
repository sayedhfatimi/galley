/** The shapes a folder project is read into. Pure — no DOM. */

import type { GalleyConfig, Metadata } from '../config'
import type { Diagnostic } from '../diagnostics'
import type { PartSpec } from '../structure'

/** A Markdown file that is part of the book. */
export interface ProjectPart {
  /** Project-relative, forward-slashed. */
  path: string
  source: string
  spec: PartSpec
}

/** A Markdown file that is not part of the book: editable, never typeset. */
export interface ProjectNote {
  path: string
  source: string
}

export interface Project {
  /** In reading order. */
  parts: ProjectPart[]
  notes: ProjectNote[]
  /** Project-relative paths of every image file found. */
  figures: string[]
  metadata: Metadata
  /** The book's settings from `book.md`, to be layered over a preset. */
  config: Partial<GalleyConfig>
  diagnostics: Diagnostic[]
}

/**
 * Which project file a figure reference means, or null when nothing in the
 * project matches. `fromPart` is the project-relative path of the file the
 * reference was written in.
 */
export type FigureResolver = (reference: string, fromPart: string) => string | null
