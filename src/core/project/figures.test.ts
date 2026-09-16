import { describe, expect, it } from 'vitest'
import { classifyImage } from '../images'
import { buildFigureResolver, figureName } from './figures'

describe('figureName', () => {
  it('distinguishes same-named files in different folders', () => {
    expect(figureName('ch1/diagram.png')).not.toBe(figureName('ch3/diagram.png'))
  })

  // The truncation defect: sanitizeImageName slices the stem to 64 characters,
  // so two paths sharing a long prefix would otherwise produce one name.
  it('distinguishes paths that share a 64-character prefix', () => {
    const prefix = 'a'.repeat(70)
    expect(figureName(`${prefix}/one.png`)).not.toBe(figureName(`${prefix}/two.png`))
  })

  // Pins the flatten step, which nothing else does: removing it still yields
  // unique names (the fingerprint alone separates them), so only legibility
  // catches the regression.
  it('carries the directory into the name, not just the filename', () => {
    const name = figureName('chapters/03-illusion/diagram.png')
    expect(name).toContain('chapters')
    expect(name).toContain('03-illusion')
    expect(name).toContain('diagram')
  })

  it('is deterministic', () => {
    expect(figureName('ch1/diagram.png')).toBe(figureName('ch1/diagram.png'))
  })

  it('keeps the extension, so the result still classifies as supported', () => {
    const name = figureName('chapters/03-illusion/My Diagram (final).png')
    expect(name.endsWith('.png')).toBe(true)
    expect(classifyImage(name)).toMatchObject({ kind: 'supported' })
  })

  /**
   * Pins that the fingerprint is taken over the PATH, not over the flattened
   * string. Mutating `fingerprint(relativePath)` to `fingerprint(flattened)`
   * passes every other test here: the flatten collapses `/` and `\\` to the
   * same dash, so two genuinely different paths would then fingerprint
   * identically and collide on one engine-side name. Path identity is the
   * whole premise of this module.
   */
  it('fingerprints the path, not the flattened name', () => {
    expect(figureName('a/b.png')).not.toBe(figureName('a\\b.png'))
  })

  it('produces a name \\includegraphics can take verbatim', () => {
    // graphicx tokenises its argument: no spaces, braces, #, %, _ or &.
    expect(figureName('a b/c&d#e.png')).toMatch(/^[A-Za-z0-9.-]+$/)
  })
})

describe('buildFigureResolver', () => {
  const paths = [
    'cover.png',
    'figures/shared.png',
    'ch1/diagram.png',
    'ch3/diagram.png',
    'ch3/deep/nested.png',
  ]
  const resolve = buildFigureResolver(paths)

  it('resolves a path relative to the referring file first', () => {
    expect(resolve('diagram.png', 'ch1/chapter.md')).toBe('ch1/diagram.png')
    expect(resolve('diagram.png', 'ch3/chapter.md')).toBe('ch3/diagram.png')
  })

  it('resolves an explicit relative path', () => {
    expect(resolve('deep/nested.png', 'ch3/chapter.md')).toBe('ch3/deep/nested.png')
  })

  it('resolves from the project root', () => {
    expect(resolve('figures/shared.png', 'ch1/chapter.md')).toBe('figures/shared.png')
  })

  it('falls back to a name search across the project, like Obsidian', () => {
    expect(resolve('cover.png', 'ch3/deep/chapter.md')).toBe('cover.png')
  })

  it('picks the shallowest match deterministically when a name repeats', () => {
    const r = buildFigureResolver(['a/x.png', 'x.png', 'b/c/x.png'])
    expect(r('x.png', 'zz/chapter.md')).toBe('x.png')
  })

  it('normalises ./ and leading slashes', () => {
    expect(resolve('./diagram.png', 'ch1/chapter.md')).toBe('ch1/diagram.png')
    expect(resolve('/cover.png', 'ch1/chapter.md')).toBe('cover.png')
  })

  it('returns null for a reference that resolves nowhere in the project', () => {
    expect(resolve('missing.png', 'ch1/chapter.md')).toBeNull()
  })

  // A reference that climbs out of the project collapses to the root rather
  // than escaping: `normalise` pops on an empty array, which is a no-op. The
  // result can only ever match something in `figurePaths`, so nothing outside
  // the project is reachable — but that is a property worth pinning rather
  // than an accident of `Array.pop`, because Task 10 builds diagnostics on it.
  it('cannot resolve outside the project folder', () => {
    expect(resolve('../../cover.png', 'ch1/chapter.md')).toBe('cover.png')
    expect(resolve('../../../nope.png', 'ch3/deep/chapter.md')).toBeNull()
  })

  // The above "falls back to a name search" case is satisfied by 'cover.png'
  // sitting at the project root, so exact.has(wanted) alone (step 2) already
  // resolves it without ever reaching the by-name bucket (step 3). This case
  // has no root-level or relative match at all, so only the name-search
  // fallback can answer it.
  it('finds a figure by name when it is nested, not at the project root', () => {
    const r = buildFigureResolver(['assets/cover.png', 'ch1/chapter1.png'])
    expect(r('cover.png', 'ch3/deep/chapter.md')).toBe('assets/cover.png')
  })

  // The brief's tie-break case includes a root-level 'x.png', which
  // exact.has(wanted) resolves directly — the by-name bucket's sort never
  // runs. With no root-level match and two same-depth candidates, only a
  // depth-first-then-lexicographic sort picks 'art/x.png': plain insertion
  // order would keep 'zoo/x.png' (added first), and a lexicographic-only sort
  // would pick the deeper 'a/b/x.png' ('/' sorts before 'r').
  it('breaks a same-depth name collision lexicographically, depth taking priority', () => {
    const r = buildFigureResolver(['zoo/x.png', 'art/x.png', 'a/b/x.png'])
    expect(r('x.png', 'nowhere/chapter.md')).toBe('art/x.png')
  })
})

/**
 * Percent-encoding, which is what Obsidian writes into `![](…)` when wikilinks
 * are turned off. `normalise` never decoded, so a figure that displays
 * perfectly in the author's vault silently failed to resolve in galley — and
 * "resolves in Obsidian, breaks in galley" is the exact problem folder
 * projects exist to remove.
 */
describe('buildFigureResolver — percent-encoded references', () => {
  const resolve = buildFigureResolver([
    'figures/my file.png',
    'ch1/a+b.png',
    'ch2/100% done.png',
  ])

  it.each([
    ['a space', 'figures/my%20file.png', 'figures/my file.png'],
    [
      'a space, from the referring directory',
      '../figures/my%20file.png',
      'figures/my file.png',
    ],
    ['a plus, which is NOT a space in a path', 'ch1/a+b.png', 'ch1/a+b.png'],
    ['an encoded percent', 'ch2/100%25%20done.png', 'ch2/100% done.png'],
  ])('resolves %s', (_name, reference, expected) => {
    expect(resolve(reference, 'ch1/chapter.md')).toBe(expected)
  })

  /**
   * `decodeURIComponent` THROWS on a malformed escape, and `src/core` never
   * throws — a broken reference in one chapter must not take down the
   * conversion of the whole book. Each of these is a real thing a hand-typed
   * path can contain.
   */
  it.each([
    ['a truncated escape', 'figures/%zz.png'],
    ['a lone percent', 'figures/100%.png'],
    ['a trailing percent', 'figures/x%'],
    ['an incomplete pair', 'figures/%A'],
  ])('does not throw on %s', (_name, reference) => {
    expect(() => resolve(reference, 'ch1/chapter.md')).not.toThrow()
  })

  /**
   * Decoding must be per SEGMENT. `%2F` is a literal slash inside a filename,
   * and decoding the whole path at once would turn it into a directory
   * separator and resolve to a file the author never named.
   */
  it('does not let an encoded slash become a path separator', () => {
    const resolver = buildFigureResolver(['ch1/a/b.png', 'ch1/a%2Fb.png'])
    expect(resolver('a%2Fb.png', 'ch1/chapter.md')).not.toBe('ch1/a/b.png')
  })
})

/**
 * Obsidian resolves an embed by name case-insensitively, so `![[Diagram.png]]`
 * finds `diagram.png` there and missed it here.
 *
 * Only the by-NAME fallback folds case. An exact path is a real filesystem
 * entry and a real filesystem entry has a real name — folding there would let
 * `![](Diagram.png)` silently resolve to a different file on a case-sensitive
 * disk.
 */
describe('buildFigureResolver — case', () => {
  it('finds a figure by name whatever the casing', () => {
    const resolve = buildFigureResolver(['ch1/diagram.png', 'figures/Cover.PNG'])
    expect(resolve('Diagram.png', 'ch9/chapter.md')).toBe('ch1/diagram.png')
    expect(resolve('cover.png', 'ch9/chapter.md')).toBe('figures/Cover.PNG')
  })

  it('prefers the exact-cased path over a name-folded match', () => {
    const resolve = buildFigureResolver(['Diagram.png', 'a/diagram.png'])
    expect(resolve('Diagram.png', 'chapter.md')).toBe('Diagram.png')
    expect(resolve('diagram.png', 'chapter.md')).toBe('a/diagram.png')
  })

  it('still breaks a folded collision deterministically', () => {
    const one = buildFigureResolver(['b/Diagram.png', 'a/diagram.png'])
    const other = buildFigureResolver(['a/diagram.png', 'b/Diagram.png'])
    expect(one('DIAGRAM.PNG', 'ch/x.md')).toBe(other('DIAGRAM.PNG', 'ch/x.md'))
  })
})
