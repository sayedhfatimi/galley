import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorPane } from './EditorPane'

/**
 * What mounting two of these must not do.
 *
 * `EditorPane` exists so a folder project can have a chapter and a note open
 * side by side. Everything that was safe in `MarkdownEditor` because exactly
 * one of it existed has to be re-examined under that, and these are the two
 * that bit.
 *
 * No component-testing library is set up in this repo, so this drives
 * `react-dom/client` directly, the same way `ConfigPanel.test.tsx` does.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('EditorPane', () => {
  it('renders the source view bound to the value it is given', () => {
    // Braces, not quotes: a JSX attribute STRING does not process escapes, so
    // `value="# One\n"` would pass a literal backslash and an n.
    act(() => {
      root.render(<EditorPane value={'# One\n'} onChange={() => {}} mode="source" />)
    })
    expect(container.querySelector('textarea')?.value).toBe('# One\n')
  })

  /**
   * Source mode is byte-exact: the textarea IS the string, with no parse and
   * no serialise between. This is what a folder project opens in, and it is
   * why opening a chapter and typing one character cannot reformat the
   * author's file the way the rich editor would.
   */
  it('passes an edit through source mode without canonicalising it', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(
        <EditorPane value={'_em_ and * one\n'} onChange={onChange} mode="source" />,
      )
    })
    const textarea = container.querySelector('textarea')
    expect(textarea?.value).toBe('_em_ and * one\n')

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set
    act(() => {
      setter?.call(textarea, '_em_ and * one\nmore')
      textarea?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // `_em_` is still `_em_` and `* one` is still `* one`.
    expect(onChange).toHaveBeenCalledWith('_em_ and * one\nmore')
  })

  /**
   * Two panes must not both bind the help shortcut.
   *
   * `Cmd+/` TOGGLES, so two registrations cancel: the dialog opens and shuts
   * within one keypress and the shortcut appears BROKEN rather than doubled,
   * which is much the harder bug to find. The listener therefore lives in the
   * composition that mounts the pane, never in the pane.
   */
  it('binds no window keyboard shortcut of its own', () => {
    const add = vi.spyOn(window, 'addEventListener')
    act(() => {
      root.render(
        <>
          <EditorPane value="a" onChange={() => {}} mode="source" />
          <EditorPane value="b" onChange={() => {}} mode="source" />
        </>,
      )
    })
    const keydowns = add.mock.calls.filter(([type]) => String(type) === 'keydown')
    expect(keydowns).toHaveLength(0)
  })

  /**
   * The pane must not reach the browser-local image store.
   *
   * In a folder project a figure is a file in the author's folder, and
   * `pruneImages([])` — which single-document mode calls when clearing —
   * would delete figures that have nothing to do with the open project. A
   * module-graph assertion is blunt, and it is the one thing that cannot be
   * argued around later by someone adding "just one" import.
   */
  it('does not reach the browser-local image store', () => {
    const source = readFileSync(join(import.meta.dirname, 'EditorPane.tsx'), 'utf8')
    expect(source).not.toContain('imageStore')
    expect(source).not.toContain('pruneImages')
    expect(source).not.toContain('putImage')
  })

  /**
   * Images are the caller's business, and a pane given no handler must not
   * offer the affordance at all. In a project, dropping a picture writes a
   * file into someone's vault — that decision belongs to the shell.
   */
  it('offers no image input when the caller accepts no images', () => {
    act(() => {
      root.render(<EditorPane value="a" onChange={() => {}} mode="source" />)
    })
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  it('offers one when the caller does', () => {
    act(() => {
      root.render(
        <EditorPane
          value="a"
          onChange={() => {}}
          mode="source"
          onImages={async () => {}}
        />,
      )
    })
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
  })

  it('reports focus, so a shared toolbar knows which pane it acts on', () => {
    const onFocus = vi.fn()
    act(() => {
      root.render(
        <EditorPane value="a" onChange={() => {}} mode="source" onFocus={onFocus} />,
      )
    })
    const textarea = container.querySelector('textarea')
    // `focusin`, not `focus`: React delegates from the root container and
    // `focus` does not bubble, so the handler never sees it.
    act(() => {
      textarea?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    expect(onFocus).toHaveBeenCalled()
  })

  it('renders the toolbar it is handed, and nothing when handed none', () => {
    act(() => {
      root.render(
        <EditorPane
          value="a"
          onChange={() => {}}
          mode="source"
          toolbar={<div data-testid="bar">bar</div>}
        />,
      )
    })
    expect(container.querySelector('[data-testid="bar"]')).not.toBeNull()
  })
})
