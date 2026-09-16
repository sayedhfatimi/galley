/**
 * Obsidian's `![[file.png]]` embed, rewritten into a standard mdast image.
 *
 * Syntax only: this records WHICH name was written, never which file it means.
 * Resolution belongs to `src/core/project/figures.ts`, so both embed syntaxes —
 * this one and `![](path)` — reach the serialiser as the same node type and the
 * serialiser needs no second branch.
 *
 * Applied as an explicit transform rather than a remark plugin because
 * `parseMarkdown` calls `processor.parse()`, which runs the parser only; a
 * plugin's transformer would never execute.
 */

import type { Image, Parent, PhrasingContent, Root, Text } from 'mdast'

/** `![[target]]` or `![[target|alias]]`, with no nested brackets. */
const EMBED = /!\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g

function split(node: Text): PhrasingContent[] | null {
  EMBED.lastIndex = 0
  if (!EMBED.test(node.value)) return null
  EMBED.lastIndex = 0

  const out: PhrasingContent[] = []
  let cursor = 0
  let match: RegExpExecArray | null = EMBED.exec(node.value)
  while (match !== null) {
    if (match.index > cursor) {
      out.push({ type: 'text', value: node.value.slice(cursor, match.index) })
    }
    const image: Image = {
      type: 'image',
      url: match[1].trim(),
      alt: (match[2] ?? '').trim(),
    }
    out.push(image)
    cursor = match.index + match[0].length
    match = EMBED.exec(node.value)
  }
  if (cursor < node.value.length) {
    out.push({ type: 'text', value: node.value.slice(cursor) })
  }
  return out
}

export function applyWikilinkEmbeds(tree: Root): void {
  const walk = (parent: Parent): void => {
    const rebuilt: typeof parent.children = []
    let changed = false

    for (const child of parent.children) {
      // No opaque-node guard is needed, and one would be inert. Measured:
      // `code`, `inlineCode`, `math`, `inlineMath`, `yaml` and `html` are all
      // mdast LEAF nodes — they carry a `value` string and have no `children`
      // — so the walk never descends into them and their content never reaches
      // this loop as a `text` node. A guard listing them would be a control
      // that does nothing, which is a bug shape this project has already fixed
      // twice. The code-block tests below pin the behaviour regardless.
      if (child.type === 'text') {
        const pieces = split(child as Text)
        if (pieces === null) {
          rebuilt.push(child)
        } else {
          rebuilt.push(...(pieces as typeof parent.children))
          changed = true
        }
        continue
      }
      if ('children' in child) walk(child as Parent)
      rebuilt.push(child)
    }

    if (changed) parent.children = rebuilt
  }

  walk(tree)
}
