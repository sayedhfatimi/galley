/*
 * Shared types for the markdown ↔ ProseMirror converters.
 *
 * The PM JSON shape mirrors what TipTap returns from `editor.getJSON()`
 * and accepts in `editor.commands.setContent(json)`. We keep it loose
 * with `Record<string, unknown>` for attrs since attr shapes vary per
 * node/mark and the converters validate runtime invariants directly.
 */

export type PMMark = {
  type: string
  attrs?: Record<string, unknown>
}

export type PMNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  marks?: PMMark[]
  text?: string
}

export type PMDoc = {
  type: 'doc'
  content: PMNode[]
}
