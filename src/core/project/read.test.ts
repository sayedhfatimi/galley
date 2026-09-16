import { describe, expect, it } from 'vitest'
import { readProject } from './read'

const part = (role: string) =>
  `---\ngalley:\n  role: ${role}\n---\n\n# Heading\n\nText.\n`

describe('readProject', () => {
  it('separates parts from notes by the galley: key', () => {
    const project = readProject(
      [
        { path: 'book.md', source: '---\ntitle: A Book\n---\n' },
        { path: '01-copyright.md', source: part('front') },
        { path: 'research.md', source: '# Research\n\nNotes.\n' },
        { path: 'ideas/endings.md', source: '# Endings\n' },
      ],
      [],
    )
    expect(project.parts.map((p) => p.path)).toEqual(['01-copyright.md'])
    expect(project.notes.map((n) => n.path)).toEqual(['ideas/endings.md', 'research.md'])
  })

  it('never treats book.md as a part or a note', () => {
    const project = readProject(
      [{ path: 'book.md', source: '---\ntitle: T\ngalley:\n  role: main\n---\n' }],
      [],
    )
    expect(project.parts).toEqual([])
    expect(project.notes).toEqual([])
  })

  it('orders parts by natural sort of path', () => {
    const project = readProject(
      [
        { path: '10-j.md', source: part('main') },
        { path: '2-b.md', source: part('main') },
        { path: '9-i.md', source: part('main') },
      ],
      [],
    )
    expect(project.parts.map((p) => p.path)).toEqual(['2-b.md', '9-i.md', '10-j.md'])
  })

  it('reads metadata from book.md, not from a chapter', () => {
    const project = readProject(
      [
        { path: 'book.md', source: '---\ntitle: The Book\nauthor: A. Writer\n---\n' },
        { path: '01-a.md', source: '---\ntitle: Not This\ngalley:\n  role: main\n---\n' },
      ],
      [],
    )
    expect(project.metadata).toMatchObject({ title: 'The Book', author: 'A. Writer' })
  })

  it('skips dotfolders entirely, including .obsidian', () => {
    const project = readProject(
      [
        { path: '.obsidian/workspace.md', source: part('main') },
        { path: '.trash/old.md', source: '# Old\n' },
        { path: '01-a.md', source: part('main') },
      ],
      ['.obsidian/theme.png', 'cover.png'],
    )
    expect(project.parts.map((p) => p.path)).toEqual(['01-a.md'])
    expect(project.notes).toEqual([])
    expect(project.figures).toEqual(['cover.png'])
  })

  it('diagnoses a malformed galley: block but keeps the file in the book', () => {
    const project = readProject(
      [{ path: '01-a.md', source: '---\ngalley: main\n---\n\n# A\n' }],
      [],
    )
    expect(project.parts.map((p) => p.path)).toEqual(['01-a.md'])
    expect(project.parts[0].spec).toEqual({ role: 'main', numbered: true, listed: true })
    expect(project.diagnostics).toContainEqual(
      expect.objectContaining({ kind: 'project-part-malformed', file: '01-a.md' }),
    )
  })

  it('diagnoses a galley: block in book.md, rather than ignoring it', () => {
    const project = readProject(
      [{ path: 'book.md', source: '---\ntitle: T\ngalley:\n  role: main\n---\n' }],
      [],
    )
    expect(project.parts).toEqual([])
    expect(project.diagnostics).toContainEqual(
      expect.objectContaining({ kind: 'project-book-not-a-part', file: 'book.md' }),
    )
  })

  it('keeps only image files as figures', () => {
    const project = readProject([], ['cover.png', 'notes.txt', 'a/b.jpg', 'c.svg'])
    expect(project.figures).toEqual(['a/b.jpg', 'cover.png'])
  })
})
