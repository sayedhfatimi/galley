import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Diagnostic, DiagnosticCollector } from '@/core/diagnostics'
import { Diagnostics } from './Diagnostics'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    root = createRoot(container)
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (items: Diagnostic[]) =>
  act(() => root.render(<Diagnostics items={items} />))
const alerts = () => container.querySelectorAll('[class*="pr-10"]')

describe('Diagnostics', () => {
  it('shows nothing when there is nothing to say', () => {
    render([])
    expect(container.textContent).toBe('')
  })

  it('names the file a notice belongs to', () => {
    render([
      { kind: 'raw-html', message: 'HTML cannot be typeset.', file: '19-mirror.md' },
    ])
    expect(container.textContent).toContain('19-mirror.md')
  })

  /**
   * The case the old key could not see.
   *
   * Two chapters with the SAME kind and the SAME detail were one alert, and
   * dismissing it dismissed both — so a problem in chapter 19 disappeared
   * because the reader had already acknowledged the identical one in chapter
   * 3. A test using differing details passes under the old key too, which is
   * why both of these are identical but for the file.
   */
  it('keeps two files apart when the problem is otherwise identical', () => {
    render([
      {
        kind: 'raw-html',
        message: 'HTML cannot be typeset.',
        detail: '<br>',
        file: 'a.md',
      },
      {
        kind: 'raw-html',
        message: 'HTML cannot be typeset.',
        detail: '<br>',
        file: 'b.md',
      },
    ])
    expect(alerts()).toHaveLength(2)
  })

  it('dismisses one file without dismissing the other', () => {
    render([
      {
        kind: 'raw-html',
        message: 'HTML cannot be typeset.',
        detail: '<br>',
        file: 'a.md',
      },
      {
        kind: 'raw-html',
        message: 'HTML cannot be typeset.',
        detail: '<br>',
        file: 'b.md',
      },
    ])
    const dismiss = container.querySelector('button')
    act(() => dismiss?.click())

    expect(alerts()).toHaveLength(1)
    expect(container.textContent).toContain('b.md')
    expect(container.textContent).not.toContain('a.md')
  })

  /**
   * De-duplication belongs to core, not here.
   *
   * `DiagnosticCollector` already keys on kind + detail + file, so two truly
   * identical notices never reach this component — which is what makes the
   * React key above safe. Asserted against the collector rather than
   * re-implemented here, because two places owning one fact is the shape this
   * project keeps paying for.
   */
  it('is given already-unique notices by core', () => {
    const collector = new DiagnosticCollector()
    collector.add('raw-html', 'x', '<br>', 'a.md')
    collector.add('raw-html', 'x', '<br>', 'a.md')
    collector.add('raw-html', 'x', '<br>', 'b.md')

    const items = collector.list()
    expect(items).toHaveLength(2)

    render(items)
    expect(alerts()).toHaveLength(2)
    const keys = items.map((d) => `${d.kind}:${d.detail}:${d.file}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('shows a book-level notice that names no file', () => {
    render([{ kind: 'structure-order', message: 'Back matter came before a chapter.' }])
    expect(alerts()).toHaveLength(1)
    expect(container.textContent).toContain('Back matter')
  })
})
