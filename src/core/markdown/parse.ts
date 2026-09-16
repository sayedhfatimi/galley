/**
 * Markdown → mdast. Pure — no DOM, no React.
 *
 * CommonMark plus the GitHub extensions readers actually use, plus
 * dollar-delimited maths, plus YAML frontmatter.
 *
 * Note there is no `remark-rehype` stage and never will be. galley serialises
 * mdast straight to LaTeX; going via HTML is exactly the lossy path that makes
 * every other web converter produce a printed webpage instead of a book.
 */

import type { Root } from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { applyWikilinkEmbeds } from './wikilink'

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)
  .use(remarkMath)

/**
 * Parse Markdown into an mdast tree.
 *
 * This never throws on unrecognised content: anything outside the supported
 * grammar is carried through as literal text, which is what makes "conversion
 * to LaTeX cannot fail" true.
 */
export function parseMarkdown(source: string): Root {
  const tree = processor.parse(source) as Root
  // An explicit transform, not a `.use()` plugin: `.parse()` runs the parser
  // only, so a plugin's transformer would never execute.
  applyWikilinkEmbeds(tree)
  return tree
}
