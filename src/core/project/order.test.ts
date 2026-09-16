import { describe, expect, it } from 'vitest'
import { partOrder } from './order'

describe('partOrder', () => {
  it('sorts numerically, so 10 follows 9', () => {
    expect(partOrder(['10-j.md', '9-i.md', '2-b.md'])).toEqual([
      '2-b.md',
      '9-i.md',
      '10-j.md',
    ])
  })

  it('sorts by the full relative path, so per-chapter folders work', () => {
    expect(
      partOrder(['03-illusion/index.md', '01-copyright.md', '02-dedication.md']),
    ).toEqual(['01-copyright.md', '02-dedication.md', '03-illusion/index.md'])
  })

  // Measured: the case above does NOT discriminate — a comparator that sorted
  // on the basename alone produces the identical answer for it. This pair does:
  // every basename here is `index.md`, so only the directory can order them.
  it('orders per-chapter folders by their directory, not their filename', () => {
    expect(partOrder(['10-b/index.md', '2-a/index.md'])).toEqual([
      '2-a/index.md',
      '10-b/index.md',
    ])
  })

  // Named for what it actually pins. These two do NOT tie the collator
  // (`compare('03-x/index.md', '03-x.md')` is 1, not 0) — the real tie case is
  // below. What this catches is a comparator that always returns 0, which sort
  // stability would otherwise hide.
  it('gives the same answer whichever order the paths arrive in', () => {
    const once = partOrder(['03-x/index.md', '03-x.md'])
    const twice = partOrder(['03-x.md', '03-x/index.md'])
    expect(once).toEqual(twice)
  })

  // Measured: `numeric: true` makes '01' and '1' compare EQUAL, so a folder
  // holding both `1-intro.md` and `01-intro.md` ties the collator. Without the
  // explicit tiebreak the result falls through to whatever order the caller
  // happened to pass them in, i.e. filesystem enumeration order.
  it('is a total order even when the collator ties', () => {
    expect(partOrder(['01-a.md', '1-a.md'])).toEqual(['01-a.md', '1-a.md'])
    expect(partOrder(['1-a.md', '01-a.md'])).toEqual(['01-a.md', '1-a.md'])
  })

  it('does not mutate its input', () => {
    const input = ['b.md', 'a.md']
    partOrder(input)
    expect(input).toEqual(['b.md', 'a.md'])
  })
})
