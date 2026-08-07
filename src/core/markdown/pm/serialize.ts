import type { Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { pmToMdast } from './pm-to-mdast'
import type { PMDoc } from './types'

/**
 * ProseMirror JSON → Markdown. Pure — no DOM, no React.
 *
 * Markdown stays galley's single source of truth: the store holds it, the
 * converter reads it, the source view shows it, and it is what persists. The
 * rich editor is a *view* over that string rather than a parallel model, which
 * keeps one representation authoritative instead of two that can drift.
 *
 * The options below are chosen for stability rather than taste — a round trip
 * should not reflow a document a writer has already formatted.
 */
const processor = unified()
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '*',
    strong: '*',
    fence: '`',
    fences: true,
    listItemIndent: 'one',
    rule: '-',
    ruleSpaces: false,
    tightDefinitions: true,
  })
  .use(remarkGfm)
  .use(remarkMath)

export function serializeToMarkdown(doc: PMDoc): string {
  const tree = pmToMdast(doc) as Root
  return `${processor.stringify(tree).trimEnd()}\n`
}
