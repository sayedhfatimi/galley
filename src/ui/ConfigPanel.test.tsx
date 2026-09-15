import { act, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StructureSection, TocTitleInput } from './ConfigPanel'

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

  it('trims trailing whitespace on commit, so the field cannot fall permanently out of step', () => {
    // Untrimmed, `writeStructure` would quote the trailing space into the
    // frontmatter and `resolvePart` would trim it straight back out on read,
    // so `storedValue` would never change to match and the field would keep
    // showing whitespace the manuscript does not actually carry (Minor 3).
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

    act(() => setValue(input, 'A Note '))
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(committed).toBe('A Note')
  })

  it('commits on unmount, since dismissing the Configure dialog with Escape never fires blur', () => {
    // Radix's DismissableLayer flips `open` on Escape and FocusScope restores
    // focus from a setTimeout scheduled during effect cleanup — by which
    // point the input is already detached, so no `focusout` reaches React's
    // root and the onBlur/onKeyDown handlers above never run (Important 1).
    // A blur event cannot exercise this path at all, so this test drives a
    // REAL unmount — via a private root+container, so the shared one from
    // beforeEach/afterEach is untouched — and checks the commit fires from
    // that unmount alone, with no blur or Enter involved anywhere in the test.
    const localContainer = document.createElement('div')
    document.body.appendChild(localContainer)
    let localRoot: Root
    act(() => {
      localRoot = createRoot(localContainer)
    })

    let committed: string | null = null
    act(() => {
      localRoot.render(
        <TocTitleInput
          storedValue=""
          placeholder="Heading"
          onCommit={(v) => {
            committed = v
          }}
        />,
      )
    })
    const input = localContainer.querySelector('input')
    if (!input) throw new Error('input not found')

    act(() => setValue(input, 'Long Chapter'))
    expect(committed).toBeNull() // no blur, no Enter — nothing has committed yet

    act(() => {
      localRoot.unmount()
    })
    expect(committed).toBe('Long Chapter')

    localContainer.remove()
  })

  it('does not fire a spurious commit from a StrictMode development double-mount', () => {
    // StrictMode intentionally mounts, unmounts, then re-mounts a component
    // once in development, to surface effects that are not safe to run
    // twice. The unmount-commit effect above has to survive exactly that
    // cycle without writing anything: on the synthetic first unmount, draft
    // still equals storedValue, so the `draft !== storedValue` guard must
    // keep it a no-op.
    const localContainer = document.createElement('div')
    document.body.appendChild(localContainer)
    let localRoot: Root
    act(() => {
      localRoot = createRoot(localContainer)
    })

    let commits = 0
    act(() => {
      localRoot.render(
        <StrictMode>
          <TocTitleInput
            storedValue="Existing"
            placeholder="Heading"
            onCommit={() => {
              commits += 1
            }}
          />
        </StrictMode>,
      )
    })
    expect(commits).toBe(0)

    act(() => {
      localRoot.unmount()
    })
    expect(commits).toBe(0)

    localContainer.remove()
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

describe('StructureSection', () => {
  it('explains itself instead of rendering controls when frontmatter cannot be parsed', () => {
    // Important 2: tab-indented YAML is routine in a hand-edited file and is
    // exactly what `frontmatterData` returns null for while `hasFrontmatter`
    // still says yes — the set of documents `writeStructure` refuses. Before
    // this fix, `readStructure` silently fell back to an empty map and every
    // heading rendered as though untouched, with nothing telling the writer
    // that a role change they had just made was not, in fact, saved.
    const source =
      '---\ntitle: My Book\nauthor:\n\t- Ada Lovelace\n---\n\n# Copyright\n\n# Chapter One\n'
    act(() => {
      root.render(<StructureSection source={source} onSourceChange={() => {}} />)
    })
    expect(container.textContent).toContain('cannot read this document')
    // No role Select, no toggles, no contents-entry Input — controls that
    // would silently do nothing are replaced, not merely joined by a message.
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  it('writes a multi-word contents entry through the real source round trip', () => {
    // Minor 4: `ConfigPanel.test.tsx`'s other tests drive `TocTitleInput`
    // directly with `storedValue` held at a fixture constant, which cannot
    // exercise the PARENT binding — `writeStructure` -> `readStructure` ->
    // `resolvePart`'s trim on every re-derivation of that prop. This wires
    // `StructureSection` to real `source` state, the way `ConfigPanel`
    // actually does, so a regression that went back to writing on every
    // keystroke would show up here even though the five tests above still
    // pass unchanged.
    let latestSource = '# Chapter One\n'

    function Harness() {
      const [source, setSource] = useState(latestSource)
      return (
        <StructureSection
          source={source}
          onSourceChange={(next) => {
            latestSource = next
            setSource(next)
          }}
        />
      )
    }

    act(() => {
      root.render(<Harness />)
    })
    const input = container.querySelector('input')
    if (!input) throw new Error('input not found')

    for (const next of ['A', 'A ', 'A N', 'A No', 'A Not', 'A Note']) {
      act(() => setValue(input, next))
    }
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))

    expect(latestSource).toContain('toc_title: A Note')
  })
})
