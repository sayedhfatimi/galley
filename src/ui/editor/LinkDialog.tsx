import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Collects a link target.
 *
 * In galley's own chrome rather than a native `prompt`, which ignores the theme
 * and cannot say what it is about to do with an empty selection.
 *
 * Two cases, and the difference matters to a writer: with text selected the URL
 * is attached to it, and with nothing selected there is no text to attach it to,
 * so the URL is inserted and linked to itself.
 */
export interface LinkDialogProps {
  editor: Editor | null
  open: boolean
  /** The href already on the selection, so editing starts from it. */
  initialHref: string
  onOpenChange: (open: boolean) => void
}

export function LinkDialog({ editor, open, initialHref, onOpenChange }: LinkDialogProps) {
  const [href, setHref] = useState(initialHref)

  // Reopening on a different selection must not show the previous target.
  useEffect(() => {
    if (open) setHref(initialHref)
  }, [open, initialHref])

  if (!editor) return null

  const hasSelection = !editor.state.selection.empty
  const trimmed = href.trim()

  const apply = () => {
    if (!trimmed) return
    const chain = editor.chain().focus()
    if (hasSelection) {
      chain.extendMarkRange('link').setLink({ href: trimmed }).run()
    } else {
      chain
        .insertContent({
          type: 'text',
          text: trimmed,
          marks: [{ type: 'link', attrs: { href: trimmed } }],
        })
        .run()
    }
    onOpenChange(false)
  }

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialHref ? 'Edit link' : 'Add a link'}</DialogTitle>
          <DialogDescription>
            {hasSelection
              ? 'The selected text will link to this address.'
              : 'Nothing is selected, so the address will be inserted as the link text.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="link-href" className="text-muted-foreground text-xs">
            Address
          </Label>
          <Input
            id="link-href"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply()
              }
            }}
            placeholder="https://example.com"
            // The field is the only thing here; focusing it saves a click and a
            // Tab on the most common path.
            autoFocus
          />
        </div>

        <DialogFooter className="sm:justify-between">
          {initialHref ? (
            <Button variant="ghost" onClick={remove}>
              Remove link
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={!trimmed}>
              {initialHref ? 'Update' : 'Add link'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
