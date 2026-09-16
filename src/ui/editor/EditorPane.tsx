import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { parseMarkdown } from '@/core/markdown/parse'
import { mdastToPm } from '@/core/markdown/pm/mdast-to-pm'
import { serializeToMarkdown } from '@/core/markdown/pm/serialize'
import { bodyTree, joinFrontmatter, splitFromTree } from '@/core/markdown/split'
import { cn } from '@/lib/utils'
import { imageFilesFrom } from './attachImage'
import { EditorStatusBar } from './EditorStatusBar'
import { EditorToc } from './EditorToc'
import { createExtensions } from './extensions'
import { LinkDialog } from './LinkDialog'

/**
 * One editing surface over one Markdown string.
 *
 * Extracted from `MarkdownEditor` so a folder project can mount TWO of them.
 * It owns the editing loop — parse, hydrate, edit, serialise, re-hydrate —
 * and nothing else. Everything document- or application-scoped (opening a
 * file, clearing it, help, the images store) belongs to whoever mounts it,
 * because in a project those either mean something different or mean nothing
 * at all.
 *
 * ## Two rules that came from mounting it twice
 *
 * **Key it on the file path.** `syncedBody` below compares the incoming body
 * against the last one this pane synchronised with. Reusing one instance
 * across a file switch makes that comparison cross-file: switching to a file
 * whose body happens to differ works, and switching back to one it has seen
 * shows the WRONG text. Remount instead — `<EditorPane key={path} …>`.
 *
 * **`mode` is the caller's, not the pane's.** A folder project opens in
 * source mode, where no ProseMirror round trip happens and the bytes on disk
 * are exactly what the author typed. The shell has to know which mode a pane
 * is in to warn before the first rich-mode edit, so keeping a private copy
 * here would be the same fact in two places.
 */

const SERIALIZE_DEBOUNCE_MS = 300

export type EditorMode = 'rich' | 'source'

export interface EditorPaneProps {
  value: string
  onChange: (markdown: string) => void
  mode: EditorMode
  /** The pane's top bar. The caller composes it from the editor it is handed. */
  toolbar?: ReactNode
  /** The live editor, for a toolbar that lives outside this pane. */
  onEditor?: (editor: Editor | null) => void
  /** This pane took focus. A shared toolbar uses it to know what it acts on. */
  onFocus?: () => void
  /**
   * Images dropped or pasted into this pane. Omitted means images are not
   * accepted here at all — in a project they become files in the author's
   * folder, which is the shell's business and not the pane's.
   */
  onImages?: (files: File[]) => Promise<void>
  /** A non-image file dropped on this pane. Omitted means the drop is ignored. */
  onFileDropped?: (file: File) => void
  /** The contents overlay. Controlled, because the control that opens it is in the toolbar. */
  tocOpen?: boolean
  onTocOpenChange?: (open: boolean) => void
  ariaLabel?: string
}

export function EditorPane({
  value,
  onChange,
  mode,
  toolbar,
  onEditor,
  onFocus,
  onImages,
  onFileDropped,
  tocOpen = false,
  onTocOpenChange,
  ariaLabel = 'Markdown source',
}: EditorPaneProps) {
  const [dragging, setDragging] = useState(false)
  const [link, setLink] = useState({ open: false, href: '' })
  const imageInput = useRef<HTMLInputElement>(null)

  // Guards the feedback loop: the pane writes markdown up, the caller hands it
  // back down. Without this the document is reparsed and the cursor thrown to
  // the start on every keystroke.
  const emitting = useRef(false)
  const timer = useRef<number | null>(null)

  // Parsed once per `value`, not once per consumer.
  const parsed = useMemo(() => {
    const tree = parseMarkdown(value)
    const { frontmatter, body } = splitFromTree(value, tree)
    return { frontmatter, body, bodyTree: bodyTree(tree) }
  }, [value])

  // The block the editor is never shown, re-joined on every write. A chapter's
  // `galley:` key lives here, and losing it would demote the chapter to a note
  // — silently shortening the book.
  const frontmatter = useRef<string | null>(parsed.frontmatter)

  // The body this pane's content was last synchronised with. Compared against
  // the INCOMING body rather than re-serialising the editor, because
  // re-serialising only equals the source when the source is already in the
  // serialiser's spelling — `_em_`, `* one` and setext headings are all
  // routine in a hand-written file and none of them converge.
  const syncedBody = useRef(parsed.body)

  const extensions = useMemo(
    () =>
      createExtensions({
        onRequestLink: (href) => setLink({ open: true, href }),
        onRequestImage: () => imageInput.current?.click(),
      }),
    [],
  )

  const pasteImages = useRef<((files: File[]) => Promise<void>) | null>(null)
  pasteImages.current = onImages ?? null

  const editor = useEditor({
    extensions,
    content: mdastToPm(parsed.bodyTree),
    editorProps: {
      attributes: {
        class:
          'prose-editor mx-auto h-full max-w-3xl px-6 py-8 text-sm focus:outline-none',
      },
      handlePaste: (_view, event) => {
        const files = imageFilesFrom(event.clipboardData?.items ?? null)
        if (files.length === 0 || !pasteImages.current) return false
        event.preventDefault()
        void pasteImages.current(files)
        return true
      },
    },
    onFocus: () => onFocus?.(),
    onUpdate: ({ editor }) => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        const body = serializeToMarkdown(editor.getJSON() as never)
        syncedBody.current = body
        emitting.current = true
        onChange(joinFrontmatter(frontmatter.current, body))
        window.setTimeout(() => {
          emitting.current = false
        }, 0)
      }, SERIALIZE_DEBOUNCE_MS)
    },
  })

  useEffect(() => {
    onEditor?.(editor)
  }, [editor, onEditor])

  useEffect(() => {
    if (!editor || emitting.current) return
    // Load-bearing regardless of whether the body changed: a frontmatter-only
    // write must still be picked up, or the next edit serialises the STALE
    // frontmatter back in.
    frontmatter.current = parsed.frontmatter
    if (parsed.body === syncedBody.current) return
    editor.commands.setContent(mdastToPm(parsed.bodyTree) as never, {
      emitUpdate: false,
    })
    syncedBody.current = parsed.body
  }, [editor, parsed])

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {onImages && (
        <input
          ref={imageInput}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            // Reset first: picking the same file twice fires no change event
            // otherwise, and re-adding a figure you just removed is ordinary.
            e.target.value = ''
            if (files.length > 0) void onImages(files)
          }}
        />
      )}

      <LinkDialog
        editor={editor}
        open={link.open}
        initialHref={link.href}
        onOpenChange={(open) => setLink((l) => ({ ...l, open }))}
      />

      {/** biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is an
       * enhancement over controls that are fully keyboard accessible. */}
      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border transition-colors',
          dragging && 'border-primary border-dashed bg-primary/5',
        )}
        onDragOver={(e) => {
          if (!onImages && !onFileDropped) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!onImages && !onFileDropped) return
          e.preventDefault()
          setDragging(false)
          // An image joins the document; anything else is opened AS the
          // document. Dropping a photo used to replace the manuscript with
          // its bytes, which is never what the gesture means.
          const images = imageFilesFrom(e.dataTransfer.files)
          if (images.length > 0 && onImages) {
            void onImages(images)
            return
          }
          const file = e.dataTransfer.files[0]
          if (file) onFileDropped?.(file)
        }}
      >
        {toolbar}
        {mode === 'rich' ? (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <EditorContent editor={editor} className="h-full" />
            </div>
            {/* Positions itself; it must not be wrapped in another positioned
                element or the two fight over placement. */}
            {editor && (
              <EditorToc
                editor={editor}
                open={tocOpen}
                onClose={() => onTocOpenChange?.(false)}
              />
            )}
            <EditorStatusBar editor={editor} />
          </>
        ) : (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => onFocus?.()}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-sm leading-relaxed"
            aria-label={ariaLabel}
          />
        )}
      </div>
    </div>
  )
}
