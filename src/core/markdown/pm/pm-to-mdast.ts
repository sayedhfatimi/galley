import type {
  BlockContent,
  Blockquote,
  Code,
  FootnoteDefinition,
  Heading,
  Image,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  Table,
  TableCell,
  TableRow,
  Text,
  ThematicBreak,
} from 'mdast'
import type { PMDoc, PMMark, PMNode } from './types'

/*
 * ProseMirror JSON → MDAST converter (inverse of mdast-to-pm.ts).
 *
 * Marks flatten into MDAST's wrapper-node nesting in a canonical order
 * so identical PM input always produces byte-identical markdown. The
 * order is link > bold > italic > strike, with inline-code as the
 * innermost wrapper (it's a leaf in MDAST so it consumes the text).
 */

/**
 * galley addition: footnote definitions harvested during the walk.
 *
 * A footnote is one PM node, but mdast splits it in two — an inline reference
 * where it appears, and a definition at the root. The definitions are collected
 * as the tree is converted and appended afterwards. Module scope is safe:
 * conversion is synchronous, and this is reset on every call.
 */
const harvestedFootnotes: FootnoteDefinition[] = []

export function pmToMdast(doc: PMDoc): Root {
  harvestedFootnotes.length = 0
  const children = (doc.content ?? [])
    .map(blockFromPm)
    .filter((n): n is BlockContent => n !== null)
  return {
    type: 'root',
    // Definitions must follow the content that references them, and must sit at
    // the root — mdast has no other legal home for them.
    children: [...children, ...harvestedFootnotes] as Root['children'],
  }
}

function blockFromPm(node: PMNode): BlockContent | null {
  switch (node.type) {
    case 'paragraph':
      return paragraphFromPm(node)
    case 'heading':
      return headingFromPm(node)
    case 'blockquote':
      return blockquoteFromPm(node)
    case 'codeBlock':
      return codeBlockFromPm(node)
    case 'horizontalRule':
      return thematicBreakFromPm()
    case 'bulletList':
      return listFromPm(node, false)
    case 'orderedList':
      return listFromPm(node, true)
    case 'taskList':
      return taskListFromPm(node)
    case 'table':
      return tableFromPm(node)
    case 'mathBlock':
      return mathBlockFromPm(node)
    case 'image':
      return imageBlockFromPm(node)
    default:
      return null
  }
}

function imageBlockFromPm(node: PMNode): BlockContent {
  // Top-level PM image → mdast lone-image paragraph. Renderers commonly
  // promote lone-image paragraphs into a figure
  // with `<figcaption>` from alt — matching the editor's NodeView.
  return {
    type: 'paragraph',
    children: [imageFromPm(node)],
  } satisfies Paragraph
}

function mathBlockFromPm(node: PMNode): BlockContent {
  const tex = (node.content ?? []).map((n) => n.text ?? '').join('')
  return {
    type: 'math',
    value: tex,
  } as unknown as BlockContent
}

function paragraphFromPm(node: PMNode): Paragraph {
  return {
    type: 'paragraph',
    children: phrasingFromPm(node.content ?? []),
  }
}

function headingFromPm(node: PMNode): Heading {
  // galley patch: full h1–h6 range — see the note in mdast-to-pm.ts.
  const rawLevel = Number(node.attrs?.level ?? 1)
  const level = Math.min(6, Math.max(1, rawLevel)) as 1 | 2 | 3 | 4 | 5 | 6
  return {
    type: 'heading',
    depth: level,
    children: phrasingFromPm(node.content ?? []),
  }
}

function blockquoteFromPm(node: PMNode): Blockquote {
  return {
    type: 'blockquote',
    children: (node.content ?? [])
      .map(blockFromPm)
      .filter((n): n is BlockContent => n !== null),
  }
}

function codeBlockFromPm(node: PMNode): Code {
  const text = (node.content ?? []).map((n) => n.text ?? '').join('')
  const lang = node.attrs?.language
  return {
    type: 'code',
    lang: typeof lang === 'string' && lang.length > 0 ? lang : null,
    meta: null,
    value: text,
  }
}

function thematicBreakFromPm(): ThematicBreak {
  return { type: 'thematicBreak' }
}

function listFromPm(node: PMNode, ordered: boolean): List {
  const start =
    ordered && typeof node.attrs?.start === 'number' ? (node.attrs.start as number) : null
  const list: List = {
    type: 'list',
    ordered,
    spread: false,
    start: start ?? null,
    children: (node.content ?? [])
      .filter((n) => n.type === 'listItem')
      .map((n) => listItemFromPm(n, null)),
  }
  return list
}

function taskListFromPm(node: PMNode): List {
  return {
    type: 'list',
    ordered: false,
    spread: false,
    start: null,
    children: (node.content ?? [])
      .filter((n) => n.type === 'taskItem')
      // galley patch: carry the tri-state back out. `=== true` here would have
      // turned every unchecked AND every non-task item into a false, so a mixed
      // list came back as all-checkboxes. See the note in mdast-to-pm.ts.
      .map((n) =>
        listItemFromPm(
          n,
          typeof n.attrs?.checked === 'boolean' ? (n.attrs.checked as boolean) : null,
        ),
      ),
  }
}

function listItemFromPm(node: PMNode, checked: boolean | null): ListItem {
  return {
    type: 'listItem',
    spread: false,
    checked,
    children: (node.content ?? [])
      .map(blockFromPm)
      .filter((n): n is BlockContent => n !== null),
  }
}

function tableFromPm(node: PMNode): Table {
  const rows = (node.content ?? []).filter((n) => n.type === 'tableRow')
  const firstRow = rows[0]
  const align: (Table['align'] extends infer A
    ? A extends readonly (infer E)[]
      ? E
      : never
    : never)[] = firstRow
    ? (firstRow.content ?? []).map((cell) => {
        const ta = cell.attrs?.textAlign
        if (ta === 'left' || ta === 'right' || ta === 'center') return ta
        return null
      })
    : []
  return {
    type: 'table',
    align,
    children: rows.map(tableRowFromPm),
  }
}

function tableRowFromPm(node: PMNode): TableRow {
  return {
    type: 'tableRow',
    children: (node.content ?? [])
      .filter((n) => n.type === 'tableHeader' || n.type === 'tableCell')
      .map(tableCellFromPm),
  }
}

function tableCellFromPm(node: PMNode): TableCell {
  // Cell content is wrapped in a paragraph in PM; unwrap to phrasing.
  const para = (node.content ?? []).find((n) => n.type === 'paragraph')
  const phrasing = para ? phrasingFromPm(para.content ?? []) : []
  return { type: 'tableCell', children: phrasing }
}

/*
 * Inline conversion: PM text nodes carry marks; MDAST nests wrappers.
 * We walk consecutive text nodes that share a mark set and rebuild the
 * MDAST wrappers in canonical order.
 *
 * `image` and `hardBreak` are leaf inline nodes with no marks.
 */
function phrasingFromPm(nodes: PMNode[]): PhrasingContent[] {
  const out: PhrasingContent[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      out.push(wrapTextWithMarks(node.text ?? '', node.marks ?? []))
    } else if (node.type === 'hardBreak') {
      out.push({ type: 'break' })
    } else if (node.type === 'image') {
      out.push(imageFromPm(node))
    } else if (node.type === 'mathInline') {
      const tex = (node.content ?? []).map((n) => n.text ?? '').join('')
      out.push({
        type: 'inlineMath',
        value: tex,
      } as unknown as PhrasingContent)
    } else if (node.type === 'footnote') {
      // galley addition: split back into an inline reference plus a root-level
      // definition, which is the only shape mdast allows.
      out.push(footnoteFromPm(node))
    }
  }
  return out
}

/**
 * galley addition: a PM footnote node becomes an mdast `footnoteReference`,
 * with its `footnoteDefinition` harvested for the root.
 *
 * The identifier is carried through so a document that came from Markdown keeps
 * its original labels; anything created in the editor gets a positional one.
 */
function footnoteFromPm(node: PMNode): PhrasingContent {
  const identifier =
    typeof node.attrs?.identifier === 'string' && node.attrs.identifier.length > 0
      ? node.attrs.identifier
      : String(harvestedFootnotes.length + 1)

  harvestedFootnotes.push({
    type: 'footnoteDefinition',
    identifier,
    children: [{ type: 'paragraph', children: phrasingFromPm(node.content ?? []) }],
  } as FootnoteDefinition)

  return { type: 'footnoteReference', identifier } as unknown as PhrasingContent
}

function imageFromPm(node: PMNode): Image {
  return {
    type: 'image',
    url: String(node.attrs?.src ?? ''),
    alt: typeof node.attrs?.alt === 'string' ? (node.attrs.alt as string) : '',
    title: typeof node.attrs?.title === 'string' ? (node.attrs.title as string) : null,
  }
}

const MARK_ORDER = ['link', 'bold', 'italic', 'strike', 'code'] as const
type MarkType = (typeof MARK_ORDER)[number]

function wrapTextWithMarks(text: string, marks: PMMark[]): PhrasingContent {
  if (marks.length === 0) {
    return { type: 'text', value: text } satisfies Text
  }
  const sortedMarks = sortMarks(marks)

  // Inline code is a leaf node in MDAST — collapse to inlineCode value.
  const codeMark = sortedMarks.find((m) => m.type === 'code')
  if (codeMark) {
    const remaining = sortedMarks.filter((m) => m.type !== 'code')
    const codeNode: PhrasingContent = { type: 'inlineCode', value: text }
    return wrapPhrasingWithMarks(codeNode, remaining)
  }

  const textNode: Text = { type: 'text', value: text }
  return wrapPhrasingWithMarks(textNode, sortedMarks)
}

function wrapPhrasingWithMarks(inner: PhrasingContent, marks: PMMark[]): PhrasingContent {
  // Apply marks from innermost (last) to outermost (first).
  let node: PhrasingContent = inner
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]
    if (!m) continue
    node = wrapOne(node, m)
  }
  return node
}

function wrapOne(inner: PhrasingContent, mark: PMMark): PhrasingContent {
  switch (mark.type) {
    case 'bold':
      return { type: 'strong', children: [inner] }
    case 'italic':
      return { type: 'emphasis', children: [inner] }
    case 'strike':
      return { type: 'delete', children: [inner] }
    case 'link': {
      const url = String(mark.attrs?.href ?? '')
      const title =
        typeof mark.attrs?.title === 'string' ? (mark.attrs.title as string) : null
      return {
        type: 'link',
        url,
        title,
        children: [inner],
      } satisfies Link
    }
    default:
      return inner
  }
}

function sortMarks(marks: PMMark[]): PMMark[] {
  const score = (m: PMMark) => {
    const idx = MARK_ORDER.indexOf(m.type as MarkType)
    return idx === -1 ? MARK_ORDER.length : idx
  }
  return [...marks].sort((a, b) => score(a) - score(b))
}
