import { useEffect, useMemo, useRef } from 'react'
import { convert, readFrontmatter } from '@/core/latex/document'
import { ActionBar } from '@/ui/ActionBar'
import { Diagnostics } from '@/ui/Diagnostics'
import { MarkdownEditor } from '@/ui/editor/MarkdownEditor'
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

  const { tex, diagnostics } = useMemo(() => convert(source, config), [source, config])
  const compile = useCompile()

  const downloadTex = () => {
    const url = URL.createObjectURL(new Blob([tex], { type: 'application/x-tex' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileName}.tex`
    a.click()
    URL.revokeObjectURL(url)
  }

  const render = () => {
    setResultOpen(true)
    compile.compile(tex)
  }

  return (
    <>
      <ParticleBackground theme={theme} />

      <div className="relative z-10 flex h-screen flex-col overflow-hidden">
        <ActionBar
          tex={tex}
          busy={compile.state === 'running'}
          onRender={render}
          onDownloadTex={downloadTex}
        />

        <main className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <MarkdownEditor
            value={source}
            onChange={setSource}
            onFileName={(name) => setFileName(name.replace(/\.[^.]+$/, ''))}
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
