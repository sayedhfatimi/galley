import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Project } from '@/core/project/types'
import { DEFAULT_PART, type PartRole, roleRank } from '@/core/structure'
import { Sidebar } from './Sidebar'

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

const part = (path: string, role: 'front' | 'main' | 'back') => ({
  path,
  source: '',
  spec: { ...DEFAULT_PART, role, numbered: role === 'main' },
})

const project = (over: Partial<Project> = {}): Project => ({
  parts: [],
  notes: [],
  figures: [],
  metadata: {},
  config: {},
  diagnostics: [],
  ...over,
})

const render = (p: Project, extra: Partial<Parameters<typeof Sidebar>[0]> = {}) => {
  act(() =>
    root.render(
      // `main.tsx` wraps the whole app in one; Radix throws without it.
      <TooltipProvider>
        <Sidebar
          project={p}
          files={new Map()}
          diagnostics={[]}
          active={{ left: null, right: null }}
          onOpen={() => {}}
          onOpenBeside={() => {}}
          onChangeMembership={() => {}}
          {...extra}
        />
      </TooltipProvider>,
    ),
  )
}

describe('Sidebar', () => {
  /**
   * A chapter per folder with its figures beside it is a layout the spec
   * explicitly supports, and every chapter in such a book is `index.md` — so
   * the list read "index, index, index". Found by opening a real project and
   * looking at it, which no unit test had asked about.
   */
  it('names a chapter after its folder when the file is index.md', () => {
    render(project({ parts: [part('02-illusion/index.md', 'main')] }))
    expect(container.textContent).toContain('02-illusion')
    expect(container.textContent).not.toMatch(/\bindex\b/)
  })

  it('names every other chapter after its file', () => {
    render(project({ parts: [part('03-second.md', 'main')] }))
    expect(container.textContent).toContain('03-second')
  })

  it('groups by role, front matter before chapters before back matter', () => {
    render(
      project({
        parts: [
          part('99-about.md', 'back'),
          part('01-intro.md', 'main'),
          part('00-copyright.md', 'front'),
        ],
      }),
    )
    const text = container.textContent ?? ''
    expect(text.indexOf('Front matter')).toBeLessThan(text.indexOf('Chapters'))
    expect(text.indexOf('Chapters')).toBeLessThan(text.indexOf('Back matter'))
    expect(text.indexOf('00-copyright')).toBeLessThan(text.indexOf('01-intro'))
    expect(text.indexOf('01-intro')).toBeLessThan(text.indexOf('99-about'))
  })

  /**
   * The sidebar must agree with the typeset output about what order the
   * divisions come in, and `roleRank` is what decides that. Asserted against
   * the core rather than against three literals, so reordering the sidebar's
   * own list fails here instead of silently disagreeing with the PDF.
   */
  it('lists the divisions in the order roleRank gives them', () => {
    const roles: PartRole[] = ['front', 'main', 'back']
    render(project({ parts: roles.map((r) => part(`${r}.md`, r)) }))
    const text = container.textContent ?? ''
    const positions = [...roles]
      .sort((a, b) => roleRank(a) - roleRank(b))
      .map((r) => text.indexOf(`${r}.md`.replace('.md', '')))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('lists a note under Notes rather than hiding it', () => {
    render(project({ notes: [{ path: 'research.md', source: '' }] }))
    expect(container.textContent).toContain('Notes')
    expect(container.textContent).toContain('research')
  })

  it('marks only the file a diagnostic names', () => {
    render(project({ parts: [part('a.md', 'main'), part('b.md', 'main')] }), {
      diagnostics: [{ kind: 'raw-html', message: 'x', file: 'a.md' }],
    })
    const marks = container.querySelectorAll('svg.lucide-triangle-alert')
    expect(marks.length).toBe(1)
  })

  it('opens beside without opening in place', () => {
    const onOpen = vi.fn()
    const onOpenBeside = vi.fn()
    render(project({ notes: [{ path: 'research.md', source: '' }] }), {
      onOpen,
      onOpenBeside,
    })
    const beside = [...container.querySelectorAll('button')].find((b) =>
      b.getAttribute('aria-label')?.startsWith('Open research beside'),
    )
    act(() => beside?.click())
    expect(onOpenBeside).toHaveBeenCalledWith('research.md')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('says so plainly when the folder holds nothing', () => {
    render(project())
    expect(container.textContent).toContain('no Markdown files')
  })
})
