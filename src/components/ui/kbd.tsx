import { cn } from '@/lib/utils'

/**
 * A keyboard key.
 *
 * Not part of shadcn's set, and small enough to own outright rather than take
 * a dependency for.
 */
export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5',
        'font-medium font-sans text-[0.7rem] text-muted-foreground leading-none',
        className,
      )}
      {...props}
    />
  )
}
