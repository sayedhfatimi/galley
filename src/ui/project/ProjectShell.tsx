import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import type { GalleyConfig } from '@/core/config'
import { convertProject } from '@/core/latex/document'
import { writeMetadata } from '@/core/markdown/frontmatter'
import { writeBookConfig } from '@/core/project/config'
import { buildFigureResolver } from '@/core/project/figures'
import { BOOK_FILE } from '@/core/project/read'
import { Diagnostics } from '@/ui/Diagnostics'
import { type EditorMode, EditorPane } from '@/ui/editor/EditorPane'
import { type PaneSide, useStore } from '@/ui/lib/store'
import { ConflictBar } from './ConflictBar'
import { buildFigureIndex, loadProjectFigures } from './figures'
import { applyMembership, type Membership } from './membership'
import { SharedToolbar } from './SharedToolbar'
import { Sidebar } from './Sidebar'
import { useAutosave } from './useAutosave'

/**
 * The project surface: the book on the left, two editors beside it.
 *
 * Three tiers of scope, each bounded by what it acts on — the ActionBar spans
 * everything and carries project and application actions, the toolbar spans
 * the two editors and carries formatting, the sidebar spans neither and
 * carries the project.
 *
 * Both panes open in SOURCE mode. That is the whole safety story for someone
 * else's vault: the textarea is the string, so no parse and no serialise
 * happen and the bytes on disk stay exactly as the author typed them. Rich
 * mode is one click away and says what it will reformat before the first
 * edit.
 */

/** What the ActionBar needs to render, download or configure this project. */
export interface ProjectOutput {
  tex: string
  /** Engine names of the figures this book draws. */
  images: string[]
  /** Reads those figures' bytes from the folder, on demand. */
  loadImages: () => Promise<{ name: string; bytes: Uint8Array }[]>
  /** The book's settings, from `book.md`. */
  config: GalleyConfig
  /**
   * Changes them, and writes them back into `book.md`.
   *
   * Lifted rather than left in the dialog because the WRITE has to go through
   * the same staleness-guarded autosave as any other file — `book.md` is a
   * file in the author's folder like the rest, and a config change is an edit
   * to it.
   */
  setConfig: (config: GalleyConfig) => void
}

export interface ProjectShellProps {
  /**
   * Lifted because Render PDF and the `.tex` download live in the ActionBar,
   * which spans the whole application and knows nothing about a project's
   * config or its figure resolver. Passing the FIGURE LOADER up rather than
   * only the `.tex` is the point: a project's figures come from the folder,
   * and `App`'s own loader reads the single-document image store, so a
   * project render found no pictures at all and the engine stopped on the
   * first one.
   */
  onOutput: (output: ProjectOutput) => void
}

export function ProjectShell({ onOutput }: ProjectShellProps) {
  const session = useStore((s) => s.session)
  const setPane = useStore((s) => s.setPane)
  const setLastFocused = useStore((s) => s.setLastFocused)
  const setFileState = useStore((s) => s.setFileState)
  const setProject = useStore((s) => s.setProject)
  const setProjectConfig = useStore((s) => s.setProjectConfig)

  const [mode, setMode] = useState<EditorMode>('source')
  const [richWarned, setRichWarned] = useState(false)
  const [editors, setEditors] = useState<Record<PaneSide, Editor | null>>({
    left: null,
    right: null,
  })

  const handles = session?.handles ?? new Map()
  const files = session?.files ?? new Map()

  const autosave = useAutosave({ handles, files, setFileState })

  // Every file's current text, by path — the panes read from here so an edit
  // in one is visible to the conversion immediately rather than at the next
  // write.
  const sources = useMemo(() => {
    const out = new Map<string, string>()
    for (const part of session?.project.parts ?? []) out.set(part.path, part.source)
    for (const note of session?.project.notes ?? []) out.set(note.path, note.source)
    return out
  }, [session?.project])

  const figures = useMemo(
    () => buildFigureIndex(session?.project.figures ?? []),
    [session?.project.figures],
  )

  const conversion = useMemo(() => {
    if (!session) return null
    const resolver = buildFigureResolver(session.project.figures)
    return convertProject(
      session.project.parts,
      session.config,
      figures.available,
      resolver,
    )
  }, [session, figures])

  // Re-checked when the tab regains focus and whenever a pane switches file: a
  // change can arrive from a phone over Sync with nothing local to announce it.
  const openPaths = useMemo(
    () => [session?.panes.left, session?.panes.right].filter((p): p is string => !!p),
    [session?.panes.left, session?.panes.right],
  )

  useEffect(() => {
    const onFocus = () => void autosave.recheck(openPaths)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [autosave, openPaths])

  useEffect(() => {
    void autosave.recheck(openPaths)
  }, [autosave, openPaths])

  const edit = useCallback(
    (path: string, text: string) => {
      if (!session) return
      // The in-memory project is updated first so the conversion and the
      // sidebar reflect the edit immediately; the write is debounced behind it.
      setProject({
        ...session.project,
        parts: session.project.parts.map((p) =>
          p.path === path ? { ...p, source: text } : p,
        ),
        notes: session.project.notes.map((n) =>
          n.path === path ? { ...n, source: text } : n,
        ),
      })
      autosave.save(path, text)
    },
    [session, setProject, autosave],
  )

  const changeMembership = useCallback(
    (path: string, membership: Membership) => {
      const source = sources.get(path)
      if (source === undefined) return
      const next = applyMembership(source, membership)
      // Unchanged means `writeFrontmatterKey` could not write — frontmatter it
      // cannot parse. Saying nothing would look like the control is broken.
      if (next === source) {
        setFileState(path, { dirty: false })
        return
      }
      edit(path, next)
    },
    [sources, edit, setFileState],
  )

  /**
   * A settings change is an edit to `book.md`.
   *
   * Both halves are written: `writeBookConfig` for the `book:` block and
   * `writeMetadata` for the title, subtitle, author and date, which live as
   * ordinary top-level keys and had no writer at all until now. The file may
   * not exist yet — a folder is a project without one — so it is created
   * rather than refused.
   */
  const changeConfig = useCallback(
    (next: GalleyConfig) => {
      setProjectConfig(next)
      const current = sources.get(BOOK_FILE) ?? ''
      const written = writeMetadata(writeBookConfig(current, next), next.metadata)
      if (written === current) return
      if (!sources.has(BOOK_FILE)) {
        // No `book.md` yet: hold it in memory so the conversion sees it, and
        // let the reader create the file by choosing where it goes. Writing a
        // file into someone's folder uninvited is not this control's business.
        return
      }
      edit(BOOK_FILE, written)
    },
    [setProjectConfig, sources, edit],
  )

  useEffect(() => {
    if (!conversion || !session) return
    onOutput({
      tex: conversion.tex,
      images: conversion.images,
      loadImages: () => loadProjectFigures(conversion.images, figures, handles),
      config: session.config,
      setConfig: changeConfig,
    })
  }, [conversion, figures, handles, onOutput, session, changeConfig])

  const toggleMode = useCallback(() => {
    setMode((m) => {
      if (m === 'source' && !richWarned) setRichWarned(true)
      return m === 'source' ? 'rich' : 'source'
    })
  }, [richWarned])

  if (!session) return null

  const pane = (side: PaneSide) => {
    const path = session.panes[side]
    if (!path) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          <p className="max-w-xs text-muted-foreground text-xs leading-relaxed">
            Open a note or a chapter beside your draft — research on one side, the book on
            the other.
          </p>
        </div>
      )
    }
    const state = files.get(path)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {state?.conflict && (
          <ConflictBar
            path={path}
            onTakeTheirs={async () => {
              const handle = handles.get(path)
              if (!handle) return
              const file = await handle.getFile()
              const text = await file.text()
              edit(path, text)
              autosave.resolveWithTheirs(path, file.lastModified)
            }}
          />
        )}
        {/*
          Keyed on the path. `EditorPane` compares an incoming body against the
          last one it synchronised with, and reusing one instance across a file
          switch makes that comparison cross-file — switching back to a file it
          has already seen would show the WRONG text.
        */}
        <EditorPane
          key={path}
          value={sources.get(path) ?? ''}
          onChange={(text) => edit(path, text)}
          mode={mode}
          onFocus={() => setLastFocused(side)}
          onEditor={(editor) =>
            setEditors((e) => (e[side] === editor ? e : { ...e, [side]: editor }))
          }
          ariaLabel={`${path} (Markdown source)`}
        />
      </div>
    )
  }

  const activePath = session.panes[session.lastFocused] ?? session.panes.left

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel id="sidebar" defaultSize={20} minSize={12} collapsible>
          <Sidebar
            project={session.project}
            files={files}
            diagnostics={conversion?.diagnostics ?? []}
            active={session.panes}
            onOpen={(path) => setPane('left', path)}
            onOpenBeside={(path) => setPane('right', path)}
            onChangeMembership={changeMembership}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel id="editors" defaultSize={80}>
          <SharedToolbar
            editor={editors[session.lastFocused]}
            active={session.lastFocused}
            mode={mode}
            activeName={activePath}
            onToggleMode={toggleMode}
            hasRight={session.panes.right !== null}
          />
          {mode === 'rich' && richWarned && (
            <p className="shrink-0 border-b bg-muted/40 px-3 py-1.5 text-muted-foreground text-xs leading-relaxed">
              The rich editor rewrites formatting it does not need — <code>_em_</code>{' '}
              becomes <code>*em*</code>, <code>* bullets</code> become{' '}
              <code>- bullets</code>, and underlined headings become <code>#</code>. Your
              words are untouched. Source mode changes nothing at all.
            </p>
          )}
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            <ResizablePanel id="left" defaultSize={session.panes.right ? 50 : 100}>
              {pane('left')}
            </ResizablePanel>
            {session.panes.right && (
              <>
                <ResizableHandle />
                <ResizablePanel id="right" defaultSize={50}>
                  {pane('right')}
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      {conversion && conversion.diagnostics.length > 0 && (
        <div className="max-h-32 shrink-0 overflow-auto border-t px-4 py-2">
          <Diagnostics items={conversion.diagnostics} />
        </div>
      )}
    </div>
  )
}
