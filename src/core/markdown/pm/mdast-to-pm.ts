import type {
  Blockquote,
  Break,
  Code,
  Definition,
  Delete,
  Emphasis,
  FootnoteDefinition,
  FootnoteReference,
  Heading,
  Image,
  InlineCode,
  Link,
  LinkReference,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Table,
  TableCell,
  TableRow,
  Text,
  ThematicBreak,
} from 'mdast'
import type { PMMark, PMNode } from './types'

/*
 * MDAST → ProseMirror JSON converter.
 *
 * Supports the GFM + math subset galley renders:
 *   - paragraph, heading (h1–h6; galley uses the full range)
 *   - blockquote, code (fenced w/ lang), thematicBreak
 *   - list (bullet, ordered, task), listItem (w/ checked)
 *   - table, tableRow, tableHeader/tableCell
 *   - image (block-level figure node)
 *   - text + strong / emphasis / delete / inlineCode / link marks
 *   - hardBreak
 *   - inlineMath / math → text placeholders for step 3; replaced by
 *     dedicated nodes in step 6 (MathInline / MathBlock).
 *   - html → dropped (authors don't need raw HTML in this build)
 */

/**
 * galley addition: definitions gathered before the walk.
 *
 * Footnote and link definitions live at the root of the document, but are
 * referenced from deep inside it, so they have to be resolved before any
 * phrasing content is converted. Module scope is safe here — conversion is
 * synchronous and single-threaded — and is reset on every call.
 */
const footnoteDefs = new Map<string, FootnoteDefinition>()
const linkDefs = new Map<string, Definition>()

function collectDefinitions(root: Root): void {
  footnoteDefs.clear()
  linkDefs.clear()
  const visit = (node: { type: string; children?: unknown[] }): void => {
    if (node.type === 'footnoteDefinition') {
      const def = node as unknown as FootnoteDefinition
      footnoteDefs.set(def.identifier, def)
    }
    if (node.type === 'definition') {
      const def = node as unknown as Definition
      linkDefs.set(def.identifier, def)
    }
    for (const child of (node.children ?? []) as { type: string }[]) visit(child)
  }
  visit(root as unknown as { type: string; children?: unknown[] })
}

export function mdastToPm(root: Root): { type: 'doc'; content: PMNode[] } {
  collectDefinitions(root)
  const content = root.children.map(blockToPm).filter((n): n is PMNode => n !== null)
  // ProseMirror's doc node requires at least one block child; insert
  // an empty paragraph if the markdown was empty.
  if (content.length === 0) content.push({ type: 'paragraph' })
  return { type: 'doc', content }
}

function blockToPm(node: RootContent): PMNode | null {
  switch (node.type) {
    case 'paragraph': {
      // Lone-image paragraph → top-level PM image (the shape renderers
      // commonly promote to a figure).
      if (node.children.length === 1 && node.children[0]?.type === 'image') {
        return imageToPm(node.children[0] as Image)
      }
      return paragraphToPm(node)
    }
    case 'heading':
      return headingToPm(node)
    case 'blockquote':
      return blockquoteToPm(node)
    case 'code':
      return codeBlockToPm(node)
    case 'list':
      return listToPm(node)
    case 'thematicBreak':
      return thematicBreakToPm(node)
    case 'table':
      return tableToPm(node)
    case 'math': {
      const tex = (node as { value?: string }).value ?? ''
      return tex
        ? { type: 'mathBlock', content: [{ type: 'text', text: tex }] }
        : { type: 'mathBlock' }
    }
    // Lone-image paragraphs in markdown surface here as a top-level
    // image MDAST node; emit as a block-level PM image node directly
    // (renderers commonly re-promote lone-image paragraphs
    // into figures during render, matching the editor's NodeView).
    case 'image':
      return imageToPm(node)
    default:
      return null
  }
}

function paragraphToPm(node: Paragraph): PMNode {
  const content = phrasingToPm(node.children)
  if (content.length === 0) return { type: 'paragraph' }
  return { type: 'paragraph', content }
}

function headingToPm(node: Heading): PMNode {
  // galley patch: the full h1–h6 range, unclamped.
  //
  // Upstream restricted this to h2–h4, on the assumption that h1 is reserved
  // for a page title. In galley `#` is a chapter, so clamping would silently
  // demote every chapter in a book to a section, and h5/h6 collapsed to
  // paragraphs outright.
  const allowed = Math.min(6, Math.max(1, node.depth))
  const content = phrasingToPm(node.children)
  return {
    type: 'heading',
    attrs: { level: allowed },
    ...(content.length > 0 ? { content } : {}),
  }
}

function blockquoteToPm(node: Blockquote): PMNode {
  const content = node.children.map(blockToPm).filter((n): n is PMNode => n !== null)
  if (content.length === 0) content.push({ type: 'paragraph' })
  return { type: 'blockquote', content }
}

function codeBlockToPm(node: Code): PMNode {
  return {
    type: 'codeBlock',
    attrs: { language: node.lang ?? null },
    ...(node.value ? { content: [{ type: 'text', text: node.value }] } : {}),
  }
}

function thematicBreakToPm(_node: ThematicBreak): PMNode {
  return { type: 'horizontalRule' }
}

function listToPm(node: List): PMNode {
  const isTaskList = node.children.some(
    (item) => typeof (item as ListItem).checked === 'boolean',
  )
  if (isTaskList) {
    return {
      type: 'taskList',
      content: node.children.map((item) => taskItemToPm(item as ListItem)),
    }
  }
  const items = node.children.map((item) => listItemToPm(item as ListItem))
  if (node.ordered) {
    return {
      type: 'orderedList',
      attrs: { start: node.start ?? 1 },
      content: items,
    }
  }
  return { type: 'bulletList', content: items }
}

function listItemToPm(node: ListItem): PMNode {
  const content = node.children.map(blockToPm).filter((n): n is PMNode => n !== null)
  if (content.length === 0) content.push({ type: 'paragraph' })
  return { type: 'listItem', content }
}

function taskItemToPm(node: ListItem): PMNode {
  const content = node.children.map(blockToPm).filter((n): n is PMNode => n !== null)
  if (content.length === 0) content.push({ type: 'paragraph' })
  return {
    type: 'taskItem',
    // galley patch: mdast's `checked` is TRI-state — true, false, or null for an
    // item that is not a task at all. Upstream collapsed it with `=== true`,
    // which turned every plain item in a mixed list into an unchecked box.
    // Writers mix them freely, so the null is preserved.
    attrs: { checked: typeof node.checked === 'boolean' ? node.checked : null },
    content,
  }
}

function tableToPm(node: Table): PMNode {
  const rows = node.children
  const align = node.align ?? []
  const pmRows = rows.map((row, rowIdx) => tableRowToPm(row, rowIdx === 0, align))
  return { type: 'table', content: pmRows }
}

function tableRowToPm(
  row: TableRow,
  isHeader: boolean,
  align: (string | null)[],
): PMNode {
  return {
    type: 'tableRow',
    content: row.children.map((cell, colIdx) =>
      tableCellToPm(cell, isHeader, align[colIdx] ?? null),
    ),
  }
}

function tableCellToPm(
  cell: TableCell,
  isHeader: boolean,
  textAlign: string | null,
): PMNode {
  const inlineContent = phrasingToPm(cell.children)
  const content: PMNode[] = [
    inlineContent.length > 0
      ? { type: 'paragraph', content: inlineContent }
      : { type: 'paragraph' },
  ]
  const attrs: Record<string, unknown> = {}
  if (textAlign) attrs.textAlign = textAlign
  return {
    type: isHeader ? 'tableHeader' : 'tableCell',
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    content,
  }
}

function imageToPm(node: Image): PMNode {
  const attrs: Record<string, unknown> = { src: node.url }
  if (node.alt) attrs.alt = node.alt
  if (node.title) attrs.title = node.title
  return { type: 'image', attrs }
}

/*
 * Inline conversion: text + marks. Each MDAST phrasing node either
 * produces a PM text node (with marks accumulated from ancestors) or
 * a leaf node (hardBreak, image).
 */
function phrasingToPm(nodes: readonly PhrasingContent[], marks: PMMark[] = []): PMNode[] {
  const out: PMNode[] = []
  for (const node of nodes) {
    const chunk = phrasingNodeToPm(node, marks)
    if (chunk) out.push(...chunk)
  }
  return out
}

function phrasingNodeToPm(node: PhrasingContent, marks: PMMark[]): PMNode[] | null {
  switch (node.type) {
    case 'text':
      return textToPm(node, marks)
    case 'strong':
      return phrasingToPm((node as Strong).children, addMark(marks, { type: 'bold' }))
    case 'emphasis':
      return phrasingToPm((node as Emphasis).children, addMark(marks, { type: 'italic' }))
    case 'delete':
      return phrasingToPm((node as Delete).children, addMark(marks, { type: 'strike' }))
    case 'inlineCode':
      return inlineCodeToPm(node, marks)
    case 'link':
      return linkToPm(node as Link, marks)
    case 'break':
      return [hardBreakToPm(node as Break)]
    // Inline images inside a paragraph with other content are dropped
    // — image is a block-level node in our PM schema, so it can't
    // live inside a paragraph. Rare markdown form; the common case
    // (lone-image paragraph) is promoted to a top-level block image
    // in `blockToPm`.
    case 'image':
      return null
    case 'inlineMath': {
      const tex = (node as { value?: string }).value ?? ''
      return [
        tex
          ? { type: 'mathInline', content: [{ type: 'text', text: tex }] }
          : { type: 'mathInline' },
      ]
    }
    // galley addition: footnotes. The upstream schema has no notion of them,
    // but a tool for book-length manuscripts cannot silently eat them.
    case 'footnoteReference': {
      const ref = node as unknown as FootnoteReference
      const def = footnoteDefs.get(ref.identifier)
      const inner = def ? footnoteContentToPm(def) : []
      return [
        {
          type: 'footnote',
          attrs: { identifier: ref.identifier },
          ...(inner.length > 0 ? { content: inner } : {}),
        },
      ]
    }
    // galley addition: reference links are RESOLVED here rather than modelled.
    // galley's serializer resolves them the same way, so the LaTeX is identical
    // — the only change is that the Markdown source normalises to inline form.
    case 'linkReference': {
      const ref = node as unknown as LinkReference
      const def = linkDefs.get(ref.identifier)
      if (!def) return phrasingToPm(ref.children, marks)
      return linkToPm(
        { type: 'link', url: def.url, title: def.title, children: ref.children } as Link,
        marks,
      )
    }
    default:
      return null
  }
}

function textToPm(node: Text, marks: PMMark[]): PMNode[] {
  return [
    {
      type: 'text',
      text: node.value,
      ...(marks.length > 0 ? { marks } : {}),
    },
  ]
}

function inlineCodeToPm(node: InlineCode, marks: PMMark[]): PMNode[] {
  return [
    {
      type: 'text',
      text: node.value,
      marks: addMark(marks, { type: 'code' }),
    },
  ]
}

function linkToPm(node: Link, marks: PMMark[]): PMNode[] {
  const attrs: Record<string, unknown> = { href: node.url }
  if (node.title) attrs.title = node.title
  return phrasingToPm(node.children, addMark(marks, { type: 'link', attrs }))
}

function hardBreakToPm(_node: Break): PMNode {
  return { type: 'hardBreak' }
}

function addMark(marks: PMMark[], mark: PMMark): PMMark[] {
  return [...marks, mark]
}

/**
 * galley addition: a footnote definition's blocks, flattened to inline content.
 *
 * A footnote is nearly always a sentence or two, and the PM node holds inline
 * content, so paragraphs are joined with a space. Marks survive; block structure
 * inside a footnote does not — which matches how the LaTeX serializer renders
 * them anyway, collapsing newlines into spaces inside `\\footnote{}`.
 */
function footnoteContentToPm(def: FootnoteDefinition): PMNode[] {
  const out: PMNode[] = []
  for (const block of def.children) {
    if (out.length > 0) out.push({ type: 'text', text: ' ' })
    if (block.type === 'paragraph') out.push(...phrasingToPm(block.children))
  }
  return out
}
