import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * galley is a public repository, and parts of its editor were ported from a
 * private one. A comment naming an internal package, product or file path is a
 * leak that no other check would catch — it compiles, it type-checks, and it
 * reads as ordinary prose.
 *
 * This is here because the alternative was a line in a tracker asking a human to
 * remember to grep before committing, which is not a guard.
 *
 * "Valeon" alone is permitted: the product is published under that name and the
 * interface carries the attribution deliberately. What must not appear is the
 * organisation, its packages, or its other products.
 */
const FORBIDDEN = [
  'valeon-org',
  '@valeon',
  'plutarc',
  'vocasync',
  'gigfin',
  'vemail',
  'convex',
  'metadata panel',
]

const ROOT = resolve(import.meta.dirname, '../../..')
const SEARCHED = ['src', 'scripts', 'README.md', 'CLAUDE.md', 'index.html']

describe('public repository hygiene', () => {
  it('names no private repository, package or product', () => {
    let output = ''
    try {
      output = execFileSync('grep', ['-rin', '-E', FORBIDDEN.join('|'), ...SEARCHED], {
        cwd: ROOT,
        encoding: 'utf8',
      })
    } catch {
      // grep exits non-zero when it finds nothing, which is the passing case.
    }

    const hits = output
      .split('\n')
      .filter(Boolean)
      // This file necessarily contains the very strings it forbids.
      .filter((line) => !line.startsWith('src/core/__tests__/no-private-references'))

    expect(hits).toEqual([])
  })

  it('leaks no absolute path from a contributor machine', () => {
    let output = ''
    try {
      output = execFileSync('grep', ['-rn', '-E', '/home/[a-z]', ...SEARCHED], {
        cwd: ROOT,
        encoding: 'utf8',
      })
    } catch {
      // Nothing found.
    }
    const hits = output
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.startsWith('src/core/__tests__/no-private-references'))
    expect(hits).toEqual([])
  })
})
