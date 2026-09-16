import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    root = createRoot(container)
  })
  // React logs the caught error itself; the boundary logs it too. Neither is
  // a failure, and both would otherwise bury the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

const Boom = (): never => {
  throw new Error('the worker wedged')
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    act(() => root.render(<ErrorBoundary>all fine</ErrorBoundary>))
    expect(container.textContent).toContain('all fine')
  })

  it('catches a throw instead of unmounting the application', () => {
    act(() =>
      root.render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      ),
    )
    expect(container.textContent).toContain('stopped working')
    expect(container.textContent).toContain('the worker wedged')
  })

  /**
   * The point of the fallback is a way OUT, not an apology. A boundary that
   * traps the reader on a dead screen with unsaved text is worse than the
   * crash it caught.
   */
  it('offers the work back, and a way out', () => {
    const onRecover = vi.fn()
    act(() =>
      root.render(
        <ErrorBoundary
          onRecover={onRecover}
          recoverLabel="Close the project"
          rescue={() => '# unsaved'}
        >
          <Boom />
        </ErrorBoundary>,
      ),
    )
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent)
    expect(buttons).toContain('Download your work')
    expect(buttons).toContain('Close the project')

    const recover = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Close the project',
    )
    act(() => recover?.click())
    expect(onRecover).toHaveBeenCalled()
  })

  it('offers no rescue button when there is nothing to rescue', () => {
    act(() =>
      root.render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      ),
    )
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent)
    expect(buttons).not.toContain('Download your work')
  })

  /**
   * galley sends nothing anywhere, and that promise does not get an exception
   * for crashes. The only report is to the reader's own console.
   */
  it('reports the failure to the console and nowhere else', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    act(() =>
      root.render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      ),
    )
    expect(console.error).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
