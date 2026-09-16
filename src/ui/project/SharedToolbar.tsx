import type { Editor } from '@tiptap/core'
import { Code, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EditorMode } from '@/ui/editor/EditorPane'
import { Toolbar } from '@/ui/editor/Toolbar'
import { ToolbarButton } from '@/ui/editor/ToolbarButton'
import type { PaneSide } from '@/ui/lib/store'

/**
 * One toolbar, spanning both editors, acting on whichever has focus.
 *
 * Two toolbars would be clutter and, worse, a question the reader has to
 * answer every time they reach for a button: *which one does this act on?*
 * One toolbar can only work if the answer is always visible, which is what
 * the indicator below is for — it is a correctness affordance, not decoration.
 *
 * ## Why this is safe to share
 *
 * Every control left in `Toolbar` once its document-scoped half is omitted is
 * SELECTION-scoped. Bold is only meaningful when a cursor is already
 * somewhere, so "the editor with focus" is unambiguous by construction. The
 * controls that belonged to no pane — opening a file, clearing it, the
 * contents, help — are gone rather than present-and-disabled: a control that
 * is inert half the time is the failure this project has already fixed twice.
 *
 * ## Focus, and why `lastFocused` rather than the live one
 *
 * Clicking a toolbar button takes focus OUT of the editor and puts it on the
 * button. Anything asking "what is focused now" is therefore always answered
 * "the button", so the target has to be the pane that was focused LAST. Get
 * this wrong and formatting silently applies to the wrong file — which, in a
 * folder project, is an edit to a file in someone's vault.
 *
 * ## Mode
 *
 * A project opens in SOURCE mode, where there is no ProseMirror editor to act
 * on at all. Formatting controls would be inert, so they are not shown; the
 * bar carries the mode toggle and the indicator instead.
 */

export interface SharedToolbarProps {
  /** The editor of the pane that was focused last, if it is in rich mode. */
  editor: Editor | null
  active: PaneSide
  mode: EditorMode
  /** What the toolbar will act on, said in words as well as position. */
  activeName: string | null
  onToggleMode: () => void
  /** Only the right pane can be empty, so only it can be absent. */
  hasRight: boolean
}

export function SharedToolbar({
  editor,
  active,
  mode,
  activeName,
  onToggleMode,
  hasRight,
}: SharedToolbarProps) {
  const indicator = (
    <div className="flex items-center gap-2 pr-1">
      {activeName && (
        <span
          className="max-w-[16rem] truncate text-muted-foreground text-xs"
          title={activeName}
        >
          {activeName}
        </span>
      )}
      <ToolbarButton
        icon={
          mode === 'rich' ? <Code className="size-4" /> : <PenLine className="size-4" />
        }
        label={mode === 'rich' ? 'Edit as Markdown' : 'Edit as rich text'}
        onClick={onToggleMode}
      />
    </div>
  )

  return (
    <div className="shrink-0">
      {mode === 'rich' ? (
        <Toolbar editor={editor} trailing={indicator} />
      ) : (
        <div className="flex shrink-0 items-center justify-end gap-0.5 border-b px-2 py-1">
          {indicator}
        </div>
      )}

      {/*
        The positional half of the indicator: an accent under the side the
        toolbar acts on. Free, given the bar already spans both editors, and
        it needs no reading — which is the point, because the name beside the
        buttons is exact and this is ambient. Hidden when there is only one
        pane, since a pointer at something unambiguous is noise.
      */}
      {hasRight && (
        <div aria-hidden className="flex h-0.5">
          <div
            className={cn(
              'flex-1 transition-colors',
              active === 'left' ? 'bg-primary' : 'bg-transparent',
            )}
          />
          <div
            className={cn(
              'flex-1 transition-colors',
              active === 'right' ? 'bg-primary' : 'bg-transparent',
            )}
          />
        </div>
      )}
    </div>
  )
}
