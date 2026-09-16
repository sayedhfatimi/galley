import type { Editor } from '@tiptap/core'
import { CircleHelp, FileUp, PenLine, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { pruneImages } from '@/ui/lib/imageStore'
import { attachImage } from './attachImage'
import { type EditorMode, EditorPane } from './EditorPane'
import { HelpDialog } from './HelpDialog'
import { Toolbar } from './Toolbar'
import { ToolbarButton } from './ToolbarButton'

/**
 * The single-document writing surface.
 *
 * One `EditorPane` plus the chrome that only makes sense for a document
 * galley owns: opening a file as THE document, clearing it, help, and the
 * browser-local image store. A folder project mounts the same pane twice and
 * brings entirely different chrome, which is why none of this lives in the
 * pane itself — in a project, "clear the document" has no meaning and
 * `pruneImages` would delete figures that belong to the author's folder.
 *
 * Rich editing by default here, because this document IS galley's: nothing is
 * written back over a file anyone else owns, so the serialiser's canonical
 * spelling costs nobody anything. A project opens in source mode for exactly
 * the opposite reason.
 */

/** Generous enough for a book-length manuscript in plain text, while bounding
 *  the cost of any one render. */
const MAX_INPUT_BYTES = 2 * 1024 * 1024

const ACCEPT = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain'

/**
 * Whether a file can sensibly be read as the document.
 *
 * Deliberately permissive about a MISSING type — plenty of sources supply none
 * for a plain `.md` — and strict about a type that is present and is not text.
 */
export function looksLikeText(file: File): boolean {
  if (file.type.startsWith('text/')) return true
  if (file.type !== '' && file.type !== 'application/octet-stream') return false
  return /\.(md|markdown|mdown|mkd|txt)$/i.test(file.name) || file.name === ''
}

export interface MarkdownEditorProps {
  value: string
  onChange: (markdown: string) => void
  onFileName?: (name: string) => void
  /** Fired when a figure is attached, so the caller can re-read the store. */
  onImagesChanged?: () => void
}

export function MarkdownEditor({
  value,
  onChange,
  onFileName,
  onImagesChanged,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<EditorMode>('rich')
  const [tocOpen, setTocOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Bound on the window rather than through the editor keymap, because help
  // should open whether or not the caret is in the document. It lives HERE and
  // not in `EditorPane`: a folder project mounts two panes, and two
  // registrations of a TOGGLE cancel each other out — the shortcut would look
  // broken rather than doubled, which is the harder bug to find.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setHelpOpen((open) => !open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'rich' ? 'source' : 'rich'))
  }, [])

  const openFile = useCallback(() => fileInput.current?.click(), [])

  const readFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_INPUT_BYTES) {
        setFileError(
          `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_INPUT_BYTES / 1024 / 1024} MB — long enough for a full manuscript.`,
        )
        return
      }
      if (!looksLikeText(file)) {
        setFileError(`${file.name} does not look like Markdown or plain text.`)
        return
      }
      setFileError(null)
      onChange(await file.text())
      onFileName?.(file.name)
    },
    [onChange, onFileName],
  )

  /**
   * Attached images, kept in this browser. Sequential rather than parallel so
   * the first failure — a full quota, say — stops before filling storage with
   * the rest.
   */
  const addImages = useCallback(
    async (files: File[]) => {
      if (!editor) return
      for (const file of files) {
        const result = await attachImage(editor, file)
        if (!result.ok) {
          setFileError(result.reason)
          return
        }
      }
      setFileError(null)
      onImagesChanged?.()
    },
    [editor, onImagesChanged],
  )

  // Confirmed rather than immediate. The document is the only thing the reader
  // has here, it is restored from the last session, and there is no undo across
  // a reload — so a mis-click would be unrecoverable.
  const clearDocument = useCallback(() => {
    setClearOpen(false)
    setFileError(null)
    onChange('')
    onFileName?.('')
    editor?.commands.clearContent(true)
    // Clearing the document orphans its figures: nothing references them any
    // more, and nothing ever will.
    void pruneImages([]).then(() => onImagesChanged?.())
  }, [editor, onChange, onFileName, onImagesChanged])

  const chrome =
    mode === 'rich' ? (
      <Toolbar
        editor={editor}
        onOpen={openFile}
        onToggleToc={() => setTocOpen((v) => !v)}
        tocOpen={tocOpen}
        onHelp={() => setHelpOpen(true)}
        onToggleMode={toggleMode}
        onClear={() => setClearOpen(true)}
        mode={mode}
      />
    ) : (
      <div className="flex shrink-0 items-center justify-end gap-0.5 border-b px-2 py-1">
        <ToolbarButton
          icon={<FileUp className="size-4" />}
          label="Open a Markdown file"
          onClick={openFile}
        />
        <ToolbarButton
          icon={<CircleHelp className="size-4" />}
          label="Help and about"
          onClick={() => setHelpOpen(true)}
        />
        <ToolbarButton
          icon={<PenLine className="size-4" />}
          label="Edit as rich text"
          onClick={toggleMode}
        />
        <ToolbarButton
          icon={<Trash2 className="size-4" />}
          label="Clear the document"
          onClick={() => setClearOpen(true)}
        />
      </div>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void readFile(file)
          e.target.value = ''
        }}
      />

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the document?</DialogTitle>
            <DialogDescription>
              This removes everything in the editor. galley keeps no copy, so it cannot be
              undone — download the source first if you want to keep it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={clearDocument}>
              Clear it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditorPane
        value={value}
        onChange={onChange}
        mode={mode}
        toolbar={chrome}
        onEditor={setEditor}
        onImages={addImages}
        onFileDropped={(file) => void readFile(file)}
        tocOpen={tocOpen}
        onTocOpenChange={setTocOpen}
      />

      {fileError && <p className="shrink-0 text-destructive text-xs">{fileError}</p>}
    </div>
  )
}
