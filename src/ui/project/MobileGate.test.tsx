import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileGate } from './MobileGate'

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
  vi.unstubAllGlobals()
})

const withMatchMedia = (matches: (query: string) => boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('MobileGate', () => {
  it('renders the app when the pointer is fine', () => {
    withMatchMedia(() => false)
    act(() => root.render(<MobileGate>the app</MobileGate>))
    expect(container.textContent).toContain('the app')
  })

  it('names Obsidian as the phone surface instead', () => {
    withMatchMedia(() => true)
    act(() => root.render(<MobileGate>the app</MobileGate>))
    expect(container.textContent).not.toContain('the app')
    expect(container.textContent).toContain('Obsidian')
  })

  /**
   * A touchscreen laptop has a COARSE pointer and hover. Gating on `coarse`
   * alone would refuse a perfectly good desktop, which is why the query is
   * both halves and why this asserts the whole string rather than a substring.
   */
  it('lets a touchscreen laptop through', () => {
    withMatchMedia((query) => query === '(pointer: coarse)')
    act(() => root.render(<MobileGate>the app</MobileGate>))
    expect(container.textContent).toContain('the app')
  })

  /**
   * `matchMedia` is absent under jsdom and in any non-browser consumer. A
   * crash here takes the entire application, not one control — the same
   * reason `store.ts` guards `initialTheme`.
   */
  it('renders the app when matchMedia is missing entirely', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(() => {
      act(() => root.render(<MobileGate>the app</MobileGate>))
    }).not.toThrow()
    expect(container.textContent).toContain('the app')
  })

  it('renders the app when matchMedia throws', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('unsupported')
    })
    expect(() => {
      act(() => root.render(<MobileGate>the app</MobileGate>))
    }).not.toThrow()
    expect(container.textContent).toContain('the app')
  })
})
