import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { convert, readFrontmatter } from '@/core/latex/document'
import { createZip } from '@/core/zip'
import { ActionBar } from '@/ui/ActionBar'
import { Diagnostics } from '@/ui/Diagnostics'
import { MarkdownEditor } from '@/ui/editor/MarkdownEditor'
import { listImageNames, loadImages } from '@/ui/lib/imageStore'
import { useStore } from '@/ui/lib/store'
import { useCompile } from '@/ui/lib/useCompile'
import { ParticleBackground } from '@/ui/ParticleBackground'
import { PrivacyNotice } from '@/ui/PrivacyNotice'
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Frontmatter fills only the fields the reader has not set themselves, so
  // their own edits survive the next keystroke in the document.
  const lastFrontmatter = useRef('')
  useEffect(() => {
    const found = readFrontmatter(source)
    const key = JSON.stringify(found)
    if (key === lastFrontmatter.current) return
    lastFrontmatter.current = key
    if (Object.keys(found).length > 0) applyFrontmatter(found)
  }, [source, applyFrontmatter])

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

  const { tex, diagnostics, images } = useMemo(
    () => convert(source, config, attached ? new Set(attached) : undefined),
    [source, config, attached],
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
    const attached = await loadImages(images)
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
    compile.compile(tex, await loadImages(images))
  }

  return (
    <>
      <ParticleBackground theme={theme} />

      <div className="relative z-10 flex h-screen flex-col overflow-hidden">
        <ActionBar
          tex={tex}
          hasImages={images.length > 0}
          busy={compile.state === 'running'}
          onRender={render}
          onDownloadTex={downloadTex}
        />

        <main className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <MarkdownEditor
            value={source}
            onChange={setSource}
            onFileName={(name) => setFileName(name.replace(/\.[^.]+$/, ''))}
            onImagesChanged={refreshAttached}
          />
        </main>

        {diagnostics.length > 0 && (
          <div className="max-h-32 shrink-0 overflow-auto border-t px-4 py-2">
            <Diagnostics items={diagnostics} />
          </div>
        )}

        <PrivacyNotice />
      </div>

      <ResultDialog compile={compile} onDownloadTex={downloadTex} />
    </>
  )
}
