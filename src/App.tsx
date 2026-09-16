import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { convert, readFrontmatter } from '@/core/latex/document'
import { createZip } from '@/core/zip'
import { ActionBar } from '@/ui/ActionBar'
import { Diagnostics } from '@/ui/Diagnostics'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import { HelpDialog } from '@/ui/editor/HelpDialog'
import { MarkdownEditor } from '@/ui/editor/MarkdownEditor'
import { listImageNames, loadImages } from '@/ui/lib/imageStore'
import { useStore } from '@/ui/lib/store'
import { useCompile } from '@/ui/lib/useCompile'
import { ParticleBackground } from '@/ui/ParticleBackground'
import { PrivacyNotice } from '@/ui/PrivacyNotice'
import { MobileGate } from '@/ui/project/MobileGate'
import { OpenProject } from '@/ui/project/OpenProject'
import { type ProjectOutput, ProjectShell } from '@/ui/project/ProjectShell'
import { useProjectOpening } from '@/ui/project/useProjectOpening'
import { writePdf } from '@/ui/project/writeFigure'
import { ResultDialog } from '@/ui/ResultDialog'

/**
 * The shell: a fixed action bar and the document, filling the viewport exactly.
 *
 * Nothing here scrolls. Only the editor scrolls, inside itself. Everything that
 * is not the document — configuration, the generated LaTeX, the rendered PDF —
 * is reachable from the action bar and appears as a dialog, so the writing
 * surface is the only thing competing for attention.
 */
export default function App() {
  const source = useStore((s) => s.source)
  const config = useStore((s) => s.config)
  const fileName = useStore((s) => s.fileName)
  const theme = useStore((s) => s.theme)
  const setSource = useStore((s) => s.setSource)
  const setFileName = useStore((s) => s.setFileName)
  const applyFrontmatter = useStore((s) => s.applyFrontmatter)
  const setResultOpen = useStore((s) => s.setResultOpen)
  const mode = useStore((s) => s.mode)
  const closeProject = useStore((s) => s.closeProject)
  const opening = useProjectOpening()
  const session = useStore((s) => s.session)
  // The project's conversion, lifted so the ActionBar can render and download
  // it exactly as it does a single document's — including its FIGURES, which
  // live in the folder rather than in this browser's image store.
  const [projectOutput, setProjectOutput] = useState<ProjectOutput | null>(null)
  // Whether the "open a book" screen is showing. A screen rather than jumping
  // straight to the OS picker, because a remembered folder has to be OFFERED
  // — permission needs a gesture — and a browser that cannot do this at all
  // needs somewhere to say so.
  const [openingProject, setOpeningProject] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const inProject = mode === 'project'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  /**
   * Help, bound once at the root.
   *
   * Registered here rather than in an editor because a folder project mounts
   * TWO of them, and two registrations of a TOGGLE cancel each other — the
   * shortcut would read as broken rather than doubled. It also has to work in
   * both modes, and only the root spans both.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setHelpOpen((open) => !open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Frontmatter fills only the fields the reader has not set themselves, so
  // their own edits survive the next keystroke in the document.
  //
  // Gated on document mode. A project's metadata comes from `book.md` into
  // the SESSION's config; letting this run would write the single document's
  // title and author over the book's, and `config` is one persisted field.
  const lastFrontmatter = useRef('')
  useEffect(() => {
    if (inProject) return
    const found = readFrontmatter(source)
    const key = JSON.stringify(found)
    if (key === lastFrontmatter.current) return
    lastFrontmatter.current = key
    if (Object.keys(found).length > 0) applyFrontmatter(found)
  }, [source, applyFrontmatter, inProject])

  /**
   * The images this browser actually holds bytes for.
   *
   * The conversion needs it: a name the store cannot supply must come out as a
   * visible gap rather than an \includegraphics, because the engine stops the
   * whole document on a missing picture. Null while it is still being read,
   * which the converter reads as "assume present" — the same behaviour as
   * before, for the moment it takes to answer.
   */
  const [attached, setAttached] = useState<string[] | null>(null)
  const refreshAttached = useCallback(() => {
    void listImageNames().then(setAttached)
  }, [])
  useEffect(refreshAttached, [refreshAttached])

  const single = useMemo(
    () => convert(source, config, attached ? new Set(attached) : undefined),
    [source, config, attached],
  )
  // In project mode the conversion belongs to the shell — it needs the
  // project's own config and its figure resolver, neither of which exists
  // here — so the ActionBar reads whichever `.tex` the current mode produced.
  const tex = inProject ? (projectOutput?.tex ?? '') : single.tex
  const { diagnostics } = single
  const images = inProject ? (projectOutput?.images ?? []) : single.images
  // Whichever mode is active, this is how its figures are fetched.
  const loadFigures = useCallback(
    () =>
      inProject
        ? (projectOutput?.loadImages() ?? Promise.resolve([]))
        : loadImages(images),
    [inProject, projectOutput, images],
  )
  const compile = useCompile()

  const save = (blob: Blob, extension: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileName}.${extension}`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * The source, and the images it names.
   *
   * A `.tex` on its own stopped being a complete handover the moment galley
   * could place a figure — it would name files the recipient does not have. So
   * a document WITH figures is given as a zip, and one without stays a plain
   * `.tex`, because a zip containing a single file is a worse thing to receive.
   */
  const downloadTex = async () => {
    const attached = await loadFigures()
    if (attached.length === 0) {
      save(new Blob([tex], { type: 'application/x-tex' }), 'tex')
      return
    }
    const now = new Date()
    const archive = createZip(
      [{ name: `${fileName}.tex`, bytes: new TextEncoder().encode(tex) }, ...attached],
      {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hours: now.getHours(),
        minutes: now.getMinutes(),
        seconds: now.getSeconds(),
      },
    )
    save(new Blob([archive], { type: 'application/zip' }), 'zip')
  }

  const render = async () => {
    setResultOpen(true)
    // Only what this document actually draws. A reader who has attached twenty
    // figures over a week should not push all twenty through the engine to
    // render the one page that uses two.
    compile.compile(tex, await loadFigures())
  }

  return (
    <MobileGate>
      <ParticleBackground theme={theme} />

      <div className="relative z-10 flex h-screen flex-col overflow-hidden">
        <ActionBar
          tex={tex}
          hasImages={images.length > 0}
          busy={compile.state === 'running'}
          onRender={render}
          onDownloadTex={downloadTex}
          projectName={inProject ? (opening.remembered?.name ?? 'project') : null}
          canOpenProject={opening.supported}
          onOpenProject={() => setOpeningProject(true)}
          onCloseProject={async () => {
            // Anything still in the debounce is written BEFORE the shell
            // unmounts, because unmounting clears those timers and the edit
            // would go with them.
            await projectOutput?.flushEdits()
            closeProject()
            setOpeningProject(false)
          }}
          projectConfig={inProject ? projectOutput?.config : undefined}
          onProjectConfigChange={inProject ? projectOutput?.setConfig : undefined}
          onHelp={() => setHelpOpen(true)}
        />

        {inProject ? (
          // Scoped to the project surface: a throw here would otherwise
          // unmount the root with unsaved text in an editor.
          <ErrorBoundary
            onRecover={closeProject}
            recoverLabel="Close the project"
            rescue={() => projectOutput?.tex || null}
          >
            <ProjectShell onOutput={setProjectOutput} />
          </ErrorBoundary>
        ) : openingProject ? (
          <OpenProject
            supported={opening.supported}
            remembered={opening.remembered}
            busy={opening.busy}
            error={opening.error}
            onPick={() => void opening.pick()}
            onReopen={() => void opening.reopen()}
            onForget={() => void opening.forget()}
            onCancel={() => setOpeningProject(false)}
          />
        ) : (
          <main className="flex min-h-0 flex-1 flex-col px-4 py-4">
            <MarkdownEditor
              value={source}
              onChange={setSource}
              onFileName={(name) => setFileName(name.replace(/\.[^.]+$/, ''))}
              onImagesChanged={refreshAttached}
            />
          </main>
        )}

        {!inProject && diagnostics.length > 0 && (
          <div className="max-h-32 shrink-0 overflow-auto border-t px-4 py-2">
            <Diagnostics items={diagnostics} />
          </div>
        )}

        <PrivacyNotice />
      </div>

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      <ResultDialog
        compile={compile}
        onDownloadTex={downloadTex}
        onSaveToFolder={
          inProject && session
            ? async () => {
                const bytes = compile.pdfUrl
                  ? await (await fetch(compile.pdfUrl)).arrayBuffer()
                  : null
                return bytes ? writePdf(session.handle, 'book.pdf', bytes) : false
              }
            : undefined
        }
      />
    </MobileGate>
  )
}
