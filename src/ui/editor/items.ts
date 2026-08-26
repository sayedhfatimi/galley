import type { Editor, Range } from '@tiptap/core'
import {
  Code,
  ImagePlus,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  type LucideIcon,
  Minus,
  Quote,
  Sigma,
  Table as TableIcon,
  Type,
} from 'lucide-react'
import { SHORTCUTS } from './keymap'

/*
 * Slash menu items. Each item carries the `command` it runs when
 * picked — TipTap delivers the trigger range so the command can
 * delete the typed `/<query>` before inserting the new block.
 *
 * Items mirror the toolbar's insertable blocks plus heading levels;
 * the slash menu is the keyboard-driven path to the same actions.
 */

export type SlashItem = {
  id: string
  title: string
  description: string
  keywords: string[]
  icon: LucideIcon
  /**
   * Optional keyboard shortcut hint (e.g. "⌘B"). Surfaced as a
   * right-aligned label in the slash menu so authors discover the
   * same shortcuts the toolbar tooltips already advertise.
   */
  shortcut?: string
  command: (args: { editor: Editor; range: Range }) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'heading1',
    title: 'Heading 1',
    description: 'A chapter in a book or report, a section in an article',
    keywords: ['h1', 'heading', 'chapter', 'title'],
    icon: Type,
    shortcut: SHORTCUTS.heading1,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'heading2',
    title: 'Heading 2',
    description: 'The level below a chapter',
    keywords: ['h2', 'heading', 'section'],
    icon: Type,
    shortcut: SHORTCUTS.heading2,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'heading3',
    title: 'Heading 3',
    description: 'Sub-section heading',
    keywords: ['h3', 'heading', 'subhead'],
    icon: Type,
    shortcut: SHORTCUTS.heading3,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'heading4',
    title: 'Heading 4',
    description: 'Smaller section heading',
    keywords: ['h4', 'heading'],
    icon: Type,
    shortcut: SHORTCUTS.heading4,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 4 }).run(),
  },
  {
    id: 'bulletList',
    title: 'Bullet list',
    description: 'Unordered list',
    keywords: ['bullet', 'list', 'ul'],
    icon: List,
    shortcut: SHORTCUTS.bulletList,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    title: 'Numbered list',
    description: 'Ordered 1, 2, 3…',
    keywords: ['ordered', 'numbered', 'list', 'ol'],
    icon: ListOrdered,
    shortcut: SHORTCUTS.orderedList,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'taskList',
    title: 'Task list',
    description: 'Checklist with checkboxes',
    keywords: ['task', 'todo', 'check', 'checklist'],
    icon: ListTodo,
    shortcut: SHORTCUTS.taskList,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: 'blockquote',
    title: 'Quote',
    description: 'Block quotation',
    keywords: ['quote', 'blockquote', 'callout'],
    icon: Quote,
    shortcut: SHORTCUTS.blockquote,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: 'codeBlock',
    title: 'Code block',
    description: 'Fenced code with language',
    keywords: ['code', 'fence', 'block'],
    icon: Code,
    shortcut: SHORTCUTS.codeBlock,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: 'math',
    title: 'Math (display)',
    description: 'Block math equation',
    keywords: ['math', 'tex', 'latex', 'equation'],
    icon: Sigma,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertMathBlock('').run(),
  },
  {
    id: 'mathInline',
    title: 'Inline math',
    description: 'Inline math fragment',
    keywords: ['math', 'inline', 'tex'],
    icon: Sigma,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertMathInline('').run(),
  },
  {
    id: 'image',
    title: 'Figure',
    description: 'Add a picture — PNG, JPEG or PDF',
    keywords: ['image', 'figure', 'picture', 'photo', 'diagram'],
    icon: ImagePlus,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).requestImage().run(),
  },
  {
    id: 'table',
    title: 'Table',
    description: 'A three-by-three table with a header row',
    keywords: ['table', 'grid'],
    icon: TableIcon,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    id: 'link',
    title: 'Link',
    description: 'Link the selection to a URL',
    keywords: ['link', 'url', 'anchor', 'href'],
    icon: Link2,
    shortcut: SHORTCUTS.link,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).requestLink().run(),
  },
  {
    id: 'hr',
    title: 'Divider',
    description: 'Horizontal rule',
    keywords: ['divider', 'rule', 'hr', 'separator'],
    icon: Minus,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
]

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(q) || item.keywords.some((k) => k.includes(q)),
  )
}
