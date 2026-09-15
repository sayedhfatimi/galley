import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TocTitleInput } from './ConfigPanel'

/**
 * Critical 2: the Contents-entry field must accept a space.
 *
 * No component-testing library is set up in this repo yet, so this drives
 * `TocTitleInput` directly with `react-dom/client` — setting the native input
 * value through its own property setter (the same trick Testing Library uses
 * internally) so React's synthetic `onChange` actually fires, rather than
 * mutating `.value` directly, which React would not notice.
 */

const setValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

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
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('TocTitleInput', () => {
  it('keeps a space typed mid-word instead of losing it on the next keystroke', () => {
    // Before the fix, this field was fully controlled off a value that had
    // already round-tripped through `writeStructure` -> `readStructure` ->
    // `resolvePart`'s trim, so a trailing space written on the "space"
    // keystroke came back trimmed, the controlled value reset, and the DOM
    // node forgot the reader had just typed a space at all. Typing "A Note"
    // one keystroke at a time produced "ANote".
    //
    // `storedValue` is deliberately held at '' throughout — exactly what the
    // old bug did on every keystroke, since the parent never re-derives
    // `storedValue` until blur now — to prove the local draft state, not a
    // permissive prop, is what keeps the space.
    act(() => {
      root.render(
        <TocTitleInput storedValue="" placeholder="Heading" onCommit={() => {}} />,
      )
    })
    const input = container.querySelector('input')
    if (!input) throw new Error('input not found')

    for (const next of ['A', 'A ', 'A N', 'A No', 'A Not', 'A Note']) {
      act(() => setValue(input, next))
      expect(input.value).toBe(next)
    }
    expect(input.value).toBe('A Note')
  })

  it('commits the space-preserving value on blur', () => {
    let committed: string | null = null
    act(() => {
      root.render(
        <TocTitleInput
          storedValue=""
          placeholder="Heading"
          onCommit={(v) => {
            committed = v
          }}
        />,
      )
    })
    const input = container.querySelector('input')
    if (!input) throw new Error('input not found')

    act(() => setValue(input, 'A Note'))
    expect(committed).toBeNull() // not yet — only on blur/Enter
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(committed).toBe('A Note')
  })

  it('commits on Enter without waiting for blur', () => {
    let committed: string | null = null
    act(() => {
      root.render(
        <TocTitleInput
          storedValue=""
          placeholder="Heading"
          onCommit={(v) => {
            committed = v
          }}
        />,
      )
    })
    const input = container.querySelector('input')
    if (!input) throw new Error('input not found')

    act(() => setValue(input, 'Short Title'))
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
    })
    expect(committed).toBe('Short Title')
  })

  it('does not commit when blurring without any change', () => {
    let commits = 0
    act(() => {
      root.render(
        <TocTitleInput
          storedValue="Existing"
          placeholder="Heading"
          onCommit={() => {
            commits += 1
          }}
        />,
      )
    })
    const input = container.querySelector('input')
    if (!input) throw new Error('input not found')
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(commits).toBe(0)
  })

  it('re-seeds the draft when storedValue changes for a reason other than this field', () => {
    act(() => {
      root.render(
        <TocTitleInput storedValue="Old" placeholder="Heading" onCommit={() => {}} />,
      )
    })
    let input = container.querySelector('input')
    if (!input) throw new Error('input not found')
    expect(input.value).toBe('Old')

    // Simulate the role changing elsewhere and the part's tocTitle reverting.
    act(() => {
      root.render(
        <TocTitleInput storedValue="New" placeholder="Heading" onCommit={() => {}} />,
      )
    })
    input = container.querySelector('input')
    if (!input) throw new Error('input not found')
    expect(input.value).toBe('New')
  })
})
