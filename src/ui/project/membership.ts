import { frontmatterData } from '@/core/markdown/frontmatter'
import { parseMarkdown } from '@/core/markdown/parse'
import { readPartSpec, writePartSpec } from '@/core/project/spec'
import { type PartRole, partSpecFields, resolvePart } from '@/core/structure'

/**
 * Moving a file into the book, out of it, or between its divisions.
 *
 * This is the one control the whole "notes are first-class" decision rests
 * on: membership is a property of the FILE, visible and changeable in one
 * place, rather than a rule about where the file has to live. So it writes
 * the author's frontmatter, and it does so through `writePartSpec` →
 * `writeFrontmatterKey`, which preserves every other key, their order, and
 * their comments.
 */

export type Membership = PartRole | 'note'

/**
 * The file's source with its membership changed, or the source unchanged when
 * nothing needs to happen.
 *
 * **Changing role resets `numbered` to that role's default and keeps
 * everything else.** A chapter moved to front matter should stop being
 * numbered — that is what front matter means — and carrying the old value
 * across would write an explicit `numbered: true` onto a dedication. `listed`
 * and `toc_title` are the author's own decisions and survive the move.
 */
export function applyMembership(source: string, membership: Membership): string {
  if (membership === 'note') return writePartSpec(source, null)

  const data = frontmatterData(parseMarkdown(source))
  const current = readPartSpec(data).spec
  // Rebuilt through `partSpecFields` → `resolvePart` rather than spread, so
  // the role default for `numbered` is applied by the one function that owns
  // it instead of being restated here.
  const fields = partSpecFields(current)
  delete fields.numbered
  return writePartSpec(source, resolvePart({ ...fields, role: membership }))
}
