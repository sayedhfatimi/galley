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

  it('is deterministic for a file and a folder sharing a stem', () => {
    const once = partOrder(['03-x/index.md', '03-x.md'])
    const twice = partOrder(['03-x.md', '03-x/index.md'])
    expect(once).toEqual(twice)
  })

  it('does not mutate its input', () => {
    const input = ['b.md', 'a.md']
    partOrder(input)
    expect(input).toEqual(['b.md', 'a.md'])
  })
})
