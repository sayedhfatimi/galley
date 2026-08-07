import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStore } from './lib/store'

/**
 * Takes the theme as props rather than calling useTheme itself: the hook is
 * useState-based, so a second call would hold its own copy and desync from the
 * particle background.
 */
export function ThemeToggle() {
  const theme = useStore((s) => s.theme)
  const onToggle = useStore((s) => s.toggleTheme)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
