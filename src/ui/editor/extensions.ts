import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Typography from '@tiptap/extension-typography'
import StarterKit from '@tiptap/starter-kit'
import { Footnote } from './footnote'
import { ImagePlaceholder } from './image'
import { ImagePrompt } from './image-prompt'
import { LinkPrompt } from './link'
import { MathBlock } from './math-block'
import { MathInline } from './math-inline'
import { SlashCommand } from './slash-command'

export interface EditorHandlers {
  /** Called when the toolbar or `/link` needs a URL from the reader. */
  onRequestLink?: (currentHref: string) => void
  onRequestImage?: () => void
}

/**
 * The editor's document model.
 *
 * Every node here must survive a round trip through `src/core/markdown/pm/`,
 * because that bridge is what turns the document into LaTeX. Adding an
 * extension without teaching the bridge about it means whatever it produces is
 * silently dropped on the way to the PDF — so `roundtrip.test.ts` should grow a
 * case whenever this list does.
 *
 * A factory rather than a constant because some extensions need a handler that
 * only the mounting component has. The schema is identical either way, so tests
 * that only care about the node vocabulary can call it with no arguments.
 */
export function createExtensions({ onRequestLink, onRequestImage }: EditorHandlers = {}) {
  return [
    StarterKit.configure({
      // Supplied separately below so the mdast bridge sees the shapes it expects.
      link: false,
    }),
    Link.configure({ openOnClick: false, autolink: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    // Typography turns quotes and dashes into their typographic forms as you
    // type. Harmless here: the LaTeX escaper already emits the same characters,
    // so what appears in the editor matches what reaches the PDF.
    Typography,
    MathInline,
    MathBlock,
    Footnote,
    ImagePlaceholder,
    SlashCommand,
    LinkPrompt.configure({ onRequest: onRequestLink ?? (() => {}) }),
    ImagePrompt.configure({ onRequest: onRequestImage ?? (() => {}) }),
    Placeholder.configure({
      placeholder: 'Write, paste, or drop a Markdown file. Press / for commands.',
    }),
  ]
}
