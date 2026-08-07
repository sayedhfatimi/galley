import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
  PAPER_SIZES,
  type PaperName,
  presetFor,
  usesChapters,
} from '@/core/config'
import { GUTTER_BANDS, kdpMargins } from '@/core/kdp'

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
}

const CHARACTERS: { value: DocumentCharacter; label: string; hint: string }[] = [
  { value: 'article', label: 'Article', hint: 'Top-level headings become sections' },
  { value: 'report', label: 'Report', hint: 'Top-level headings become chapters' },
  { value: 'book', label: 'Book', hint: 'Chapters, two-sided, printed-book margins' },
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
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <Label htmlFor={id} className="grid gap-0.5 font-normal">
        <span>{label}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

export function ConfigPanel({ config, onChange, prefilled }: ConfigPanelProps) {
  const set = <K extends keyof GalleyConfig>(key: K, value: GalleyConfig[K]) =>
    onChange({ ...config, [key]: value })

  const setMeta = (key: keyof GalleyConfig['metadata'], value: string) =>
    onChange({ ...config, metadata: { ...config.metadata, [key]: value || undefined } })

  const chapters = usesChapters(config.character)
  const paperName = config.paper.kind === 'named' ? config.paper.name : 'a4'

  return (
    <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-8">
      <div className="grid content-start gap-5">
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

        <div className="grid grid-cols-2 gap-3">
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
          id="toc"
          label="Table of contents"
          hint={`Listed to depth ${config.toc.depth}`}
          checked={config.toc.include}
          onChange={(v) => set('toc', { ...config.toc, include: v })}
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

      <div className="grid content-start gap-3">
        <KdpPreset config={config} onChange={onChange} />

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
