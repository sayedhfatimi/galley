import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  type DocumentCharacter,
  type FontSize,
  type GalleyConfig,
  type LineSpacing,
  type Margins,
  PAPER_SIZES,
  type PaperName,
  presetFor,
  resolvePaper,
  usesChapters,
} from '@/core/config'
import { previewFamily, TYPEFACE_NAMES, TYPEFACES, type TypefaceName } from '@/core/fonts'
import { GUTTER_BANDS, kdpMargins } from '@/core/kdp'
import { frontmatterData } from '@/core/markdown/frontmatter'
import { parseMarkdown } from '@/core/markdown/parse'
import {
  canWriteStructure,
  DEFAULT_PART,
  headingText,
  type PartRole,
  type PartSpec,
  readStructure,
  writeStructure,
} from '@/core/structure'

/**
 * A small panel with defaults good enough to ignore entirely.
 *
 * Options are worded in terms of what the reader is making rather than in
 * LaTeX's vocabulary — "Book" rather than "\documentclass{book}", "Chapters
 * start on a right-hand page" rather than "openright".
 */

export interface ConfigPanelProps {
  config: GalleyConfig
  onChange: (config: GalleyConfig) => void
  /** True when the metadata below came from the document's own frontmatter. */
  prefilled: boolean
  /**
   * The document itself: the Structure section reads and writes its
   * frontmatter.
   *
   * OPTIONAL, because a folder project has no single document to key
   * structure against — a part is a FILE there, and its role is set in the
   * sidebar beside the file it belongs to. Omitting these hides the section
   * entirely rather than leaving it inert, which is what the queued redesign
   * in `issues/open.md` was waiting to know.
   */
  source?: string
  onSourceChange?: (source: string) => void
}

const CHARACTERS: { value: DocumentCharacter; label: string; hint: string }[] = [
  { value: 'article', label: 'Article', hint: 'Top-level headings become sections' },
  { value: 'report', label: 'Report', hint: 'Top-level headings become chapters' },
  { value: 'book', label: 'Book', hint: 'Chapters, two-sided, printed-book margins' },
]

/**
 * What `\setcounter{tocdepth}` means depends on the document character:
 * `\chapter` is level 0 in Book and Report, but Article has no chapter, so
 * `\section` is level 1 there. The same number therefore means something
 * different in each — and `tocdepth: 0` in an Article lists nothing at all,
 * an empty contents page. So each character gets its own menu, worded in
 * what actually appears rather than in the shared number, and an Article's
 * menu simply never offers the value that would produce that trap.
 */
const CHAPTER_TOC_DEPTHS: { value: number; label: string }[] = [
  { value: 0, label: 'Chapters only' },
  { value: 1, label: 'Chapters and sections' },
  { value: 2, label: 'Chapters, sections and subsections' },
]

const ARTICLE_TOC_DEPTHS: { value: number; label: string }[] = [
  { value: 1, label: 'Sections only' },
  { value: 2, label: 'Sections and subsections' },
  { value: 3, label: 'Sections, subsections and sub-subsections' },
]

/**
 * One-click setup for an Amazon KDP paperback.
 *
 * The inside margin KDP requires depends on the finished page count, which is
 * not knowable until the document has been typeset — so this asks for the
 * expected length rather than guessing, states what it applied, and the render
 * checks the assumption against the real page count afterwards.
 */
function KdpPreset({
  config,
  onChange,
}: {
  config: GalleyConfig
  onChange: (config: GalleyConfig) => void
}) {
  const [pages, setPages] = useState<number>(GUTTER_BANDS[0].maxPages)

  const apply = (maxPages: number) => {
    setPages(maxPages)
    const preset = presetFor('book')
    onChange({
      ...preset,
      metadata: config.metadata,
      paper: config.paper.kind === 'named' ? config.paper : preset.paper,
      margins: kdpMargins(maxPages),
      twoSided: true,
      printTarget: 'kdp',
    })
  }

  const active = config.printTarget === 'kdp'

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="font-medium text-sm">Print for Amazon KDP</h3>
        <p className="mt-0.5 text-muted-foreground text-xs">
          Applies KDP's margin minimums. The inside margin depends on how long the
          finished book is, so pick the range you expect — galley re-checks it against the
          real page count once you render.
        </p>
      </div>

      <Field label="Expected length">
        <Select value={String(pages)} onValueChange={(v) => apply(Number(v))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GUTTER_BANDS.map((band, i) => {
              const from = i === 0 ? 24 : GUTTER_BANDS[i - 1].maxPages + 1
              return (
                <SelectItem key={band.maxPages} value={String(band.maxPages)}>
                  {from}–{band.maxPages} pages · {band.inches} in inside margin
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </Field>

      <Button
        variant={active ? 'secondary' : 'outline'}
        size="sm"
        onClick={() => apply(pages)}
      >
        {active ? 'Re-apply KDP setup' : 'Set up for KDP'}
      </Button>
      {active && (
        <p className="text-muted-foreground text-xs">
          Margins set for up to {pages} pages. Rendering will check the real page count.
        </p>
      )}
    </div>
  )
}

/**
 * Inner and outer alternate on facing pages; on a one-sided document that
 * distinction is meaningless, so it is presented as plain left and right —
 * matching how `preamble.ts` writes the geometry.
 */
const MARGIN_EDGES = [
  { key: 'top', oneSided: 'Top', twoSided: 'Top' },
  { key: 'bottom', oneSided: 'Bottom', twoSided: 'Bottom' },
  { key: 'inner', oneSided: 'Left', twoSided: 'Inner' },
  { key: 'outer', oneSided: 'Right', twoSided: 'Outer' },
] as const satisfies readonly {
  key: keyof Omit<Margins, 'unit'>
  oneSided: string
  twoSided: string
}[]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  )
}

/**
 * A labelled switch. The label is associated by id rather than by wrapping,
 * because the Switch renders a button — labelable, but only via htmlFor.
 */
function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <Label htmlFor={id} className="grid gap-0.5 font-normal">
        <span>{label}</span>
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
      </Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

/**
 * Which part of the book each top-level heading is.
 *
 * Built from the document's own headings rather than from a list the reader
 * maintains, so the two cannot disagree. Every edit is written straight back
 * into the document's frontmatter: structure belongs to the manuscript, not to
 * this browser, and a manuscript sent to someone else must carry it.
 */
export function StructureSection({
  source,
  onSourceChange,
}: {
  source: string
  onSourceChange: (source: string) => void
}) {
  const { headings, structure, unreadable } = useMemo(() => {
    const tree = parseMarkdown(source)
    const data = frontmatterData(tree)
    // Delegated to `canWriteStructure` rather than a second "is this
    // readable" check of this component's own: a UI-side duplicate of
    // `writeStructure`'s guard is exactly what drifted last time (empty,
    // whitespace-only and comment-only frontmatter all read as unreadable
    // here while `writeStructure` happily wrote through them). Without this,
    // every heading would render at its default with nothing to explain why
    // a change does not stick — the "control that stops working without
    // saying so" class `structure.ts` names as a repeat bug.
    const unreadable = !canWriteStructure(source)
    const titles: string[] = []
    for (const node of tree.children) {
      if (node.type !== 'heading' || node.depth !== 1) continue
      const text = headingText(node)
      if (text && !titles.includes(text)) titles.push(text)
    }
    return { headings: titles, structure: readStructure(data), unreadable }
  }, [source])

  if (unreadable) {
    return (
      <p className="text-muted-foreground text-xs">
        galley cannot read this document's frontmatter, so structure cannot be saved here.
        Open source view to fix the block by hand, then come back to Structure.
      </p>
    )
  }

  if (headings.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Top-level headings appear here once the document has some. In a book each one is a
        chapter.
      </p>
    )
  }

  const update = (heading: string, patch: Partial<PartSpec>) => {
    const next = new Map(structure)
    const current = next.get(heading) ?? DEFAULT_PART
    const merged: PartSpec = { ...current, ...patch }

    // Changing the role re-applies that role's numbering default, but only
    // when the default actually differs between the old and new role. Both
    // front and back matter default to unnumbered, so `front -> back` must
    // NOT clobber a deliberate `numbered: true` (numbered appendices are
    // standard) even though `patch.numbered` is absent from this patch too.
    const defaultChanged =
      patch.role !== undefined && (patch.role === 'main') !== (current.role === 'main')
    if (defaultChanged && patch.numbered === undefined) {
      merged.numbered = patch.role === 'main'
    }
    if (!merged.tocTitle) delete merged.tocTitle

    const isDefault =
      merged.role === 'main' && merged.numbered && merged.listed && !merged.tocTitle
    if (isDefault) next.delete(heading)
    else next.set(heading, merged)

    onSourceChange(writeStructure(source, next))
  }

  return (
    <div className="grid gap-3">
      {headings.map((heading, index) => {
        const part = structure.get(heading) ?? DEFAULT_PART
        // Whitespace is invalid in an HTML id; the heading text is exactly
        // what can contain it, so an index-based id is used instead. Safe
        // here because `headings` is deduplicated and rendered in a stable
        // order for the lifetime of this list.
        const fieldId = `part-${index}`
        return (
          <div key={heading} className="grid gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-medium text-sm" title={heading}>
                {heading}
              </span>
              <Select
                value={part.role}
                onValueChange={(v) => update(heading, { role: v as PartRole })}
              >
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="front">Front matter</SelectItem>
                  <SelectItem value="main">Main matter</SelectItem>
                  <SelectItem value="back">Back matter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <ToggleRow
                id={`numbered-${fieldId}`}
                label="Numbered"
                checked={part.numbered}
                onChange={(v) => update(heading, { numbered: v })}
              />
              <ToggleRow
                id={`listed-${fieldId}`}
                label="In the contents"
                checked={part.listed}
                onChange={(v) => update(heading, { listed: v })}
              />
            </div>
            <Field label="Contents entry, if it should be shorter">
              <TocTitleInput
                storedValue={part.tocTitle ?? ''}
                placeholder={heading}
                onCommit={(tocTitle) => update(heading, { tocTitle })}
              />
            </Field>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The Contents-entry field. Writing on every keystroke does not work here:
 * the field is fully controlled off a value re-derived from the source, and
 * `resolvePart` trims on read, so a keystroke that produces a trailing space
 * round-trips to a value with the space gone, the DOM node resets, and the
 * next character lands where the space was. Typing "A Note" one keystroke at
 * a time used to produce "ANote" in the field AND in the manuscript.
 *
 * The fix holds the in-progress text in local state and commits to the
 * source only on blur or Enter, so mid-edit whitespace is never round-tripped
 * through `writeStructure` -> `readStructure` -> `resolvePart`'s trim.
 * `resolvePart` keeps trimming on read, which is correct for what ends up in
 * the manuscript's frontmatter; the bug was writing on every keystroke, not
 * the trim itself.
 *
 * This also happens to remove the per-keystroke `writeStructure` -> `setSource`
 * -> full LaTeX conversion -> editor reparse chain (Important 4): a role or
 * toggle change is still an immediate write (those are single discrete
 * actions, not typing), but text entry is now one write per field visit.
 *
 * Blur and Enter are not the only way this field loses focus. Dismissing the
 * Configure dialog with Escape never fires one: Radix's `DismissableLayer`
 * flips `open`, and `FocusScope` restores focus from a `setTimeout` scheduled
 * during effect cleanup — by which point this input is already detached from
 * the document, so no `focusout` can reach React's root. React synthesises no
 * blur at unmount either. So an unmount-time commit is a separate path, not a
 * consequence of the blur handler above; it is added as its own `useEffect`
 * cleanup below, reading through a ref rather than the `commit` closure
 * because a `[]`-deps effect's cleanup is the one captured at mount, and only
 * a ref stays current with later keystrokes without re-subscribing the effect
 * on every render (which would itself fire the cleanup — and therefore a
 * commit — on every keystroke). The `draft !== storedValue` guard, unchanged,
 * is what stops StrictMode's development-only mount -> unmount -> mount cycle
 * from producing a spurious write: on that first synthetic unmount `draft`
 * still equals `storedValue`, so there is nothing to commit.
 */
export function TocTitleInput({
  storedValue,
  placeholder,
  onCommit,
}: {
  storedValue: string
  placeholder: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(storedValue)
  // Re-seed local state when the stored value changes for a reason other than
  // this field's own editing — e.g. the heading's structure entry was reset
  // elsewhere, or a different document was loaded. Comparing against the
  // previous `storedValue` (rather than always re-seeding on render) is what
  // stops this from clobbering the very keystroke the field exists to accept.
  const lastStored = useRef(storedValue)
  if (lastStored.current !== storedValue) {
    lastStored.current = storedValue
    setDraft(storedValue)
  }

  // Always current, read only from places that cannot rely on a fresh render
  // closure: the unmount cleanup below fires from whatever closure was
  // captured on mount, so it has to reach the latest values through this
  // instead.
  const latest = useRef({ draft, storedValue, onCommit })
  latest.current = { draft, storedValue, onCommit }

  const commit = () => {
    // A trailing space is deliberate mid-sentence but not in a contents
    // entry — untrimmed, `writeStructure` quotes it into the frontmatter,
    // `resolvePart` trims it straight back out on read, `storedValue` never
    // changes to match, and the field is left permanently showing whitespace
    // the manuscript does not actually carry. Trimming here, at the one
    // place text leaves this field, keeps the two in step.
    if (draft !== storedValue) onCommit(draft.trim())
  }

  useEffect(() => {
    return () => {
      const current = latest.current
      if (current.draft !== current.storedValue) current.onCommit(current.draft.trim())
    }
  }, [])

  return (
    <Input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        commit()
      }}
    />
  )
}

export function ConfigPanel({
  config,
  onChange,
  prefilled,
  source,
  onSourceChange,
}: ConfigPanelProps) {
  const set = <K extends keyof GalleyConfig>(key: K, value: GalleyConfig[K]) =>
    onChange({ ...config, [key]: value })

  const setMeta = (key: keyof GalleyConfig['metadata'], value: string) =>
    onChange({ ...config, metadata: { ...config.metadata, [key]: value || undefined } })

  const setMargin = (key: keyof Omit<Margins, 'unit'>, raw: string) => {
    const value = Number(raw)
    // An empty or half-typed field must not write NaN into the geometry, which
    // would reach the .tex as a literal "NaNmm" and fail to compile.
    if (raw === '' || !Number.isFinite(value) || value < 0) return
    onChange({ ...config, margins: { ...config.margins, [key]: value } })
  }

  const chapters = usesChapters(config.character)
  const paperName = config.paper.kind === 'named' ? config.paper.name : 'a4'

  // Margins that leave no text block produce a document LaTeX cannot set, so
  // say so here rather than letting the render fail with a geometry error.
  const page = resolvePaper(config.paper)
  const m = config.margins
  const scale = page.unit === m.unit ? 1 : page.unit === 'mm' ? 25.4 : 1 / 25.4
  const marginProblem =
    m.inner + m.outer >= page.width * scale
      ? 'The side margins leave no room for text.'
      : m.top + m.bottom >= page.height * scale
        ? 'The top and bottom margins leave no room for text.'
        : null

  return (
    // min-w-0: a Select renders the chosen item's hint in its trigger, and a
    // long one would otherwise push its grid column past an even half.
    <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-8">
      <div className="grid min-w-0 content-start gap-5">
        <Field label="What are you making?">
          <Select
            value={config.character}
            onValueChange={(v) => {
              // Changing character re-applies its preset, then keeps the metadata
              // the reader (or their frontmatter) already supplied.
              const preset = presetFor(v as DocumentCharacter)
              onChange({ ...preset, metadata: config.metadata })
            }}
          >
            <SelectTrigger className="h-auto w-full py-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHARACTERS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <span className="flex flex-col items-start">
                    <span>{c.label}</span>
                    <span className="text-muted-foreground text-xs">{c.hint}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Separator />

        <Field label="Page size">
          <Select
            value={paperName}
            onValueChange={(v) => set('paper', { kind: 'named', name: v as PaperName })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAPER_SIZES).map(([key, size]) => (
                <SelectItem key={key} value={key}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={`Margins (${config.margins.unit})`}>
          <div className="grid grid-cols-4 gap-2">
            {MARGIN_EDGES.map((edge) => (
              <div key={edge.key} className="grid gap-1">
                <Label
                  htmlFor={`margin-${edge.key}`}
                  className="text-muted-foreground text-[0.7rem]"
                >
                  {config.twoSided ? edge.twoSided : edge.oneSided}
                </Label>
                <Input
                  id={`margin-${edge.key}`}
                  type="number"
                  min={0}
                  step={config.margins.unit === 'mm' ? 1 : 0.125}
                  value={config.margins[edge.key]}
                  onChange={(e) => setMargin(edge.key, e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
          {marginProblem ? (
            <p className="mt-1.5 text-destructive text-xs">{marginProblem}</p>
          ) : null}
        </Field>

        <Field label="Typeface">
          <Select
            value={config.typeface}
            onValueChange={(v) => set('typeface', v as TypefaceName)}
          >
            <SelectTrigger className="h-auto w-full py-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPEFACE_NAMES.map((name) => (
                <SelectItem key={name} value={name}>
                  <span className="flex flex-col items-start">
                    {/* Set in the face itself, so the choice is visible rather
                        than merely named. */}
                    <span
                      className="text-base"
                      style={{ fontFamily: `"${previewFamily(name)}", serif` }}
                    >
                      {TYPEFACES[name].label}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {TYPEFACES[name].hint}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-muted-foreground text-xs">
            Mathematics is always set in Computer Modern.
          </p>
        </Field>

        <div className="grid min-w-0 grid-cols-2 gap-3">
          <Field label="Text size">
            <Select
              value={String(config.fontSize)}
              onValueChange={(v) => set('fontSize', Number(v) as FontSize)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 11, 12].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} pt
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Line spacing">
            <Select
              value={config.lineSpacing}
              onValueChange={(v) => set('lineSpacing', v as LineSpacing)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="onehalf">One and a half</SelectItem>
                <SelectItem value="double">Double</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Separator />

        <ToggleRow
          id="two-sided"
          label="Two-sided"
          hint="Margins alternate for binding"
          checked={config.twoSided}
          onChange={(v) => set('twoSided', v)}
        />

        <ToggleRow
          id="link-footnotes"
          label="Footnote link addresses"
          hint="Needed on paper, noise on screen"
          checked={config.links.footnoteUrls}
          onChange={(v) => set('links', { ...config.links, footnoteUrls: v })}
        />

        <ToggleRow
          id="toc"
          label="Table of contents"
          hint="Printed just after the title page"
          checked={config.toc.include}
          onChange={(v) => set('toc', { ...config.toc, include: v })}
        />

        <Field label="Contents lists">
          <Select
            value={String(config.toc.depth)}
            disabled={!config.toc.include}
            onValueChange={(v) => set('toc', { ...config.toc, depth: Number(v) })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(chapters ? CHAPTER_TOC_DEPTHS : ARTICLE_TOC_DEPTHS).map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!config.toc.include && (
            <p className="mt-1.5 text-muted-foreground text-xs">
              Needs Table of contents turned on above
            </p>
          )}
        </Field>

        <ToggleRow
          id="number-sections"
          label="Number sections"
          hint="Turn off to title sections without numbering them"
          checked={config.sections.numbered}
          onChange={(v) => set('sections', { ...config.sections, numbered: v })}
        />

        {chapters && (
          <ToggleRow
            id="chapter-page"
            label="Chapters start a new page"
            hint="Turn off to let chapters run on"
            checked={config.chapters.startOnNewPage}
            onChange={(v) =>
              set('chapters', {
                ...config.chapters,
                startOnNewPage: v,
                // A chapter that does not start a page cannot start a right-hand
                // one, so the dependent option cannot be left standing.
                forceRecto: v && config.chapters.forceRecto,
              })
            }
          />
        )}

        {chapters && (
          <ToggleRow
            id="force-recto"
            label="Chapters open on the right"
            hint={
              !config.chapters.startOnNewPage
                ? 'Needs chapters to start a new page'
                : config.twoSided
                  ? 'Recto pages, as in a printed book'
                  : 'Only meaningful for two-sided documents'
            }
            disabled={!config.twoSided || !config.chapters.startOnNewPage}
            checked={config.chapters.forceRecto}
            onChange={(v) => set('chapters', { ...config.chapters, forceRecto: v })}
          />
        )}
      </div>

      <div className="grid min-w-0 content-start gap-3">
        <KdpPreset config={config} onChange={onChange} />

        {source !== undefined && onSourceChange !== undefined && (
          <>
            <Separator />

            <Field label="Structure">
              <StructureSection source={source} onSourceChange={onSourceChange} />
            </Field>
          </>
        )}

        <Separator />

        <div className="flex items-baseline justify-between">
          <h3 className="font-medium text-sm">Title page</h3>
          {prefilled && (
            <span className="text-muted-foreground text-xs">from your frontmatter</span>
          )}
        </div>
        {(
          [
            ['title', 'Title'],
            ['subtitle', 'Subtitle'],
            ['author', 'Author'],
            ['date', 'Date'],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <Textarea
              rows={1}
              value={config.metadata[key] ?? ''}
              onChange={(e) => setMeta(key, e.target.value)}
              className="min-h-0 resize-none py-1.5"
            />
          </Field>
        ))}
      </div>
    </div>
  )
}
