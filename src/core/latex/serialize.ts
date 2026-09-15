/**
 * mdast → LaTeX body. Pure — no DOM, no React.
 *
 * A switch over mdast node types, each case returning a string, with block
 * nodes joined by blank lines so the output stays readable. The .tex is a
 * deliverable in its own right, so it is never minified or run together.
 */

import type {
  Blockquote,
  Code,
  Definition,
  FootnoteDefinition,
  Heading,
  Image,
  List,
  ListItem,
  Nodes,
  Paragraph,
  Root,
  RootContent,
  Table,
} from 'mdast'
import { type DocumentCharacter, type GalleyConfig, usesChapters } from '../config'
import { type Diagnostic, DiagnosticCollector } from '../diagnostics'
import { findScriptGaps, typefaceOrDefault, typefacesWithGreek } from '../fonts'
import { classifyImage, SUPPORTED_IMAGE_LIST } from '../images'
import { frontmatterData } from '../markdown/frontmatter'
import {
  DEFAULT_PART,
  headingText,
  type PartRole,
  type PartSpec,
  readStructure,
  roleRank,
} from '../structure'
import { escapeText, escapeUrl, isVerbatimSafe } from './escape'

export interface SerializeResult {
  body: string
  diagnostics: Diagnostic[]
  /**
   * Sanitised names of every image the document actually draws, so the caller
   * can supply exactly those bytes to the engine rather than the whole store.
   */
  images: string[]
  /**
   * True when the body emitted its own \mainmatter/\backmatter. The caller must
   * then NOT emit \mainmatter itself, or the divisions would open twice.
   */
  ownsMatterDivisions: boolean
}

/**
 * The image in a paragraph that contains nothing else — a figure written on
 * its own line, which is how a figure is written in Markdown. Whitespace-only
 * text siblings are tolerated, because remark keeps them.
 */
function loneImage(node: Paragraph): Image | null {
  const meaningful = node.children.filter(
    (c) => !(c.type === 'text' && c.value.trim() === ''),
  )
  const [only] = meaningful
  return meaningful.length === 1 && only.type === 'image' ? only : null
}

/**
 * Heading depth → sectioning command.
 *
 * This is the configurable mapping the spec calls a product decision: in a book
 * a top-level heading is a chapter, in an article it is a section, and
 * everything below shifts accordingly. Depths past the end clamp to the last
 * available level rather than vanishing.
 */
const CHAPTER_LEVELS = [
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
]
const SECTION_LEVELS = [
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
  'subparagraph',
]

function sectioningCommand(depth: number, character: DocumentCharacter): string {
  const levels = usesChapters(character) ? CHAPTER_LEVELS : SECTION_LEVELS
  return levels[Math.min(depth, levels.length) - 1] ?? levels[levels.length - 1]
}

/** GFM column alignment → a tabularx column specification. */
function columnSpec(align: Table['align'], index: number): string {
  switch (align?.[index]) {
    case 'center':
      return '>{\\centering\\arraybackslash}X'
    case 'right':
      return '>{\\raggedleft\\arraybackslash}X'
    default:
      // Ragged right rather than justified: columns are narrow, and justified
      // text in a narrow measure produces rivers.
      return '>{\\raggedright\\arraybackslash}X'
  }
}

class Serializer {
  readonly #config: GalleyConfig
  readonly #diagnostics = new DiagnosticCollector()
  readonly #definitions = new Map<string, Definition>()
  readonly #footnotes = new Map<string, FootnoteDefinition>()
  readonly #images = new Set<string>()
  /**
   * Names the caller actually holds bytes for, or undefined when it does not
   * know. Undefined means "assume present" — the build script and most tests
   * have no store to ask.
   */
  readonly #available: ReadonlySet<string> | undefined
  #structure: Map<string, PartSpec> = new Map()
  /**
   * Root-level depth-1 headings, by node identity. `#blockquote` calls
   * `#blocks` and `#listItem` calls `#block`, so a quoted or bulleted heading
   * (Obsidian callouts are blockquotes) also reaches `#heading` at depth 1 —
   * this is what lets `#heading` tell a real part from one of those.
   */
  #parts = new Set<Heading>()
  /** Highest matter rank reached, to detect parts written out of order. */
  #highestRank = -1
  /** The division currently open, so a transition is emitted only on change. */
  #openRole: PartRole | null = null
  #ownsMatterDivisions = false
  /**
   * Heading text shared by two or more root headings (see the comment where
   * this is populated). `#matterTransition` uses it to suppress a
   * `structure-order` notice on a duplicated title: the role it would name
   * came from whichever PartSpec matched by text, not from the writer's
   * intent for THIS occurrence, so the notice would be actively misleading —
   * `structure-duplicate-heading` already names the real cause.
   */
  #duplicatedTitles: ReadonlySet<string> = new Set()

  constructor(config: GalleyConfig, available?: ReadonlySet<string>) {
    this.#config = config
    this.#available = available
  }

  run(tree: Root): SerializeResult {
    this.#collectDefinitions(tree)
    this.#prepareStructure(tree)
    const body = this.#blocks(tree.children)
    return {
      body,
      diagnostics: this.#diagnostics.list(),
      images: [...this.#images],
      ownsMatterDivisions: this.#ownsMatterDivisions,
    }
  }

  /**
   * Read the structure block and check it against the headings that exist.
   *
   * A pre-pass rather than a check during the walk, because "this entry matches
   * nothing" is only knowable once every heading has been seen.
   */
  #prepareStructure(tree: Root): void {
    // Collected unconditionally — not just when a `structure:` block exists —
    // because this set is also what `#heading` uses to decide whether a
    // depth-1 node is a part at all. See the field comment.
    for (const node of tree.children) {
      if (node.type === 'heading' && node.depth === 1) this.#parts.add(node)
    }

    this.#structure = readStructure(frontmatterData(tree))
    if (this.#structure.size === 0) return

    const titles = new Set<string>()
    // Two root headings with identical text share one PartSpec, because parts
    // are keyed by text (see structure.ts). That is invisible when both are
    // plain chapters, but once EITHER is named in `structure:` its role,
    // numbering and listing apply to both headings, silently, and can walk
    // the matter state machine somewhere the writer never intended. Flagged
    // here rather than left for the reader to notice in the contents page.
    const duplicated = new Set<string>()
    for (const node of this.#parts) {
      const title = headingText(node)
      if (titles.has(title)) duplicated.add(title)
      titles.add(title)
    }
    for (const title of duplicated) {
      this.#diagnostics.add(
        'structure-duplicate-heading',
        'Two chapters share this title, and one setting governs every heading with the same text. Give one of them a different title to set them separately.',
        title,
      )
    }
    this.#duplicatedTitles = duplicated

    for (const [key, spec] of this.#structure) {
      if (!titles.has(key)) {
        this.#diagnostics.add(
          'structure-unmatched',
          'A part named in the document setup no longer matches any heading, so it was set as main matter. Renaming a heading loses its setting.',
          key,
        )
        continue
      }
      // Verified at book.cls:361-362: an unstarred \chapter inside \frontmatter
      // calls \addcontentsline itself, unconditionally. There is no way to keep
      // a numbered chapter out of the contents, so accepting the setting would
      // be an inert control — silently doing nothing rather than saying so.
      // Worded as "heading" rather than "chapter": the same sectioning-depth
      // mapping applies in Article and Report, where a part is a \section, not
      // a \chapter.
      if (spec.numbered && !spec.listed) {
        this.#diagnostics.add(
          'structure-unlistable',
          'A numbered heading always appears in the contents. To leave it out, make the heading unnumbered too.',
          key,
        )
      }
    }

    // Only entries that actually matched a heading can open a division — one
    // `structure-unmatched` has just reported does nothing, so counting it
    // here would make a document with no matching parts believe it owns its
    // own \mainmatter/\backmatter and then never emit either.
    const divided = [...this.#structure].some(
      ([key, spec]) => titles.has(key) && spec.role !== 'main',
    )
    if (!divided) return

    if (this.#config.character === 'book') {
      this.#ownsMatterDivisions = true
      return
    }

    // \frontmatter, \mainmatter and \backmatter are book-class commands. Saying
    // nothing here would be an inert control: the reader sets front matter, the
    // document class discards it, and nothing explains why.
    this.#diagnostics.add(
      'structure-ignored',
      'Front and back matter exist only in a Book. The parts were set unnumbered as asked, but the page numbering does not restart.',
      this.#config.character,
    )
  }

  /** The part settings for a top-level heading. */
  #partFor(node: Heading): PartSpec {
    return this.#structure.get(headingText(node)) ?? DEFAULT_PART
  }

  /** Link and footnote definitions may appear anywhere, so gather them first. */
  #collectDefinitions(tree: Root): void {
    const visit = (node: Nodes): void => {
      if (node.type === 'definition') this.#definitions.set(node.identifier, node)
      if (node.type === 'footnoteDefinition') this.#footnotes.set(node.identifier, node)
      if ('children' in node) for (const child of node.children) visit(child as Nodes)
    }
    visit(tree)
  }

  // ---- block level ----

  #blocks(nodes: readonly RootContent[]): string {
    return nodes
      .map((node) => this.#block(node))
      .filter((s) => s.length > 0)
      .join('\n\n')
  }

  #block(node: RootContent): string {
    switch (node.type) {
      case 'heading':
        return this.#heading(node)
      case 'paragraph': {
        // A paragraph that is nothing but an image is a FIGURE, and a figure is
        // a block. mdast has no block-level image node — an image is always
        // phrasing content inside a paragraph — so the distinction has to be
        // drawn here rather than in the inline dispatch, which cannot legally
        // open a float in the middle of a text flow.
        const only = loneImage(node as Paragraph)
        if (only) return this.#figure(only.alt ?? '', only.url)
        return this.#inline((node as Paragraph).children)
      }
      case 'list':
        return this.#list(node)
      case 'blockquote':
        return this.#blockquote(node)
      case 'code':
        return this.#code(node)
      case 'table':
        return this.#table(node)
      case 'thematicBreak':
        return '\\begin{center}\\rule{0.5\\linewidth}{0.4pt}\\end{center}'
      case 'math':
        // Display maths passes through untouched. Bounded by the compile
        // timeout rather than by an allow-list — it runs on the reader's own CPU.
        return `\\[\n${node.value}\n\\]`
      case 'html':
        this.#diagnostics.add(
          'raw-html',
          'HTML in the source cannot be typeset, so it appears as literal text.',
          node.value.slice(0, 80),
        )
        return escapeText(node.value)
      case 'yaml':
      case 'definition':
      case 'footnoteDefinition':
        return '' // consumed elsewhere
      default:
        return this.#unsupportedBlock(node)
    }
  }

  #unsupportedBlock(node: RootContent): string {
    this.#diagnostics.add(
      'unsupported-construct',
      'Part of the source had no typeset equivalent and appears as plain text.',
      node.type,
    )
    return 'children' in node ? this.#inline(node.children as RootContent[]) : ''
  }

  #heading(node: Heading): string {
    const command = sectioningCommand(node.depth, this.#config.character)
    const text = this.#inline(node.children)

    // Only a ROOT-level heading is a part. `#blockquote` calls `#blocks` and
    // `#listItem` calls `#block`, so a heading quoted or bulleted also arrives
    // here at depth 1 — `#parts` (built in `#prepareStructure`, by node
    // identity) is what tells the two apart. Anything not in that set is an
    // ordinary sectioning command: no part lookup, no matter transition, no
    // contents entry of its own. Sections are numbered or not as a whole
    // document via secnumdepth in the preamble, not starred here — see Fix 7.
    if (!this.#parts.has(node)) return `\\${command}{${text}}`

    const part = this.#partFor(node)
    const title = headingText(node)
    const transition = this.#matterTransition(part.role, title)

    if (part.numbered) {
      // book.cls:359-360: \chapter's optional argument is exactly the
      // short-title mechanism, so a numbered part with a tocTitle gets a
      // short contents entry for free. Without one this is the plain form,
      // byte-for-byte what v2.0.0 produced.
      //
      // The optional argument is wrapped in its own braces — [{...}] — which
      // is the standard LaTeX guard: \@chapter's optional-argument scanner
      // reads up to the first BRACE-LEVEL ']', so an unguarded short title
      // containing ']' (escapeText deliberately leaves ']' unescaped — see
      // escape.ts) would close the argument early and spill the rest of the
      // short title, and the chapter title after it, into the document as
      // running text. The extra grouping is inert for a plain title.
      const short = part.tocTitle ? `[{${escapeText(part.tocTitle)}}]` : ''
      return `${transition}\\${command}${short}{${text}}`
    }

    // A starred command writes no contents entry, so a listed part has to make
    // its own. The plain heading text is used, not the LaTeX form: an entry is
    // an argument and must be escaped, but the reader's words are what belongs
    // in a table of contents. Suppressed entirely when the document has no
    // contents page to receive it — a hand-written line that does nothing is
    // noise in a .tex the reader edits.
    const entry = part.tocTitle ?? title
    const listing =
      part.listed && this.#config.toc.include
        ? `\n\\addcontentsline{toc}{${command}}{${escapeText(entry)}}`
        : ''
    return `${transition}\\${command}*{${text}}${listing}`
  }

  /**
   * The \mainmatter or \backmatter that opens a division, when this document
   * owns its divisions at all.
   *
   * \frontmatter is not emitted here — `document.ts` opens it before the body,
   * alongside \maketitle and the contents, because those belong to the front
   * matter too.
   */
  #matterTransition(role: PartRole, title: string): string {
    if (!this.#ownsMatterDivisions) return ''

    const rank = roleRank(role)
    // A duplicated title's inherited role is not the writer's intent for THIS
    // occurrence — see the field comment on #duplicatedTitles — and
    // `structure-duplicate-heading` already names the real cause, so raising
    // `structure-order` on top of it would be a second, flatly false notice
    // about a book that (from the writer's point of view) is in order.
    if (rank < this.#highestRank && !this.#duplicatedTitles.has(title)) {
      // Still emit the transition below — book.cls's \backmatter runs
      // \@mainmatterfalse WITHOUT restoring \pagenumbering{arabic}, so
      // returning '' here (the old behaviour) left every part written after
      // an out-of-order one, including a later \mainmatter division, with no
      // transition of its own: the whole rest of the book stayed in roman
      // numerals. These are idempotent switches, so honouring document order
      // — including its divisions — is correct; only the diagnostic
      // disagrees with the order.
      this.#diagnostics.add(
        'structure-order',
        'Parts are not in book order — front, then main, then back matter. They were typeset in the order they were written rather than rearranged.',
        role,
      )
    }
    // The maximum seen, not the latest: an out-of-order part must not lower
    // the bar for what counts as "out of order" for the parts after it.
    this.#highestRank = Math.max(this.#highestRank, rank)

    if (role === this.#openRole) return ''

    // \frontmatter is not this method's to emit — document.ts owns it (see
    // the class comment above) — so a `front` role has no command here at
    // all. Crucially, #openRole must NOT latch to 'front' in that case: doing
    // so was the regression this guards against. A latched 'front' makes the
    // NEXT `main` part look like a role change and re-emit \mainmatter,
    // which calls \pagenumbering{arabic} a second time and restarts the page
    // counter mid-book. Leaving #openRole untouched means only a role that
    // actually opens a division can close one off.
    if (role === 'front') return ''

    this.#openRole = role
    return role === 'main' ? '\\mainmatter\n\n' : '\\backmatter\n\n'
  }

  #list(node: List): string {
    const environment = node.ordered ? 'enumerate' : 'itemize'
    const items = node.children.map((item) => this.#listItem(item)).join('\n')
    return `\\begin{${environment}}\n${items}\n\\end{${environment}}`
  }

  #listItem(node: ListItem): string {
    // GFM task lists: a checkbox is more faithful than dropping the state.
    const marker =
      node.checked === true
        ? '\\item[$\\checkmark$] '
        : node.checked === false
          ? '\\item[$\\square$] '
          : '\\item '
    const content = node.children
      .map((child) =>
        child.type === 'paragraph' ? this.#inline(child.children) : this.#block(child),
      )
      .filter((s) => s.length > 0)
      .join('\n\n')
    return `  ${marker}${content}`
  }

  #blockquote(node: Blockquote): string {
    return `\\begin{quote}\n${this.#blocks(node.children)}\n\\end{quote}`
  }

  #code(node: Code): string {
    // Verbatim content is NOT escaped — that is the point. The only way out of
    // the environment is the closing delimiter, so that is what is checked.
    if (!isVerbatimSafe(node.value)) {
      this.#diagnostics.add(
        'verbatim-delimiter',
        'A code block contained a LaTeX verbatim terminator and was rendered as plain text.',
      )
      return `\\begin{quote}\\ttfamily\n${escapeText(node.value)}\n\\end{quote}`
    }
    // breaklines keeps long lines inside the text block rather than running
    // into the margin. Syntax colouring is deliberately out of scope for v1.
    return `\\begin{Verbatim}[breaklines=true,breakanywhere=true]\n${node.value}\n\\end{Verbatim}`
  }

  #table(node: Table): string {
    const [head, ...body] = node.children
    if (!head) return ''
    const spec = head.children.map((_, i) => columnSpec(node.align, i)).join('')
    const row = (cells: readonly RootContent[]) =>
      cells
        .map((cell) =>
          'children' in cell ? this.#inline(cell.children as RootContent[]) : '',
        )
        .join(' & ')

    const lines = [
      // xltabular, not longtable: X is a tabularx column type that plain
      // longtable cannot parse.
      `\\begin{xltabular}{\\linewidth}{@{}${spec}@{}}`,
      '\\toprule',
      `${row(head.children)} \\\\`,
      '\\midrule',
      '\\endhead',
      ...body.map((r) => `${row(r.children)} \\\\`),
      '\\bottomrule',
      '\\end{xltabular}',
    ]
    return lines.join('\n')
  }

  // ---- inline level ----

  #inline(nodes: readonly RootContent[]): string {
    return nodes.map((node) => this.#inlineNode(node)).join('')
  }

  #inlineNode(node: RootContent): string {
    switch (node.type) {
      case 'text':
        this.#checkGlyphs(node.value)
        return escapeText(node.value)
      case 'emphasis':
        return `\\emph{${this.#inline(node.children)}}`
      case 'strong':
        return `\\textbf{${this.#inline(node.children)}}`
      case 'delete':
        return `\\sout{${this.#inline(node.children)}}`
      case 'inlineCode':
        return `\\texttt{${escapeText(node.value)}}`
      case 'inlineMath':
        return `$${node.value}$`
      case 'break':
        return '\\\\\n'
      case 'link':
        return this.#link(node.url, this.#inline(node.children))
      case 'linkReference': {
        const def = this.#definitions.get(node.identifier)
        const label = this.#inline(node.children)
        return def ? this.#link(def.url, label) : label
      }
      case 'image':
        return this.#image(node.alt ?? '', node.url)
      case 'imageReference': {
        const def = this.#definitions.get(node.identifier)
        return this.#image(node.alt ?? '', def?.url ?? node.identifier)
      }
      case 'footnoteReference': {
        const def = this.#footnotes.get(node.identifier)
        return def ? `\\footnote{${this.#blocks(def.children).replace(/\n+/g, ' ')}}` : ''
      }
      case 'html':
        this.#diagnostics.add(
          'raw-html',
          'HTML in the source cannot be typeset, so it appears as literal text.',
          node.value.slice(0, 80),
        )
        return escapeText(node.value)
      default:
        return 'children' in node
          ? this.#inline(node.children as RootContent[])
          : 'value' in node
            ? escapeText(String(node.value))
            : ''
    }
  }

  /**
   * Text XeTeX will silently drop, because no face in the chosen typeface can
   * draw it. Reported rather than left to be discovered in the finished PDF.
   */
  #checkGlyphs(value: string): void {
    for (const gap of findScriptGaps(value, typefaceOrDefault(this.#config.typeface))) {
      const message = gap.fixable
        ? `${gap.script} letters need a typeface that covers them. Try ${typefacesWithGreek().join(', ')}.`
        : `${gap.script} cannot be typeset — no bundled typeface covers it.`
      this.#diagnostics.add('missing-glyphs', message, gap.sample)
    }
  }

  /**
   * Links keep their text visible and reproduce the target so it survives
   * printing — a PDF read on paper is useless if the destination is invisible.
   * When the text already IS the URL, a footnote would just repeat it.
   */
  #link(url: string, label: string): string {
    const safeUrl = escapeUrl(url)
    const bare = label === escapeText(url)
    if (bare) return `\\url{${safeUrl}}`
    const link = `\\href{${safeUrl}}{${label}}`
    // A bare URL already shows its own target, so it never takes a footnote
    // whatever this is set to — repeating it would be noise on any medium.
    if (!this.#config.links.footnoteUrls) return link
    return `${link}\\footnote{\\url{${safeUrl}}}`
  }

  /**
   * A figure: the image, centred, with the alt text as its caption.
   *
   * `htbp` rather than a fixed position because a float that cannot be placed
   * where it was written is better moved than dropped. Capped at the text width
   * because core cannot know the image's pixel dimensions, and an oversized
   * graphic silently running into the margin is the worse failure.
   */
  #figure(alt: string, url: string): string {
    const graphic = this.#graphic(url)
    if (graphic === null) return this.#unrenderable(alt, url)

    const caption = alt.trim() ? `\n  \\caption{${escapeText(alt.trim())}}` : ''
    return [
      '\\begin{figure}[htbp]',
      '  \\centering',
      `  ${graphic}`,
      caption.slice(1),
      '\\end{figure}',
    ]
      .filter((l) => l.length > 0)
      .join('\n')
  }

  /**
   * The `\\includegraphics` call, or null when the reference cannot be drawn.
   * The name is already sanitised, so it needs no escaping — see `images.ts`.
   */
  #graphic(url: string): string | null {
    const image = classifyImage(url)
    if (image.kind !== 'supported') return null
    // A name galley cannot supply bytes for must NOT become an
    // \includegraphics: the engine stops the whole document with "Unable to
    // load picture", which is a far worse outcome than the gap it replaces.
    // Any manuscript written elsewhere and pasted in arrives in exactly this
    // state.
    if (this.#available && !this.#available.has(image.name)) return null
    this.#images.add(image.name)
    return `\\includegraphics[width=\\linewidth,keepaspectratio]{${image.name}}`
  }

  /**
   * A reference galley will not draw. A silent drop is worse than a visible
   * gap: the reader sees exactly where the image belongs and why it is absent.
   */
  #unrenderable(alt: string, url: string): string {
    const image = classifyImage(url)
    if (image.kind === 'remote') {
      this.#diagnostics.add(
        'image-unsupported',
        'An image hosted elsewhere is not included. galley never fetches from the network, so only a file you attach can be typeset.',
        url,
      )
    } else if (image.kind === 'unsupported-format') {
      this.#diagnostics.add(
        'image-unsupported',
        `That image format cannot be typeset. Use ${SUPPORTED_IMAGE_LIST}.`,
        url,
      )
    } else {
      this.#diagnostics.add(
        'image-unsupported',
        'That image is named by the document but has not been added. Use the picture button, or drop the file in, to include it.',
        url,
      )
    }
    const caption = alt.trim() ? escapeText(alt.trim()) : escapeText(url)
    return `\\fbox{\\parbox{0.9\\linewidth}{\\centering\\small [Figure not included: ${caption}]}}`
  }

  /** Inline, mixed into a sentence: no float and no caption, just the graphic. */
  #image(alt: string, url: string): string {
    return this.#graphic(url) ?? this.#unrenderable(alt, url)
  }
}

export function serializeToLatex(
  tree: Root,
  config: GalleyConfig,
  available?: ReadonlySet<string>,
): SerializeResult {
  return new Serializer(config, available).run(tree)
}
