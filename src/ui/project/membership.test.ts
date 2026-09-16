import { describe, expect, it } from 'vitest'
import { frontmatterData } from '@/core/markdown/frontmatter'
import { parseMarkdown } from '@/core/markdown/parse'
import { isPart, readPartSpec } from '@/core/project/spec'
import { applyMembership } from './membership'

const specOf = (source: string) =>
  readPartSpec(frontmatterData(parseMarkdown(source))).spec
const inBook = (source: string) => isPart(frontmatterData(parseMarkdown(source)))

describe('applyMembership', () => {
  it('promotes a note to a chapter', () => {
    const out = applyMembership('# A note\n\nText.\n', 'main')
    expect(inBook(out)).toBe(true)
    expect(specOf(out).role).toBe('main')
  })

  it('demotes a chapter to a note, leaving the file otherwise alone', () => {
    const source = '---\ngalley:\n  role: main\n---\n\n# A chapter\n\nText.\n'
    const out = applyMembership(source, 'note')
    expect(inBook(out)).toBe(false)
    expect(out).toContain('# A chapter')
    expect(out).toContain('Text.')
  })

  /**
   * Demoting must not move or rename anything. A file that is not in the book
   * is still listed under Notes — it has changed section, not disappeared —
   * and one more click brings it back.
   */
  it('is reversible', () => {
    const source = '---\ngalley:\n  role: back\n---\n\n# About\n'
    const back = applyMembership(applyMembership(source, 'note'), 'back')
    expect(specOf(back).role).toBe('back')
    expect(inBook(back)).toBe(true)
  })

  /**
   * Front matter is unnumbered — that is what it means. Carrying the old
   * value across would stamp an explicit `numbered: true` onto a dedication.
   */
  it("takes the new role's numbering when the role changes", () => {
    const source = '---\ngalley:\n  role: main\n---\n\n# Chapter\n'
    expect(specOf(source).numbered).toBe(true)
    expect(specOf(applyMembership(source, 'front')).numbered).toBe(false)
  })

  /**
   * The discriminating case, and it took finding.
   *
   * A role change only visibly resets numbering when the file carried an
   * EXPLICIT `numbered` differing from the DESTINATION role's default. Moving
   * a numbered main chapter to front matter gives false either way, because
   * front's default is already false — so the obvious test cannot tell the
   * reset from simply carrying the old value across. A front-matter part
   * explicitly numbered, moved to back matter, can.
   */
  it('does not carry explicit numbering into a role that defaults otherwise', () => {
    const source = '---\ngalley:\n  role: front\n  numbered: true\n---\n\n# Preface\n'
    expect(specOf(source).numbered).toBe(true)
    expect(specOf(applyMembership(source, 'back')).numbered).toBe(false)
  })

  it("keeps the author's own contents decisions across a move", () => {
    const source =
      '---\ngalley:\n  role: main\n  listed: false\n  toc_title: Short\n---\n\n# Long title\n'
    const out = applyMembership(source, 'back')
    expect(specOf(out).listed).toBe(false)
    expect(specOf(out).tocTitle).toBe('Short')
  })

  it('preserves every other frontmatter key, and their order', () => {
    const source =
      '---\ntags:\n  - draft\nauthor: A Writer\ngalley:\n  role: main\n---\n\n# A\n'
    const out = applyMembership(source, 'front')
    expect(out).toContain('tags:')
    expect(out).toContain('- draft')
    expect(out).toContain('author: A Writer')
    expect(out.indexOf('tags:')).toBeLessThan(out.indexOf('author:'))
  })

  /**
   * `writeFrontmatterKey` returns the source unchanged when the frontmatter
   * cannot be parsed. Silently doing nothing is the right outcome for the
   * FILE; the UI's job is to notice and say so, which is why this returns the
   * input rather than throwing.
   */
  it('leaves a file whose frontmatter cannot be parsed exactly as it was', () => {
    const source = '---\n: : :\n---\n\n# A\n'
    expect(applyMembership(source, 'main')).toBe(source)
  })

  it('does not throw on any of the shapes a real vault contains', () => {
    for (const source of [
      '',
      '---\n---\n\n# A\n',
      '---\ngalley: yes\n---\n\n# A\n',
      '# No frontmatter at all\n',
      '---\ngalley:\n---\n\n# A\n',
    ]) {
      for (const m of ['front', 'main', 'back', 'note'] as const) {
        expect(() => applyMembership(source, m)).not.toThrow()
      }
    }
  })
})
