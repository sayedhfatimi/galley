import { ImageIcon } from 'lucide-react'
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
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Two questions about a figure, and neither is answered on the author's behalf.
 *
 * **Choosing one already in the folder.** In a project galley does not own the
 * pictures — they are files the author put there, often long before opening
 * galley — so the useful control is a list of what is already in the project
 * rather than a file dialog that would copy something in again.
 *
 * **Naming one that is being added.** A drop whose name is already taken is
 * NOT resolved silently. Replacing a figure has no undo, and renaming it
 * quietly is a smaller surprise but still a surprise, so the suggestion is
 * pre-filled and the author presses the button.
 */

export interface FigureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every figure already in the project, by project-relative path. */
  figures: readonly string[]
  /** How each would read from the chapter being edited. */
  referenceFor: (path: string) => string
  onInsert: (reference: string) => void
}

export function FigureDialog({
  open,
  onOpenChange,
  figures,
  referenceFor,
  onInsert,
}: FigureDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b p-6 pb-4">
          <DialogTitle>Add a figure</DialogTitle>
          <DialogDescription>
            The pictures already in this folder. Drop a new one into the editor to add it
            to the project.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          {figures.length === 0 ? (
            <p className="p-6 text-muted-foreground text-sm leading-relaxed">
              This project has no pictures yet. Drop one into a chapter, or add it to the
              folder in Obsidian and it will appear here.
            </p>
          ) : (
            <ScrollArea className="h-full">
              <ul className="p-2">
                {figures.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        onInsert(referenceFor(path))
                        onOpenChange(false)
                      }}
                    >
                      <ImageIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="min-w-0 flex-1 truncate">{path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export interface NameFigureDialogProps {
  /** The name that clashed, or null when nothing is being named. */
  clash: { name: string; suggestion: string } | null
  onCancel: () => void
  onConfirm: (name: string) => void
}

export function NameFigureDialog({ clash, onCancel, onConfirm }: NameFigureDialogProps) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (clash) setName(clash.suggestion)
  }, [clash])

  return (
    <Dialog open={clash !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>That name is taken</DialogTitle>
          <DialogDescription>
            This folder already has a <strong>{clash?.name}</strong>. galley will not
            replace it — the picture that is there would be gone for good — so give this
            one a different name.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="File name"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onConfirm(name.trim())
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Don't add it
          </Button>
          <Button onClick={() => onConfirm(name.trim())} disabled={!name.trim()}>
            Add as this
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
