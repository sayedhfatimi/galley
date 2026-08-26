import { describe, expect, it } from 'vitest'
import { imageFilesFrom, looksLikeFigure } from './attachImage'

const file = (name: string, type: string) =>
  new File([new Uint8Array([1, 2, 3])], name, { type })

/**
 * The case this guards was found by dropping a PDF into the running app: a PDF
 * is a supported figure but is NOT `image/*`, so it fell through to the branch
 * that opens a dropped file AS the document — and the manuscript was replaced
 * with the PDF's own bytes rendered as text.
 */
describe('looksLikeFigure', () => {
  it('accepts a PDF, which is a figure but not an image MIME type', () => {
    expect(looksLikeFigure(file('fig.pdf', 'application/pdf'))).toBe(true)
  })

  it('accepts any image type', () => {
    expect(looksLikeFigure(file('a.png', 'image/png'))).toBe(true)
    expect(looksLikeFigure(file('a.jpg', 'image/jpeg'))).toBe(true)
  })

  it('counts an unsupported image as an attempt, so it can be refused by name', () => {
    // Better a clear "cannot be typeset" than being read in as prose.
    expect(looksLikeFigure(file('a.svg', 'image/svg+xml'))).toBe(true)
  })

  it('falls back to the name when the source supplies no MIME type', () => {
    expect(looksLikeFigure(file('chart.png', ''))).toBe(true)
    expect(looksLikeFigure(file('notes.md', ''))).toBe(false)
  })

  it('leaves Markdown and text alone, so they still open as the document', () => {
    expect(looksLikeFigure(file('notes.md', 'text/markdown'))).toBe(false)
    expect(looksLikeFigure(file('notes.txt', 'text/plain'))).toBe(false)
  })
})

describe('imageFilesFrom', () => {
  it('picks out the figures and ignores the rest', () => {
    const list = [
      file('a.png', 'image/png'),
      file('notes.md', 'text/markdown'),
      file('fig.pdf', 'application/pdf'),
    ] as unknown as FileList
    expect(imageFilesFrom(list).map((f) => f.name)).toEqual(['a.png', 'fig.pdf'])
  })

  it('returns nothing for an absent list', () => {
    expect(imageFilesFrom(null)).toEqual([])
  })
})
