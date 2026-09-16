import { describe, expect, it } from 'vitest'
import { DiagnosticCollector } from './diagnostics'

describe('DiagnosticCollector', () => {
  it('de-duplicates the same kind and detail within one file', () => {
    const diagnostics = new DiagnosticCollector()
    diagnostics.add('image-unsupported', 'message', 'cover.png', '01-a.md')
    diagnostics.add('image-unsupported', 'message', 'cover.png', '01-a.md')
    expect(diagnostics.list()).toHaveLength(1)
  })

  it('does not collapse the same kind and detail across different files', () => {
    const diagnostics = new DiagnosticCollector()
    diagnostics.add('image-unsupported', 'message', 'cover.png', '01-a.md')
    diagnostics.add('image-unsupported', 'message', 'cover.png', '02-b.md')
    const items = diagnostics.list()
    expect(items).toHaveLength(2)
    expect(items.map((d) => d.file)).toEqual(['01-a.md', '02-b.md'])
  })

  it('omits the file field entirely when none is given', () => {
    const diagnostics = new DiagnosticCollector()
    diagnostics.add('raw-html', 'message', '<div>')
    expect(diagnostics.list()[0]).not.toHaveProperty('file')
  })
})
