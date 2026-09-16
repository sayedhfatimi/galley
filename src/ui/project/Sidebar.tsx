import { AlertTriangle, ColumnsSettings, FileText, StickyNote } from 'lucide-react'
import { useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Diagnostic } from '@/core/diagnostics'
import type { Project } from '@/core/project/types'
import { type PartRole, roleRank } from '@/core/structure'
import { cn } from '@/lib/utils'
import type { FileState } from '@/ui/lib/store'

/**
 * The project: every chapter in reading order, and every note beside them.
 *
 * ## Membership is a control, not a rule about folders
 *
 * The role selector reads front / main / back / **not in the book**, and
 * that last option is the whole design. A file that is not in the book is
 * still listed here — it has moved section, not disappeared — so nothing can
 * be silently dropped from a manuscript, and promoting a note to a chapter is
 * one click rather than a question about where the file has to live. galley
 * imposes no folder convention precisely because it does not need one.
 *
 * ## Ordering
 *
 * Grouped by role, and within a group left exactly as `readProject` returned
 * it — that is `partOrder`, the natural sort of each relative path, which is
 * the single fact deciding what order the book is in. Re-sorting here would
 * be a second opinion about it, and the two would drift.
 */

const ROLE_LABELS: Record<PartRole, string> = {
  front: 'Front matter',
  main: 'Chapters',
  back: 'Back matter',
}

/**
 * Reading order, taken from `roleRank` rather than restated.
 *
 * `core/structure.ts` decides what order the divisions of a book come in, and
 * the sidebar must agree with the typeset output or the list is lying. Sorting
 * by `roleRank` here means there is one source for that fact and this list is
 * only a set.
 */
const ROLES: PartRole[] = (['main', 'back', 'front'] as PartRole[]).sort(
  (a, b) => roleRank(a) - roleRank(b),
)

/** `not-in-book` is a real choice here, not the absence of one. */
type Membership = PartRole | 'note'

export interface SidebarProps {
  project: Project
  files: Map<string, FileState>
  diagnostics: Diagnostic[]
  active: { left: string | null; right: string | null }
  onOpen: (path: string) => void
  onOpenBeside: (path: string) => void
  onChangeMembership: (path: string, membership: Membership) => void
}

export function Sidebar({
  project,
  files,
  diagnostics,
  active,
  onOpen,
  onOpenBeside,
  onChangeMembership,
}: SidebarProps) {
  // Which files a diagnostic names, so a problem in chapter 19 is visible
  // without reading a strip at the bottom of the screen.
  const flagged = useMemo(() => {
    const out = new Set<string>()
    for (const d of diagnostics) if (d.file) out.add(d.file)
    return out
  }, [diagnostics])

  const byRole = useMemo(() => {
    const groups = new Map<PartRole, typeof project.parts>()
    for (const role of ROLES) groups.set(role, [])
    for (const part of project.parts) groups.get(part.spec.role)?.push(part)
    // Insertion order is ROLES' order, which is `roleRank`'s.
    return [...groups.entries()]
  }, [project.parts])

  const row = (path: string, membership: Membership) => (
    <Row
      key={path}
      path={path}
      membership={membership}
      state={files.get(path)}
      flagged={flagged.has(path)}
      active={active.left === path || active.right === path}
      beside={active.right === path}
      onOpen={onOpen}
      onOpenBeside={onOpenBeside}
      onChangeMembership={onChangeMembership}
    />
  )

  const empty = project.parts.length === 0 && project.notes.length === 0

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 p-2">
        {empty && (
          <p className="px-2 py-6 text-center text-muted-foreground text-xs leading-relaxed">
            This folder holds no Markdown files yet. Add one in Obsidian and it will
            appear here.
          </p>
        )}

        {byRole.map(([role, parts]) =>
          parts.length === 0 ? null : (
            <section key={role}>
              <GroupHeading>{ROLE_LABELS[role]}</GroupHeading>
              <ul className="space-y-0.5">
                {parts.map((p) => row(p.path, p.spec.role))}
              </ul>
            </section>
          ),
        )}

        {project.notes.length > 0 && (
          <section>
            <GroupHeading>Notes</GroupHeading>
            <ul className="space-y-0.5">
              {project.notes.map((n) => row(n.path, 'note'))}
            </ul>
          </section>
        )}
      </div>
    </ScrollArea>
  )
}

/**
 * What to call a file in the list.
 *
 * Its own NAME, never its first heading. A part is a file here, so retitling a
 * heading can no longer lose the file's settings — the gap `known-gaps.md`
 * recorded for single-document structure.
 *
 * Except when that name is `index`. A chapter per folder, with its figures
 * beside it, is one of the layouts the spec explicitly supports, and every
 * chapter in such a book is called `index.md` — so the list read "index,
 * index, index". The folder is the name the author chose; the file name is
 * just the convention that puts it there. Found by opening a real project and
 * looking at it.
 */
function labelFor(path: string): string {
  const segments = path.split('/')
  const base = (segments.pop() ?? path).replace(/\.(md|markdown)$/i, '')
  if (base.toLowerCase() !== 'index') return base
  return segments.at(-1) ?? base
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-2 pb-1 font-medium text-[11px] text-muted-foreground/70 uppercase tracking-wider">
      {children}
    </h2>
  )
}

interface RowProps {
  path: string
  membership: Membership
  state: FileState | undefined
  flagged: boolean
  active: boolean
  beside: boolean
  onOpen: (path: string) => void
  onOpenBeside: (path: string) => void
  onChangeMembership: (path: string, membership: Membership) => void
}

function Row({
  path,
  membership,
  state,
  flagged,
  active,
  beside,
  onOpen,
  onOpenBeside,
  onChangeMembership,
}: RowProps) {
  const name = labelFor(path)
  const nested = path.includes('/')

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-1 transition-colors',
          active && 'bg-accent',
        )}
      >
        <button
          type="button"
          onClick={() => onOpen(path)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm focus-visible:outline-none"
        >
          {membership === 'note' ? (
            <StickyNote className="size-3.5 shrink-0 text-muted-foreground/60" />
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground/60" />
          )}
          <span className="min-w-0 flex-1 truncate" title={nested ? path : undefined}>
            {name}
          </span>
          {state?.conflict ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
              </TooltipTrigger>
              <TooltipContent>Changed elsewhere since you opened it</TooltipContent>
            </Tooltip>
          ) : null}
          {flagged && !state?.conflict ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="size-3.5 shrink-0 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>This file raised a notice</TooltipContent>
            </Tooltip>
          ) : null}
          {state?.dirty ? (
            <span
              role="img"
              aria-label="Unsaved changes"
              className="size-1.5 shrink-0 rounded-full bg-foreground/50"
            />
          ) : null}
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onOpenBeside(path)}
              aria-label={`Open ${name} beside`}
              className={cn(
                'shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
                beside && 'opacity-100 text-foreground',
              )}
            >
              <ColumnsSettings className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Open beside</TooltipContent>
        </Tooltip>
      </div>

      {active && (
        <div className="px-2 pt-1 pb-2">
          <Select
            value={membership}
            onValueChange={(value) => onChangeMembership(path, value as Membership)}
          >
            <SelectTrigger size="sm" className="h-7 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="front">Front matter</SelectItem>
              <SelectItem value="main">Chapter</SelectItem>
              <SelectItem value="back">Back matter</SelectItem>
              {/* Not a way of hiding a file: it stays listed under Notes, and
                  comes back with one more click. */}
              <SelectItem value="note">Not in the book</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </li>
  )
}
