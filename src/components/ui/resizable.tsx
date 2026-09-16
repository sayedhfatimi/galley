'use client'

import { GripVerticalIcon } from 'lucide-react'
import type * as React from 'react'
import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '@/lib/utils'

/**
 * Thin wrappers over `react-resizable-panels` v4.
 *
 * Written against the installed major rather than copied from shadcn's
 * snippet, which still targets v2/v3: v4 renamed `PanelGroup` to `Group` and
 * `PanelResizeHandle` to `Separator`, and takes `orientation` where the older
 * API took `direction`. Pasting the snippet compiles to three missing exports.
 *
 * Chosen over shadcn's `sidebar`, which persists its open state in a COOKIE
 * (galley has no server and already keeps UI state in its zustand store) and
 * renders a `Sheet` on mobile — dead weight, since the phone surface is
 * Obsidian. And over `sheet` itself, which is an overlay: every chapter
 * switch would become open-pick-close in a panel the author works in
 * constantly.
 */

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full data-[orientation=vertical]:flex-col', className)}
      {...props}
    />
  )
}

function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return (
    <ResizablePrimitive.Panel
      data-slot="resizable-panel"
      className={cn('flex min-h-0 min-w-0 flex-col', className)}
      {...props}
    />
  )
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        'relative flex w-px items-center justify-center bg-border transition-colors',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2',
        'hover:bg-primary/40 data-[separator-dragging]:bg-primary',
        'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-xs border bg-border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
