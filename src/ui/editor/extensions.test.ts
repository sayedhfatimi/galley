import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSchema } from '@tiptap/core'
import { Node as PMNode } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '@/core/markdown/parse'
import { mdastToPm } from '@/core/markdown/pm/mdast-to-pm'
import { createExtensions } from './extensions'

/**
 * The bridge and the schema must agree on the node vocabulary.
 *
 * ProseMirror does not skip a node it does not recognise — it rejects the whole
 * document, so a single unregistered type renders the manuscript as an empty
 * editor. That is exactly what an unregistered `image` did: every document
 * containing one came up blank, while the PDF built from the same source was
 * perfect, because the PDF never goes through the schema.
 *
 * `roundtrip.test.ts` could not catch it. It walks mdast → PM → mdast as plain
 * data and never constructs the schema, so the two halves were each correct and
 * the join between them was not.
 */
describe('editor schema', () => {
  const schema = getSchema(createExtensions())

  it('accepts every node the Markdown bridge can produce', () => {
    const fixture = readFileSync(
      join(import.meta.dirname, '../../core/__fixtures__/manuscript.md'),
      'utf8',
    )
    const doc = mdastToPm(parseMarkdown(fixture))
    expect(() => PMNode.fromJSON(schema, doc)).not.toThrow()
  })

  it.each([
    'An image: ![alt text](figures/diagram.png)',
    '![](bare.png)',
    'Inline maths $a^2$ and display:\n\n$$\nx = 1\n$$',
    'A footnote.[^n]\n\n[^n]: The note.',
    '| a | b |\n| - | - |\n| 1 | 2 |',
    '- [x] done\n- [ ] not done\n- plain item',
    '###### A sixth-level heading',
  ])('accepts %j', (markdown) => {
    const doc = mdastToPm(parseMarkdown(markdown))
    expect(() => PMNode.fromJSON(schema, doc)).not.toThrow()
  })
})
