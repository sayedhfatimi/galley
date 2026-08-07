import type { Editor, Range } from '@tiptap/core'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { cn } from '@/lib/utils'
import type { SlashItem } from './items'

/*
 * SlashMenu — rendered into a floating popover by the slash-command
 * extension's `render` callback. Receives the filtered item list and
 * exposes an imperative `onKeyDown` handle so the suggestion plugin
 * can forward arrow/enter keypresses for keyboard navigation without
 * stealing focus from the editor.
 */

export type SlashMenuRef = {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export type SlashMenuProps = {
  items: SlashItem[]
  command: (item: SlashItem) => void
  editor: Editor
  range: Range
}

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(function SlashMenu(
  { items, command },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset selection whenever the items list changes (e.g. on filter).
  // biome-ignore lint/correctness/useExhaustiveDependencies: items is the trigger, not read in the body
  useEffect(() => {
    setSelectedIndex(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
        No matches.
      </div>
    )
  }

  return (
    <div
      className="max-h-72 w-72 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md [@media(hover:none)]:w-80"
      role="listbox"
      tabIndex={-1}
      aria-activedescendant={items[selectedIndex]?.id}
      style={{ touchAction: 'manipulation' }}
    >
      {items.map((item, idx) => {
        const Icon = item.icon
        const active = idx === selectedIndex
        return (
          <button
            key={item.id}
            id={item.id}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => command(item)}
            onMouseEnter={() => setSelectedIndex(idx)}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
              '[@media(hover:none)]:min-h-11',
              active && 'bg-accent text-accent-foreground',
            )}
          >
            <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{item.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            </span>
            {item.shortcut ? (
              <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground/70">
                {item.shortcut}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
})
