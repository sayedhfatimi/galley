import { describe, expect, it } from 'vitest'
import { classifyImage } from '../images'
import { figureName } from './figures'

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

  it('is deterministic', () => {
    expect(figureName('ch1/diagram.png')).toBe(figureName('ch1/diagram.png'))
  })

  it('keeps the extension, so the result still classifies as supported', () => {
    const name = figureName('chapters/03-illusion/My Diagram (final).png')
    expect(name.endsWith('.png')).toBe(true)
    expect(classifyImage(name)).toMatchObject({ kind: 'supported' })
  })

  it('produces a name \\includegraphics can take verbatim', () => {
    // graphicx tokenises its argument: no spaces, braces, #, %, _ or &.
    expect(figureName('a b/c&d#e.png')).toMatch(/^[A-Za-z0-9.-]+$/)
  })
})
