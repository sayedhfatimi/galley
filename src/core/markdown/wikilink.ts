/**
 * Obsidian's `![[file.png]]` embed, rewritten into a standard mdast image.
 *
 * Syntax only: this records WHICH name was written, never which file it means.
 * Resolution belongs to `src/core/project/figures.ts`, so both embed syntaxes —
 * this one and `![](path)` — reach the serialiser as the same node type and the
 * serialiser needs no second branch.
 *
 * Applied by `latex/document.ts` on the conversion path, immediately before
 * serialising, and NEVER inside `parseMarkdown`. `parseMarkdown` is also the
 * rich editor's parse, and the editor serialises its tree straight back over
 * the author's file — so an embed rewritten at parse time is an embed destroyed
 * in a folder project's vault. `markdown/pm/roundtrip.test.ts` pins that.
 *
 * It is an explicit transform rather than a remark plugin because
 * `parseMarkdown` calls `processor.parse()`, which runs the parser only; a
 * plugin's transformer would never execute.
 */

import type { Image, Parent, PhrasingContent, Root, Text } from 'mdast'

/** `![[target]]` or `![[target|alias]]`, with no nested brackets. */
const EMBED = /!\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g

/**
 * A trailing extension — what tells an embedded FILE from an embedded NOTE.
 *
 * `![[Appendix A]]` transcludes a note, not a picture. Converted to an image it
 * reached the reader as "That image format cannot be typeset. Use PNG, JPG,
 * JPEG, PDF." — the wrong cause, in the exact case folder projects exist for.
 * galley does not transclude notes, so the only honest thing to do with one is
 * to leave the author's text exactly as written.
 *
 * Bounded at eight characters so a note titled `Chapter 3.2 Revisited` stays a
 * note; an image extension galley can typeset is at most four.
 */
const HAS_EXTENSION = /\.[A-Za-z0-9]{1,8}$/

function split(node: Text): PhrasingContent[] | null {
  EMBED.lastIndex = 0
  if (!EMBED.test(node.value)) return null
  EMBED.lastIndex = 0

  const out: PhrasingContent[] = []
  let cursor = 0
  let converted = false
  let match: RegExpExecArray | null = EMBED.exec(node.value)
  while (match !== null) {
    const target = match[1].trim()
    // A note transclusion is skipped WITHOUT moving the cursor, so its text
    // stays inside the next slice below and reaches the output byte for byte —
    // including when it shares a paragraph with a real embed.
    if (HAS_EXTENSION.test(target)) {
      if (match.index > cursor) {
        out.push({ type: 'text', value: node.value.slice(cursor, match.index) })
      }
      // The pipe portion is DISCARDED, never carried as alt text. In Obsidian
      // `![[cover.png|400]]` is a display width in pixels, so reading it as alt
      // text put `\caption{400}` under every sized figure in a real vault. An
      // embed therefore never captions itself; `![](path)` with real alt text
      // still does.
      const image: Image = { type: 'image', url: target, alt: '' }
      out.push(image)
      cursor = match.index + match[0].length
      converted = true
    }
    match = EMBED.exec(node.value)
  }
  // Nothing rewritten means nothing to rebuild: the caller must see the node
  // untouched rather than an identical copy of it.
  if (!converted) return null
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
      // A container is rewritten IN PLACE by this recursive call — it assigns
      // to its own `parent.children` — and deliberately does not set `changed`
      // here. That is correct, not an oversight: `changed` tracks whether THIS
      // array's own membership differs, and a container whose insides were
      // rewritten is still the same single child in the same position. The
      // node pushed below already carries the rewrite with it, so reassigning
      // `parent.children` would copy an array to no effect.
      if ('children' in child) walk(child as Parent)
      rebuilt.push(child)
    }

    if (changed) parent.children = rebuilt
  }

  walk(tree)
}
