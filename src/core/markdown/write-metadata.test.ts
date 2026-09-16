import { describe, expect, it } from 'vitest'
import { extractFrontmatter, writeMetadata } from './frontmatter'
import { parseMarkdown } from './parse'

const read = (source: string) => extractFrontmatter(parseMarkdown(source))

/**
 * The counterpart to `extractFrontmatter`, which had none.
 *
 * `writeBookConfig` writes only the `book:` key; the title, subtitle, author
 * and date are ordinary top-level keys. Without a writer, editing the title of
 * a folder project changed the field on screen and never reached `book.md`.
 */
describe('writeMetadata', () => {
  it('writes into a file that has no frontmatter at all', () => {
    const out = writeMetadata('# A book\n', { title: 'The Illusion' })
    expect(read(out).title).toBe('The Illusion')
    expect(out).toContain('# A book')
  })

  it('round-trips every field it reads', () => {
    const metadata = {
      title: 'The Illusion',
      subtitle: 'A study',
      author: 'A Writer',
      date: '2026',
    }
    expect(read(writeMetadata('---\n---\n\n# A\n', metadata))).toEqual(metadata)
  })

  /**
   * `author`, `authors` and `by` all read as the author. Writing `author:`
   * into a file that says `authors:` leaves a stale key that STILL PARSES,
   * and `extractFrontmatter` prefers the one the reader did not edit — so the
   * panel would show one name and the book would print another.
   */
  it.each([
    ['authors', 'author'],
    ['by', 'author'],
    ['sub_title', 'subtitle'],
    ['description', 'subtitle'],
    ['created', 'date'],
    ['published', 'date'],
  ])('writes back to %s rather than introducing %s', (alias, canonical) => {
    const source = `---\n${alias}: old value\n---\n\n# A\n`
    const field =
      canonical === 'author' ? 'author' : canonical === 'subtitle' ? 'subtitle' : 'date'
    const out = writeMetadata(source, { [field]: 'new value' })

    expect(out).toContain(`${alias}: new value`)
    expect(out).not.toContain(`${canonical}: new value`)
    expect(read(out)[field as 'author']).toBe('new value')
  })

  it('uses the canonical key when the file uses none of the aliases', () => {
    const out = writeMetadata('---\ntags: [x]\n---\n\n# A\n', { author: 'A Writer' })
    expect(out).toContain('author: A Writer')
  })

  /**
   * A `title:` with nothing after it is not the same as no title, and someone
   * who cleared the box meant the second.
   */
  it('removes the key when a field is cleared', () => {
    const source = '---\ntitle: Old\nauthor: A Writer\n---\n\n# A\n'
    const out = writeMetadata(source, { author: 'A Writer' })
    expect(read(out).title).toBeUndefined()
    expect(out).not.toContain('title:')
    expect(read(out).author).toBe('A Writer')
  })

  it('leaves every other key, its order and its comments alone', () => {
    const source =
      '---\n# a comment\ntags:\n  - draft\ntitle: Old\ncssclass: wide\n---\n\n# A\n'
    const out = writeMetadata(source, { title: 'New' })
    expect(out).toContain('# a comment')
    expect(out).toContain('- draft')
    expect(out).toContain('cssclass: wide')
    expect(out.indexOf('tags:')).toBeLessThan(out.indexOf('cssclass:'))
    expect(read(out).title).toBe('New')
  })

  it('leaves the book: block untouched', () => {
    const source = '---\nbook:\n  typeface: pagella\ntitle: Old\n---\n\n# A\n'
    const out = writeMetadata(source, { title: 'New' })
    expect(out).toContain('typeface: pagella')
  })

  /**
   * `writeFrontmatterKey` returns the source unchanged when the frontmatter
   * cannot be parsed. Doing nothing is right for the FILE; the UI's job is to
   * notice and say so.
   */
  it('returns a file it cannot parse exactly as it was', () => {
    const source = '---\n: : :\n---\n\n# A\n'
    expect(writeMetadata(source, { title: 'New' })).toBe(source)
  })

  it('does not throw on any shape a real vault contains', () => {
    for (const source of ['', '---\n---\n', '# No frontmatter\n', '---\ntitle:\n---\n']) {
      expect(() => writeMetadata(source, { title: 'X', author: 'Y' })).not.toThrow()
    }
  })
})
