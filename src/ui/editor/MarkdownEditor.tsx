import { EditorContent, useEditor } from '@tiptap/react'
import { CircleHelp, FileUp, PenLine, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { parseMarkdown } from '@/core/markdown/parse'
import { mdastToPm } from '@/core/markdown/pm/mdast-to-pm'
import { serializeToMarkdown } from '@/core/markdown/pm/serialize'
import { cn } from '@/lib/utils'
import { attachImage, imageFilesFrom } from './attachImage'
import { EditorStatusBar } from './EditorStatusBar'
import { EditorToc } from './EditorToc'
import { createExtensions } from './extensions'
import { HelpDialog } from './HelpDialog'
import { LinkDialog } from './LinkDialog'
import { Toolbar } from './Toolbar'
import { ToolbarButton } from './ToolbarButton'

/**
 * The writing surface.
 *
 * Rich editing by default, with a raw-Markdown view one click away. The toggle
 * is not a nicety: Markdown is what galley actually converts, so a writer must
 * be able to see it — and if the ProseMirror round trip ever mangles a
 * construct, the source view is where that becomes visible rather than
 * surfacing for the first time in the PDF.
 *
 * Markdown remains the single source of truth. Edits serialise back to it,
 * debounced, so a keystroke does not run the whole conversion pipeline.
 *
 * There is deliberately no chrome row above the toolbar. Document actions live
 * in the toolbar itself: a second bar holding four buttons cost a strip of
 * vertical space and made the editor read as a panel inside a page rather than
 * as the surface itself.
 */
const SERIALIZE_DEBOUNCE_MS = 300

/** Generous enough for a book-length manuscript in plain text, which is smaller
 *  than most people assume, while bounding the cost of any one render. */
export const MAX_INPUT_BYTES = 2 * 1024 * 1024

const ACCEPT = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain'

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
  const [mode, setMode] = useState<'rich' | 'source'>('rich')
  const [tocOpen, setTocOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [link, setLink] = useState({ open: false, href: '' })
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Guards the feedback loop: the editor writes markdown up to the store, the
  // store hands it back down. Without this the document would be reparsed and
  // the cursor thrown to the start on every keystroke.
  const emitting = useRef(false)
  const timer = useRef<number | null>(null)

  // Built once: changing the extension list would rebuild the whole editor and
  // discard the document with it.
  const extensions = useMemo(
    () =>
      createExtensions({
        onRequestLink: (href) => setLink({ open: true, href }),
      }),
    [],
  )

  // addImages needs the editor, and the editor's paste handler needs
  // addImages. A ref breaks the cycle without rebuilding the editor, which
  // would discard the document.
  const pasteImages = useRef<((files: File[]) => Promise<void>) | null>(null)

  const editor = useEditor({
    extensions,
    content: mdastToPm(parseMarkdown(value)),
    editorProps: {
      attributes: {
        class:
          'prose-editor mx-auto h-full max-w-3xl px-6 py-8 text-sm focus:outline-none',
      },
      // A pasted screenshot arrives as a file on the clipboard with no name of
      // its own. Handled here rather than left to ProseMirror, which would drop
      // it silently — the same silence the image node was written to avoid.
      handlePaste: (_view, event) => {
        const files = imageFilesFrom(event.clipboardData?.items ?? null)
        if (files.length === 0) return false
        event.preventDefault()
        void pasteImages.current?.(files)
        return true
      },
    },
    onUpdate: ({ editor }) => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        emitting.current = true
        onChange(serializeToMarkdown(editor.getJSON() as never))
        window.setTimeout(() => {
          emitting.current = false
        }, 0)
      }, SERIALIZE_DEBOUNCE_MS)
    },
  })

  // Re-hydrate only when the document changed underneath us — an upload, a
  // restored session, or a paste into the source view — never on our own edits.
  useEffect(() => {
    if (!editor || emitting.current) return
    const current = serializeToMarkdown(editor.getJSON() as never)
    if (current.trim() === value.trim()) return
    editor.commands.setContent(mdastToPm(parseMarkdown(value)) as never, {
      emitUpdate: false,
    })
  }, [editor, value])

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  // The help dialog advertises this shortcut, so it has to exist. Bound on the
  // window rather than through the editor keymap because help should open
  // whether or not the caret is in the document.
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

  // Typing, uploading and dropping all converge here and produce identical
  // results for identical content.
  const readFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_INPUT_BYTES) {
        setFileError(
          `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_INPUT_BYTES / 1024 / 1024} MB — long enough for a full manuscript.`,
        )
        return
      }
      setFileError(null)
      onChange(await file.text())
      onFileName?.(file.name)
    },
    [onChange, onFileName],
  )

  /**
   * Attached images, kept in this browser and inserted as figures. Sequential
   * rather than parallel so the first failure — a full quota, say — stops
   * before filling storage with the rest.
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

  pasteImages.current = addImages

  const openFile = useCallback(() => fileInput.current?.click(), [])

  // Confirmed rather than immediate. The document is the only thing the reader
  // has here, it is restored from the last session, and there is no undo across
  // a reload — so a mis-click would be unrecoverable.
  const clearDocument = useCallback(() => {
    setClearOpen(false)
    setFileError(null)
    onChange('')
    onFileName?.('')
    editor?.commands.clearContent(true)
  }, [editor, onChange, onFileName])

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

      <LinkDialog
        editor={editor}
        open={link.open}
        initialHref={link.href}
        onOpenChange={(open) => setLink((l) => ({ ...l, open }))}
      />

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

      {/** biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is an
       * enhancement over the Open button, which is fully keyboard accessible. */}
      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border transition-colors',
          dragging && 'border-primary border-dashed bg-primary/5',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          // An image joins the document; anything else is opened AS the
          // document. Dropping a photo used to replace the manuscript with its
          // bytes, which is never what the gesture means.
          const images = imageFilesFrom(e.dataTransfer.files)
          if (images.length > 0 && editor) {
            void addImages(images)
            return
          }
          const file = e.dataTransfer.files[0]
          if (file) void readFile(file)
        }}
      >
        {mode === 'rich' ? (
          <>
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
            <div className="min-h-0 flex-1 overflow-auto">
              <EditorContent editor={editor} className="h-full" />
            </div>
            {/* Positions itself; it must not be wrapped in another positioned
                element or the two fight over placement. */}
            {editor && (
              <EditorToc
                editor={editor}
                open={tocOpen}
                onClose={() => setTocOpen(false)}
              />
            )}
            <EditorStatusBar editor={editor} />
          </>
        ) : (
          <>
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
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-sm leading-relaxed"
              aria-label="Markdown source"
            />
          </>
        )}
      </div>

      {fileError && <p className="shrink-0 text-destructive text-xs">{fileError}</p>}
    </div>
  )
}
