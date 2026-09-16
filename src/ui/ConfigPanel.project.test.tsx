import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { presetFor } from '@/core/config'
import { ConfigPanel } from './ConfigPanel'

/**
 * The Structure section leaves Document setup in a folder project.
 *
 * A part is a FILE there, so its role is set in the sidebar beside the file it
 * belongs to — keying structure off one document's headings has nothing to key
 * against. This is also what unblocks the queued redesign in `issues/open.md`:
 * the question it waited on was whether that list belonged in this dialog at
 * all, and the answer is no.
 */

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

const render = (withSource: boolean) =>
  act(() =>
    root.render(
      <ConfigPanel
        config={presetFor('book')}
        onChange={() => {}}
        prefilled={false}
        source={withSource ? '# A\n\n# B\n' : undefined}
        onSourceChange={withSource ? () => {} : undefined}
      />,
    ),
  )

describe('ConfigPanel', () => {
  it('shows the Structure section for a single document', () => {
    render(true)
    expect(container.textContent).toContain('Structure')
  })

  /**
   * Absent, not disabled. A control that is inert half the time is the failure
   * this project has already fixed twice.
   */
  it('omits it entirely in a folder project', () => {
    render(false)
    expect(container.textContent).not.toContain('Structure')
  })

  it('keeps every other setting in both', () => {
    for (const withSource of [true, false]) {
      render(withSource)
      const text = container.textContent ?? ''
      expect(text).toContain('Page size')
      expect(text).toContain('Typeface')
      expect(text).toContain('Title page')
    }
  })
})
