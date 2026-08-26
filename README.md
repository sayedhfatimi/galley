<p align="center">
  <img src="public/logo.png" alt="galley" width="120" />
</p>

<h1 align="center">galley</h1>

<p align="center">
  Markdown in, a typeset PDF <strong>and</strong> the LaTeX that made it out.
</p>

Paste a manuscript, choose what you are making, and get a properly typeset PDF — set by a
real TeX engine running **entirely inside your browser tab**. No account, no upload, no
server. You also get the `.tex` source, and it is not a souvenir: it is an ordinary LaTeX
document you can compile yourself, hand to a typesetter, or edit for the rest of its life.

Most Markdown-to-PDF tools render your document as a web page and print it. galley does
not. It walks the Markdown structure directly into LaTeX, so what comes out reads like a
book rather than a printed webpage.

```
your Markdown ──parse──► document structure ──► LaTeX source ──► source download
                                                     │                (.tex, or .zip
                                                     │                 with your figures)
                                                     └──► XeTeX ×2 ──► dvipdfmx ──► PDF
                                                          (in a Web Worker, on your machine)
```

## Nothing leaves your device

This is the part worth being precise about, because it is unusual.

The TeX engine is compiled to WebAssembly and runs in a Web Worker in your tab. Your
document is never transmitted anywhere, because there is nowhere for it to go — galley has
no backend. The only network requests it makes are for its own static files (the engine and
the fonts), served from its own origin, and they are cached after the first render.

Your work is saved in your browser's local storage so that closing the tab and coming back
does not lose it. That copy is on your machine and only your machine. **Clear the document**
in the toolbar removes it.

Two consequences worth knowing. The first render downloads the engine and the TeX Live
files your document needs. That is about 26 MB of engine and format before anything else,
plus whatever fonts and packages your document actually touches: measured, a plain article
comes to roughly 35 MB and a book with maths, tables and a non-default typeface to roughly
38 MB. Only the typeface you choose is fetched, so the others cost you nothing. It happens
once and is then cached; later renders fetch nothing. And everything is bounded by your own
CPU rather than by a queue, with a 60-second ceiling on any single compile.

## Quick start

Use the hosted version, or run it yourself:

```bash
bun install
bun run dev      # http://localhost:5173
```

There is nothing to configure and no key to obtain. `bun run build` produces a static site
that can be served from anywhere.

## How your Markdown becomes a document

**This is the one thing worth reading before you start.** The same Markdown produces
different structures depending on what you tell galley you are making.

| Markdown | Article | Report / Book |
|---|---|---|
| `#` | Section | **Chapter** |
| `##` | Subsection | Section |
| `###` | Sub-subsection | Subsection |
| `####` | Paragraph heading | Sub-subsection |
| `#####`, `######` | deeper, clamping at the smallest level | |

So in a book, **`#` is a chapter**. If you are used to writing `#` as the document's title
and `##` for chapters, your chapters will come out one level too deep.

**No heading is ever consumed as the title.** The title page comes only from frontmatter or
the Document setup dialog, so a `#` at the top of your file stays a chapter and does not
silently disappear into the title block. Delete the title heading from the body if you have
one — set the title in frontmatter instead.

### Frontmatter

If your file starts with a YAML block, galley lifts it into the title page and does not
print it. Keys are matched forgivingly, and anything it does not recognise is ignored
rather than treated as an error:

```yaml
---
title: The Long Now
subtitle: On time, risk, and certainty     # or: sub_title, description
author: Ada Lovelace                       # or: authors, by — a list becomes "A, B"
date: 2026-08-06                           # or: created, published
---
```

A note exported from Obsidian or a similar app should therefore produce a correctly titled
document the moment you paste it, without opening the configuration at all.

## What galley supports

| Construct | Notes |
|---|---|
| Headings | All six levels, mapped as above |
| **Bold**, *italic*, ~~strikethrough~~, `inline code` | |
| Lists | Bulleted, numbered, nested, and task lists with `- [ ]` / `- [x]` |
| Tables | GFM pipe tables, including column alignment |
| Block quotes | Set as quotations, not as boxes |
| Code blocks | Fenced, with long lines wrapped rather than run off the page |
| Links | The URL is footnoted so it survives printing — switchable off for screen reading |
| Footnotes | `[^ref]` and its definition |
| Reference links | `[text][ref]` — resolved to ordinary links |
| Maths | Inline `$…$` and display `$$…$$` — see below |
| Horizontal rules | |
| Images | PNG, JPEG, PDF from your machine. A lone image becomes a captioned figure |
| Unicode | Accented names and curly quotes typeset natively, no escaping required |

Special characters that mean something to LaTeX — `# $ % & _ { } ~ ^ \` — are escaped for
you. Write `100%` and you get `100%`, not a broken document.

### Maths

Maths passes through **untouched**. There is no allow-list and no sanitiser, so the full
LaTeX maths vocabulary is available: `\int`, `\sum`, `\frac`, `\sqrt`, matrices,
`\mathbb`, `\mathcal`, `\mathbf`, `\mathsf`, aligned environments, and the rest. `amsmath`
and `amssymb` are loaded.

```markdown
Inline $a^2 + b^2 = c^2$ in a sentence, and a display equation:

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$
```

Permitting anything is safe here precisely because compilation happens in your own tab: a
runaway expression costs you a spinner and a 60-second timeout, not a shared server.

In the editor, maths is typeset live. Put the cursor inside an expression to see and edit
its raw TeX; move away and it renders. The **Σ** button in the toolbar opens a searchable
catalogue of 102 symbols across Greek, operators, relations, logic, structures and
functions, if you would rather not remember the command.

### Figures

Images come from files on your machine. There are four ways in, and they all do the same
thing: the picture button in the toolbar, the `/image` command, dropping a file onto the
editor, or pasting one from the clipboard.

**PNG, JPEG and PDF.** A PDF figure is worth knowing about — it stays vector, so a chart or
a diagram exported from almost any tool prints crisply at any size. Anything else is
refused by name rather than silently producing a broken document.

**An image on its own line becomes a figure**, centred, with its alt text as the caption:

```markdown
![The growth of the archive, 1997–2026](archive-growth.png)
```

An image used *inside* a sentence stays inline instead, with no caption and no float,
because a figure opened mid-paragraph would reorder the prose around it. Figures are
capped at the width of the text block, so an oversized one is scaled rather than running
into the margin.

**A referenced image is never fetched.** If your Markdown points at
`https://example.com/chart.png`, galley will not download it — reaching the network on
behalf of a document you merely pasted in is the one thing running everything locally
exists to prevent. The gap is marked in the output and a notice tells you which reference
it was. The same is true in the editor: an attached file previews in place, a URL keeps a
placeholder. A PDF also keeps its placeholder, since no browser can draw one in an image
element, but it typesets normally.

**Your files stay in your browser**, alongside the document, so closing the tab and coming
back does not lose them. Clearing the document clears them too.

A document that names an image you have not added still renders — the figure is marked as
missing rather than stopping the whole document, which is what a manuscript written
elsewhere and pasted in will do every time.

## The editor

The writing surface is a rich editor, but **Markdown is always the real document** — every
edit is serialised straight back to it.

- **Source view** — the `<>` button swaps the rich editor for the raw Markdown. Use it to
  paste, to check exactly what galley is working from, or if you simply prefer writing in
  Markdown.
- **Slash commands** — type `/` for headings, lists, quotes, code blocks, tables, links,
  maths and dividers.
- **Table of contents** — the list button opens an overlay built from your headings,
  indented by depth. Click any entry to jump to it.
- **Word count** — bottom right, with a reading estimate.
- **Em and en dashes** — the `—` and `–` buttons, since a keyboard has neither. Typing
  `---` and `--` also works.
- **Open a file** — the upload button, or just drag a `.md` file onto the editor.
- **Add a figure** — the picture button in the toolbar, the `/image` command, or just
  drop or paste one in (PNG, JPEG, PDF). It is kept in this browser, previewed in place,
  and set as a captioned figure using the alt text. A PDF figure keeps a placeholder in
  the editor, since no browser can draw one in place, but it typesets normally.
- **Help** — the `?` button lists every shortcut and slash command.
- **Clear the document** — the bin, far right and deliberately separated from the
  formatting tools. It asks first.

## Document setup

Everything below is in the **Configure** dialog. The defaults are chosen so that a first
render looks right without opening it at all.

**What are you making** — Article, Report, or Book. This picks the heading mapping above
and applies a sensible starting point for everything else; a Book gets a real trim size,
two-sided margins, a table of contents and chapters opening on the right.

**Page size** — A4, US Letter, A5, B5, Digest (5.5 × 8.5 in), US Trade (6 × 9 in),
Royal (156 × 234 mm), Demy (138 × 216 mm).

**Typeface** — Latin Modern, Pagella (Palatino), Termes (Times), Schola (Century
Schoolbook) or Bonum (Bookman). Each is a complete serif, sans and mono pairing, previewed
in its own face in the menu. Only the one you choose is downloaded. Mathematics stays
Computer Modern whichever you pick.

**Margins** — four fields, labelled Inner and Outer on a two-sided document and Left and
Right otherwise, matching how the geometry is written into the `.tex`.

**Text size** — 10, 11 or 12 pt. **Line spacing** — single, one and a half, or double.

**Two-sided** — margins alternate for binding, and running heads differ on facing pages.

**Table of contents** — generated from your headings.

**Chapters start a new page** — on by default for books and reports. Turn it off and
chapters run on instead, like sections. *(In LaTeX a chapter always breaks the page; galley
redefines the heading to remove that.)*

**Chapters open on the right** — recto pages, as in a printed book, inserting a blank verso
where needed. Requires the option above.

**Title page** — title, subtitle, author, date. Pre-filled from your frontmatter.

## Printing for Amazon KDP

**Print for Amazon KDP** in the setup dialog applies KDP's paperback margin minimums in one
click.

The complication is that **the inside (gutter) margin KDP requires depends on the finished
page count**, which nobody can know until the document has been typeset. galley does not
guess: you choose the length you expect, it states the assumption, and after each render it
checks that assumption against the *real* page count and tells you if it no longer holds.

| Finished pages | Inside margin |
|---|---|
| 24–150 | 0.375 in |
| 151–300 | 0.5 in |
| 301–500 | 0.625 in |
| 501–700 | 0.75 in |
| 701–828 | 0.875 in |

Outside, top and bottom must be at least 0.25 in; galley uses 0.5 in, because the minimum
is what the printer accepts rather than what reads well. Combine it with a KDP trim size —
A5, Digest, US Trade and US Letter are all KDP sizes.

Bleed is deliberately not offered. It only matters when artwork runs past the edge of the
page, and every figure galley sets is placed inside the text block — nothing it produces
reaches the trim edge.

A clean render is not a promise that KDP will accept your upload — it means the stated
minimums are met.

## What you get out

**Download .pdf** — the finished document.

**Download the source** — the LaTeX that produced it, always available, *including when the
render fails*. That is deliberate: a failed compile must not leave you with nothing. The
preamble is organised and commented for a human reader, so changing the geometry or fonts
by hand is straightforward.

A document with figures comes down as a `.zip` holding the `.tex` and the images it names,
because a `.tex` on its own would reference files you do not have. One without figures
stays a plain `.tex`.

The `.tex` is standard LaTeX and compiles with any XeLaTeX installation:

```bash
xelatex your-document.tex
```

From a zip, unpack it first and compile in the same directory — the images sit beside the
`.tex` under the names it references, so nothing needs rewriting:

```bash
unzip your-document.zip && xelatex your-document.tex
```

## Limits and known gaps

- **Only files you attach become figures.** An image the Markdown points at by URL is
  never fetched — galley does not reach the network on behalf of a document you pasted —
  so it is marked in the output instead. PNG, JPEG and PDF are supported.
- **Raw HTML is not typeset** — it comes through as literal text, with a notice.
- **Accented Greek does not render.** Choosing a TeX Gyre typeface gets you the Greek
  letters, Α–Ω and α–ω, which Latin Modern lacks entirely. None of the bundled faces
  carry a precomposed accented form, so `Ωμέγα` still loses its `έ` — and since monotonic
  Greek is accented on nearly every word, galley cannot set Greek *prose*. Greek inside
  maths is unaffected.
- **Mathematics is always Computer Modern**, whichever typeface you choose.
- **A mixed list looks wrong in the editor.** A list mixing plain items and task items
  shows every item as a checkbox. The LaTeX and the PDF are correct; only the editor
  display is affected.
- Very large documents are bounded by the 60-second compile ceiling.

## When a render fails

You get the plain-language cause, the full typesetter log behind **Show the typesetter
log**, and the `.tex` download. If a document typesets but will not become a PDF, the log
is the place to look — it names the file or font involved.

## Development

```bash
bun install
bun run dev          # dev server
bun run check        # Biome lint + format
bun run typecheck    # tsc
bun run test         # Vitest
bun run build        # static production build
```

Run all four checks before committing.

```
src/core/       pure — no DOM, no React; runs identically in Node, the main thread and the worker
  markdown/     Markdown → structure, and the bridge between it and the editor
  latex/        structure → LaTeX: escaping, preamble, serialisation
  fonts.ts      the typeface registry — the one place face filenames are written down
  images.ts     which images can be typeset, and the single sanitised name for each
  zip.ts        the source-plus-figures archive
  kdp.ts        print requirements and the post-render compliance check
src/ui/         React: the shell, the configuration dialog, the editor
  lib/          the store, the compile lifecycle, and the IndexedDB figure store
src/workers/    the sole owner of the TeX engines
public/texlive/ the bundled TeX Live file set
public/engines/ the vendored WASM engines, with every modification documented in PATCHES.md
scripts/        maintainer-only builders — see scripts/README.md
```

`src/core` being DOM-free is load-bearing: the conversion is unit-tested in Node, and the
same code runs in the worker.

The TeX Live tree is a **closed set** — because you cannot inject a preamble or request
packages, the reachable files are finite and can be bundled. The typeface menu is a fixed
list for the same reason: five bundled pairings keep the set enumerable, where an arbitrary
user-supplied font would not. `scripts/build-texlive-bundle.ts` regenerates the tree and is
needed if the preamble grows a package or the registry grows a face; it also compiles a
probe document per typeface, so a face that cannot be loaded fails the build rather than a
reader's browser.

`swiftlatexxetex.fmt` is a separate artefact that this script cannot produce — a format
file must be built by the engine that reads it. `scripts/build-format.ts` does that, and
`scripts/README.md` explains why it runs in a browser and why it does not install its own
output.

**Stack:** Vite, React, TypeScript, Tailwind, shadcn/ui, TipTap, Zustand, MathJax, Vitest,
Biome, and SwiftLaTeX's XeTeX + dvipdfmx compiled to WebAssembly.

## Licence

**AGPL-3.0-or-later**, because the WebAssembly TeX engines are. The vendored engine glue in
`public/engines/` is modified from SwiftLaTeX; the modifications are documented in
`public/engines/PATCHES.md`.
