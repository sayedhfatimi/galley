import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SLASH_ITEMS, type SlashItem } from './items'
import { SHORTCUTS } from './keymap'

/*
 * Editor reference dialog: every keyboard shortcut + every slash menu
 * item, in one searchable spot. Mounted from a "?" button in the top
 * toolbar.
 *
 * Tab strip routes between "Shortcuts" and "Slash commands" — most
 * authors are looking for one or the other, not both at once. A single
 * filter input at the top narrows the active tab in real time.
 *
 * SHORTCUTS (lib/keymap.ts) and SLASH_ITEMS (slash/items.ts) stay the
 * source of truth; grouping/labels here are presentational only.
 */

type ShortcutRow = { label: string; combo: string }
type ShortcutSection = { title: string; rows: ShortcutRow[] }

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Inline formatting',
    rows: [
      { label: 'Bold', combo: SHORTCUTS.bold },
      { label: 'Italic', combo: SHORTCUTS.italic },
      { label: 'Strikethrough', combo: SHORTCUTS.strike },
      { label: 'Inline code', combo: SHORTCUTS.code },
    ],
  },
  {
    title: 'Block formatting',
    rows: [
      { label: 'Paragraph', combo: SHORTCUTS.paragraph },
      { label: 'Heading 1', combo: SHORTCUTS.heading1 },
      { label: 'Heading 2', combo: SHORTCUTS.heading2 },
      { label: 'Heading 3', combo: SHORTCUTS.heading3 },
      { label: 'Heading 4', combo: SHORTCUTS.heading4 },
      { label: 'Quote', combo: SHORTCUTS.blockquote },
      { label: 'Code block', combo: SHORTCUTS.codeBlock },
    ],
  },
  {
    title: 'Lists',
    rows: [
      { label: 'Bullet list', combo: SHORTCUTS.bulletList },
      { label: 'Numbered list', combo: SHORTCUTS.orderedList },
      { label: 'Task list', combo: SHORTCUTS.taskList },
    ],
  },
  {
    title: 'Insert',
    rows: [
      { label: 'Link', combo: SHORTCUTS.link },
      { label: 'Line break', combo: SHORTCUTS.hardBreak },
    ],
  },
  {
    title: 'Actions',
    rows: [
      { label: 'Undo', combo: SHORTCUTS.undo },
      { label: 'Redo', combo: SHORTCUTS.redo },
    ],
  },
  {
    title: 'Editor',
    rows: [{ label: 'Shortcuts & slash commands', combo: SHORTCUTS.help }],
  },
]

// Slash items are stored flat (slash menu order); the dialog groups
// them by capability for easier scanning. Items not listed here fall
// into the "Other" bucket — guards against silent omission when new
// slash items are added.
const SLASH_GROUPS: Array<{ title: string; ids: string[] }> = [
  { title: 'Headings', ids: ['heading1', 'heading2', 'heading3', 'heading4'] },
  { title: 'Lists', ids: ['bulletList', 'orderedList', 'taskList'] },
  { title: 'Blocks', ids: ['blockquote', 'codeBlock', 'hr'] },
  { title: 'Math & tables', ids: ['math', 'mathInline', 'table'] },
  { title: 'Insert', ids: ['link'] },
]

function groupSlashItems(
  items: SlashItem[],
): Array<{ title: string; items: SlashItem[] }> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const used = new Set<string>()
  const groups: Array<{ title: string; items: SlashItem[] }> = []
  for (const group of SLASH_GROUPS) {
    const groupItems: SlashItem[] = []
    for (const id of group.ids) {
      const item = byId.get(id)
      if (!item) continue
      groupItems.push(item)
      used.add(id)
    }
    if (groupItems.length > 0) {
      groups.push({ title: group.title, items: groupItems })
    }
  }
  const leftovers = items.filter((i) => !used.has(i.id))
  if (leftovers.length > 0) {
    groups.push({ title: 'Other', items: leftovers })
  }
  return groups
}

function filterShortcuts(sections: ShortcutSection[], query: string): ShortcutSection[] {
  const q = query.trim().toLowerCase()
  if (!q) return sections
  return sections
    .map((section) => ({
      title: section.title,
      rows: section.rows.filter(
        (row) =>
          row.label.toLowerCase().includes(q) || row.combo.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.rows.length > 0)
}

function filterSlash(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.toLowerCase().includes(q)),
  )
}

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState('')

  const filteredShortcuts = useMemo(
    () => filterShortcuts(SHORTCUT_SECTIONS, query),
    [query],
  )
  const filteredSlash = useMemo(() => filterSlash(SLASH_ITEMS, query), [query])
  const groupedSlash = useMemo(() => groupSlashItems(filteredSlash), [filteredSlash])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editor reference</DialogTitle>
          <DialogDescription>
            Every keyboard shortcut and slash command, in one place.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="shortcuts" className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
              <TabsTrigger value="slash">Slash commands</TabsTrigger>
            </TabsList>
            <div className="relative w-full sm:w-64">
              <Search
                className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter…"
                className="h-8 pl-8 pr-8 text-sm"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear filter"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>

          <TabsContent value="about" className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 pr-1 text-sm leading-relaxed">
              <p>
                galley turns Markdown into a typeset PDF <em>and</em> the LaTeX source
                that produced it. The PDF is the finished article if you just want your
                draft to look like a book; the <code>.tex</code> is the finished article
                if you already know LaTeX and want a clean scaffold rather than a preamble
                assembled by hand.
              </p>

              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="font-medium">Nothing leaves this device.</p>
                <p className="mt-1 text-muted-foreground">
                  A real TeX engine runs in your browser, so your document is never
                  uploaded and no server ever sees it. Your work is kept in this browser
                  so you can close the tab and pick up where you left off.
                </p>
              </div>

              <div>
                <p className="font-medium">Getting a PDF</p>
                <p className="mt-1 text-muted-foreground">
                  Write or drop in a Markdown file, set the document up under
                  <strong> Configure</strong> — article, report or book, page size,
                  margins, contents — then <strong>Render PDF</strong>. The first render
                  downloads the typesetting engine, which happens once.
                </p>
              </div>

              <div>
                <p className="font-medium">Frontmatter fills the title page</p>
                <p className="mt-1 text-muted-foreground">
                  A YAML block at the top of your file — title, subtitle, author, date —
                  is read straight into the document setup, so an export from a
                  note-taking app usually needs no configuration at all.
                </p>
              </div>

              <div>
                <p className="font-medium">Known limits</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Images are not supported yet; each one is marked in the output.</li>
                  <li>Citations and bibliographies are planned, not present.</li>
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="shortcuts"
            className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1"
          >
            {filteredShortcuts.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              filteredShortcuts.map((section) => (
                <section key={section.title} className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </h3>
                  <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-muted/20">
                    {section.rows.map((row) => (
                      <li
                        key={row.label}
                        className="flex items-center justify-between gap-4 px-3 py-1.5 text-sm"
                      >
                        <span className="text-foreground">{row.label}</span>
                        <Kbd>{row.combo}</Kbd>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </TabsContent>

          <TabsContent
            value="slash"
            className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1"
          >
            <p className="text-xs text-muted-foreground">
              Type <Kbd>/</Kbd> in the editor to open the menu, then filter by typing a
              few letters.
            </p>
            {groupedSlash.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              groupedSlash.map((group) => (
                <section key={group.title} className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </h3>
                  <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-muted/20">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-baseline justify-between gap-4 px-3 py-1.5 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="text-foreground">{item.title}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        </div>
                        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          /{item.id}
                        </code>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function EmptyState({ query }: { query: string }) {
  return (
    <p className="rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
      No matches for <span className="font-mono text-foreground/80">"{query}"</span>.
    </p>
  )
}
