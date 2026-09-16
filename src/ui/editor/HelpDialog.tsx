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
  // Orientation first. This dialog and the README are the only help galley
  // has, so someone opening it for the first time should land on what the
  // application IS, not on a table of keybindings they have not asked for.
  const [tab, setTab] = useState('about')

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
          <DialogTitle>Help and about</DialogTitle>
          <DialogDescription>
            How to get a PDF, how to write a book from a folder, and every shortcut and
            slash command.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="about">Getting started</TabsTrigger>
              <TabsTrigger value="books">Books &amp; folders</TabsTrigger>
              <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
              <TabsTrigger value="slash">Slash commands</TabsTrigger>
            </TabsList>
            {/* The filter drives the two reference lists; About has nothing
                to match against, so it would sit there inert. */}
            {tab === 'about' || tab === 'books' ? null : (
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
            )}
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
                  so you can close the tab and pick up where you left off. If you open a
                  folder, galley reads and writes it directly on your machine — those
                  files never move either.
                </p>
              </div>

              <div>
                <p className="font-medium">Two ways in</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    <strong>One document.</strong> Paste, type, or drop in a Markdown
                    file. Everything stays in this browser. Works everywhere.
                  </li>
                  <li>
                    <strong>A folder.</strong> <strong>Open a book</strong> in the bar
                    above points galley at a folder of chapters — an Obsidian vault, or
                    one folder inside one — and edits the files in place. See{' '}
                    <strong>Books &amp; folders</strong>.
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-medium">Getting a PDF</p>
                <p className="mt-1 text-muted-foreground">
                  Set the document up under <strong>Configure</strong> — article, report
                  or book, page size, margins, contents — then <strong>Render PDF</strong>
                  . The first render downloads the typesetting engine, which happens once
                  and is then cached; later renders fetch nothing. <strong>.tex</strong>{' '}
                  gives you the LaTeX, as a <code>.zip</code> with your figures if the
                  document has any.
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
                <p className="font-medium">Chapters, and what is not one</p>
                <p className="mt-1 text-muted-foreground">
                  In a Book or Report, <code>#</code> is a chapter. A copyright page, a
                  dedication or an appendix does not belong among the numbered chapters,
                  so each part can be moved into <strong>front matter</strong> or{' '}
                  <strong>back matter</strong>, kept out of the contents, or given a
                  shorter contents entry. In one document that is the{' '}
                  <strong>Structure</strong> section of Configure; in a folder it is the
                  control under each file in the sidebar.
                </p>
              </div>

              <div>
                <p className="font-medium">When a render fails</p>
                <p className="mt-1 text-muted-foreground">
                  The dialog keeps the typesetter&rsquo;s log and the <code>.tex</code> —
                  the log names the line it stopped on. Notices along the bottom of the
                  window are galley telling you what it could not typeset well{' '}
                  <em>before</em> you render, not errors.
                </p>
              </div>

              <div>
                <p className="font-medium">Known limits</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    Figures are PNG, JPEG and PDF. An image hosted elsewhere is never
                    fetched — that is the point of running locally — so it is marked in
                    the output instead.
                  </li>
                  <li>
                    Greek letters need a typeface that carries them; accented Greek, and
                    scripts like Cyrillic and CJK, cannot be set at all.
                  </li>
                  <li>Mathematics is always set in Computer Modern.</li>
                  <li>Hyphenation is English-only.</li>
                  <li>Citations and bibliographies are planned, not present.</li>
                  <li>
                    Opening a folder needs Chrome or Edge on the desktop. Everything else
                    works in any browser.
                  </li>
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="books" className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 pr-1 text-sm leading-relaxed">
              <p>
                A book is usually a <strong>folder of chapters</strong>, not one enormous
                file. <strong>Open a book</strong> points galley at that folder and edits
                it in place, so a draft is continued rather than pasted in again every
                time.
              </p>

              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="font-medium">Chrome or Edge, on the desktop.</p>
                <p className="mt-1 text-muted-foreground">
                  Reading and writing a folder needs the File System Access API. Firefox
                  has declined to implement it and Safari has not shipped it, so galley
                  says so rather than offering a button that fails. Single documents work
                  everywhere. On a phone, write in Obsidian and open the same folder here
                  later — it is a better mobile editor than this could be.
                </p>
              </div>

              <div>
                <p className="font-medium">What makes a file a chapter</p>
                <p className="mt-1 text-muted-foreground">
                  A <code>galley:</code> block in its frontmatter. Without one the file is
                  a <strong>note</strong> — still listed, still editable, simply never
                  typeset. You do not have to write that block: pick <em>Front matter</em>
                  , <em>Chapter</em> or <em>Back matter</em> under the file in the sidebar
                  and galley writes it for you. <em>Not in the book</em> puts it back to a
                  note.
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">{`---
galley:
  role: front      # front | main | back
  listed: false    # keep it out of the contents
  toc_title: Short # a shorter contents entry
---

# Copyright`}</pre>
              </div>

              <div>
                <p className="font-medium">The order is the file names</p>
                <p className="mt-1 text-muted-foreground">
                  Chapters are ordered by their path, sorted the way a person would sort
                  it — so <code>9</code> comes before <code>10</code>. Nothing records the
                  order a second time, which means renaming a file is how you move a
                  chapter. Front matter comes first, then chapters, then back matter,
                  whatever the names.
                </p>
              </div>

              <div>
                <p className="font-medium">book.md carries the book</p>
                <p className="mt-1 text-muted-foreground">
                  Title and author in the ordinary frontmatter, and the settings under a{' '}
                  <code>book:</code> key — trim size, margins, typeface, contents.{' '}
                  <strong>Configure</strong> writes it for you. It is what makes the
                  folder portable: the settings travel with the book rather than living in
                  one browser.
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">{`---
title: The Philosophy of Illusions
author: A Writer
book:
  character: book
  paper: a5
  two_sided: true
---`}</pre>
              </div>

              <div>
                <p className="font-medium">Any layout works</p>
                <p className="mt-1 text-muted-foreground">
                  Chapters at the top level, or a folder each with their figures beside
                  them. Notes anywhere. galley imposes no convention, so it cannot
                  conflict with one you already have. Dot-folders such as{' '}
                  <code>.obsidian</code> are never read.
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">{`the-illusion/
  book.md            the book's title and settings
  00-copyright.md    front matter
  03-illusion/
    index.md         a chapter
    diagram.png      its figure, beside it
  99-about.md        back matter
  research.md        a note — never typeset`}</pre>
              </div>

              <div>
                <p className="font-medium">Saving, and not overwriting</p>
                <p className="mt-1 text-muted-foreground">
                  Edits save themselves a moment after you stop typing. Before every write
                  galley re-reads the file, and if it changed elsewhere — in Obsidian, or
                  on your phone through Sync — it <strong>refuses</strong> and tells you,
                  rather than choosing which version to lose. Load the newer one and carry
                  on.
                </p>
              </div>

              <div>
                <p className="font-medium">A project opens in Markdown, deliberately</p>
                <p className="mt-1 text-muted-foreground">
                  These are your files, so galley does not reformat them. The source view
                  writes back exactly the bytes you typed. The rich editor is one click
                  away and tidies formatting as it goes — <code>_em_</code> becomes{' '}
                  <code>*em*</code>, <code>* bullets</code> become <code>- bullets</code>{' '}
                  — which changes nothing about your words or the PDF, but does change the
                  file. It tells you before the first edit.
                </p>
              </div>

              <div>
                <p className="font-medium">Figures</p>
                <p className="mt-1 text-muted-foreground">
                  <strong>Add a figure</strong> lists the pictures already in the folder.
                  Dropping one in writes it beside the chapter that received it; if the
                  name is taken galley asks for a different one rather than replacing
                  anything. Obsidian embeds — <code>![[diagram.png]]</code> — work, and a
                  reference that matches nothing in the folder is reported instead of
                  quietly vanishing.
                </p>
              </div>

              <div>
                <p className="font-medium">Getting the book out</p>
                <p className="mt-1 text-muted-foreground">
                  <strong>Render PDF</strong> typesets every chapter in order as one book.
                  Download it, or save it into the folder as <code>book.pdf</code> — on
                  request rather than on every render, since anything written into a
                  synced folder is copied to your other devices.
                </p>
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
