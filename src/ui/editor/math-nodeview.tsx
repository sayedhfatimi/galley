import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { renderTex } from './mathjax'

/*
 * Math NodeView — Obsidian-style edit/render swap.
 *
 * The TeX lives in the node's text content (managed by ProseMirror),
 * not in an attribute. This NodeView watches the editor selection and
 * flips between two views:
 *
 *   - Cursor outside the node → rendered MathJax SVG.
 *   - Cursor inside  the node → editable contentDOM framed by static
 *     `$` (inline) or `$$` (block) bookends.
 *
 * Implementation note: PM's contentDOM (rendered by <NodeViewContent>)
 * is ALWAYS mounted in the DOM tree in the same location across
 * renders. Hiding via `display: none` confuses PM's child-mounting
 * logic, so we keep the contentDOM in normal flow when editing and
 * pull it out of flow with `position: absolute; visibility: hidden`
 * when not editing — the children are still managed but invisible.
 */

function replaceChildren(host: HTMLElement, html: string): void {
  while (host.firstChild) host.removeChild(host.firstChild)
  if (!html) return
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  for (const child of Array.from(parsed.body.children)) {
    host.appendChild(child)
  }
}

export function MathNodeView({ node, editor, getPos }: NodeViewProps) {
  // Derived from the node rather than passed in: ReactNodeViewRenderer supplies
  // a fixed prop set, and the node already knows which kind it is.
  const inline = node.type.name === 'mathInline'
  const tex = node.textContent
  const [inside, setInside] = useState(false)
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hostRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!editor) return
    function check() {
      const pos = typeof getPos === 'function' ? getPos() : null
      if (typeof pos !== 'number') return
      const start = pos
      const end = pos + node.nodeSize
      const { from, to } = editor.state.selection
      setInside(from >= start && to <= end)
    }
    check()
    editor.on('selectionUpdate', check)
    editor.on('transaction', check)
    return () => {
      editor.off('selectionUpdate', check)
      editor.off('transaction', check)
    }
  }, [editor, getPos, node.nodeSize])

  useEffect(() => {
    if (inside) return
    let cancelled = false
    setError(null)
    setRendered(false)
    if (hostRef.current) replaceChildren(hostRef.current, '')
    if (!tex) return
    renderTex(tex, !inline)
      .then((output) => {
        if (cancelled || !hostRef.current) return
        replaceChildren(hostRef.current, output)
        setRendered(output !== '')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Math render failed')
      })
    return () => {
      cancelled = true
    }
  }, [tex, inline, inside])

  function enterEdit() {
    if (!editor) return
    const pos = typeof getPos === 'function' ? getPos() : null
    if (typeof pos !== 'number') return
    editor.commands.setTextSelection(pos + 1)
    editor.commands.focus()
  }

  const sourceVisible = inside
  const renderVisible = !inside

  if (inline) {
    return (
      <NodeViewWrapper
        as="span"
        className="relative inline-block align-middle"
        data-math-inline=""
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: keyboard users enter edit via ProseMirror's arrow-key navigation (handled by the selectionUpdate listener) — onClick is a mouse-only shortcut */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
        <span
          className="cursor-text"
          style={{
            visibility: renderVisible ? 'visible' : 'hidden',
            position: renderVisible ? 'static' : 'absolute',
          }}
          onClick={enterEdit}
        >
          <span
            ref={(el) => {
              hostRef.current = el
            }}
          />
          {!rendered ? (
            <span
              className={cn(
                'font-mono text-sm',
                error
                  ? 'text-destructive underline decoration-dotted underline-offset-2'
                  : 'text-muted-foreground',
              )}
              title={error ? `LaTeX error: ${error}` : undefined}
            >
              ${tex || 'math'}$
            </span>
          ) : null}
        </span>
        <span
          className="inline-flex items-baseline gap-px font-mono text-sm text-foreground"
          style={{
            visibility: sourceVisible ? 'visible' : 'hidden',
            position: sourceVisible ? 'static' : 'absolute',
          }}
          data-math-source=""
        >
          <span className="select-none text-muted-foreground/70">$</span>
          <NodeViewContent<'span'> as="span" className="outline-none" />
          <span className="select-none text-muted-foreground/70">$</span>
        </span>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper as="div" className="relative my-4" data-math-block="">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: keyboard users enter edit via ProseMirror's arrow-key navigation */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
      <div
        className="flex w-full cursor-text justify-center p-2"
        style={{
          visibility: renderVisible ? 'visible' : 'hidden',
          position: renderVisible ? 'static' : 'absolute',
          inset: renderVisible ? undefined : 0,
        }}
        onClick={enterEdit}
      >
        <div
          ref={(el) => {
            hostRef.current = el
          }}
        />
        {!rendered ? (
          <pre
            className={cn(
              'm-0 whitespace-pre-wrap font-mono text-sm',
              error
                ? 'text-destructive underline decoration-dotted underline-offset-2'
                : 'text-muted-foreground',
            )}
            title={error ? `LaTeX error: ${error}` : undefined}
          >{`$$\n${tex || 'math'}\n$$`}</pre>
        ) : null}
      </div>
      <div
        style={{
          visibility: sourceVisible ? 'visible' : 'hidden',
          position: sourceVisible ? 'static' : 'absolute',
        }}
        className="rounded-md border border-input bg-muted/30 p-3 font-mono text-sm text-foreground"
        data-math-source=""
      >
        <div className="mb-1 select-none text-muted-foreground/70">$$</div>
        <NodeViewContent className="whitespace-pre-wrap outline-none" />
        <div className="mt-1 select-none text-muted-foreground/70">$$</div>
      </div>
    </NodeViewWrapper>
  )
}
