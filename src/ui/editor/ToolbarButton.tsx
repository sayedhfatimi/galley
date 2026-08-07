import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * A toolbar icon button with a tooltip and optional shortcut hint.
 *
 * `active` lights the button so the applicable formatting is visible at a
 * glance. There is no Toggle primitive in play, so this composes Button with
 * `aria-pressed` and lets the styling key off it.
 */
export function ToolbarButton({
  icon,
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn('size-8', active && 'bg-accent text-accent-foreground')}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}
