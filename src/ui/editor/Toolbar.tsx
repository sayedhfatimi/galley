import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  ChevronDown,
  CircleHelp,
  Code,
  Code2,
  FileUp,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Minus,
  PenLine,
  Quote,
  Strikethrough,
  Table as TableIcon,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { SHORTCUTS } from './keymap'
import { LatexInserter } from './LatexInserter'
import { ToolbarButton } from './ToolbarButton'

/**
 * The formatting toolbar.
 *
 * Every control here maps to a construct the Markdown bridge round-trips, so
 * nothing offered can be silently lost on the way to the PDF. That constraint
 * is why there is no colour, alignment or font-size control: LaTeX decides
 * those from the document configuration, and offering them would imply a
 * influence over the output that they do not have.
 */

// All six levels, because galley converts whole manuscripts: `#` is a chapter
// and nothing outside the editor owns the title.
const PARAGRAPH_STYLES = [
  { label: 'Body text', level: 0 },
  { label: 'Heading 1', level: 1 },
  { label: 'Heading 2', level: 2 },
  { label: 'Heading 3', level: 3 },
  { label: 'Heading 4', level: 4 },
  { label: 'Heading 5', level: 5 },
  { label: 'Heading 6', level: 6 },
] as const

/**
 * Dashes, offered as buttons because they are the punctuation a typeset
 * document needs and a keyboard does not have. Typography converts `--` and
 * `---` as you type, but only if you know to type them.
 */
const DASHES = [
  { glyph: '—', label: 'Em dash', hint: 'Sets off a clause — like this' },
  { glyph: '–', label: 'En dash', hint: 'Spans a range: 10–20' },
] as const

export interface ToolbarProps {
  editor: Editor | null
  /** Document-level actions, folded in here so there is no second chrome row. */
  onOpen: () => void
  onToggleToc: () => void
  tocOpen: boolean
  onHelp: () => void
  onToggleMode: () => void
  onClear: () => void
  mode: 'rich' | 'source'
}

export function Toolbar({
  editor,
  onOpen,
  onToggleToc,
  tocOpen,
  onHelp,
  onToggleMode,
  onClear,
  mode,
}: ToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        strike: e.isActive('strike'),
        code: e.isActive('code'),
        link: e.isActive('link'),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        taskList: e.isActive('taskList'),
        blockquote: e.isActive('blockquote'),
        codeBlock: e.isActive('codeBlock'),
        level: [1, 2, 3, 4, 5, 6].find((l) => e.isActive('heading', { level: l })) ?? 0,
      }
    },
  })

  if (!editor || !state) return null

  const chain = () => editor.chain().focus()

  const setLevel = (level: number) => {
    if (level === 0) chain().setParagraph().run()
    else
      chain()
        .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
        .run()
  }

  // Editing an existing link opens the same dialog, pre-filled, so the target
  // can be corrected rather than only removed.
  const editLink = () => chain().requestLink().run()

  const current =
    PARAGRAPH_STYLES.find((s) => s.level === state.level) ?? PARAGRAPH_STYLES[0]

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b px-2 py-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 font-normal">
            {current.label}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PARAGRAPH_STYLES.map((style) => (
            <DropdownMenuItem key={style.level} onSelect={() => setLevel(style.level)}>
              {style.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<Bold className="size-4" />}
        label="Bold"
        shortcut="Ctrl B"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolbarButton
        icon={<Italic className="size-4" />}
        label="Italic"
        shortcut="Ctrl I"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolbarButton
        icon={<Strikethrough className="size-4" />}
        label="Strikethrough"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      />
      <ToolbarButton
        icon={<Code className="size-4" />}
        label="Inline code"
        active={state.code}
        onClick={() => chain().toggleCode().run()}
      />
      <ToolbarButton
        icon={<LinkIcon className="size-4" />}
        label={state.link ? 'Edit link' : 'Add link'}
        shortcut={SHORTCUTS.link}
        active={state.link}
        onClick={editLink}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<List className="size-4" />}
        label="Bulleted list"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={<ListOrdered className="size-4" />}
        label="Numbered list"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={<ListTodo className="size-4" />}
        label="Task list"
        active={state.taskList}
        onClick={() => chain().toggleTaskList().run()}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<ImagePlus className="size-4" />}
        label="Add a figure"
        onClick={() => chain().requestImage().run()}
      />

      <ToolbarButton
        icon={<Quote className="size-4" />}
        label="Block quote"
        active={state.blockquote}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={<Code2 className="size-4" />}
        label="Code block"
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      />
      <ToolbarButton
        icon={<TableIcon className="size-4" />}
        label="Insert table"
        onClick={() =>
          chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      />
      <LatexInserter editor={editor} />
      <ToolbarButton
        icon={<Minus className="size-4" />}
        label="Horizontal rule"
        onClick={() => chain().setHorizontalRule().run()}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      {DASHES.map((dash) => (
        <ToolbarButton
          key={dash.glyph}
          icon={
            <span aria-hidden className="text-base leading-none">
              {dash.glyph}
            </span>
          }
          label={`${dash.label} — ${dash.hint}`}
          onClick={() => chain().insertContent(dash.glyph).run()}
        />
      ))}

      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarButton
          icon={<FileUp className="size-4" />}
          label="Open a Markdown file"
          onClick={onOpen}
        />
        <ToolbarButton
          icon={<ListTree className="size-4" />}
          label="Table of contents"
          active={tocOpen}
          onClick={onToggleToc}
        />
        <ToolbarButton
          icon={<CircleHelp className="size-4" />}
          label="Help and about"
          onClick={onHelp}
        />
        <ToolbarButton
          icon={
            mode === 'rich' ? <Code className="size-4" /> : <PenLine className="size-4" />
          }
          label={mode === 'rich' ? 'Edit as Markdown' : 'Edit as rich text'}
          onClick={onToggleMode}
        />
        {/* Separated from the rest: this discards the document rather than
            changing it, and it is the only control here that destroys work. */}
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolbarButton
          icon={<Trash2 className="size-4" />}
          label="Clear the document"
          onClick={onClear}
        />
      </div>
    </div>
  )
}
