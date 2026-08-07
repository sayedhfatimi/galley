import { describe, expect, it } from 'vitest'
import { pageCountFromLog } from './pagecount'

describe('pageCountFromLog', () => {
  it('reads a single page, which TeX writes in the singular', () => {
    expect(pageCountFromLog('Output written on p.pdf (1 page).')).toBe(1)
  })

  it('reads a multi-page count with a byte size after it', () => {
    expect(pageCountFromLog('Output written on main.xdv (9 pages, 55112 bytes).')).toBe(9)
  })

  // The log carries both stages; the second is the one that produced the PDF.
  it('takes the last stage when the log holds several', () => {
    const log = [
      'Output written on main.xdv (4 pages, 1000 bytes).',
      'some dvipdfmx chatter',
      'Output written on main.pdf (9 pages, 55112 bytes).',
    ].join('\n')
    expect(pageCountFromLog(log)).toBe(9)
  })

  it('returns null when the run produced nothing', () => {
    expect(pageCountFromLog('! Emergency stop.\nNo pages of output.')).toBeNull()
    expect(pageCountFromLog('')).toBeNull()
  })
})
