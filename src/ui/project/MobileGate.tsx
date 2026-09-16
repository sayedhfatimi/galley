import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

/**
 * Phones and tablets get Obsidian, not galley.
 *
 * This is a positioning decision rather than a gap. A folder project IS an
 * Obsidian vault, Obsidian's own mobile app is a better phone editor than
 * galley could build, and Sync already carries the folder between devices —
 * so the honest thing is to say which surface is which rather than ship a
 * three-panel desktop shell onto a 390px screen.
 *
 * `(pointer: coarse) and (hover: none)` rather than a width breakpoint,
 * because the question is what the reader is pointing WITH. A narrow desktop
 * window is still a mouse and still works; a touchscreen laptop has a coarse
 * pointer AND hover, so it is not caught either.
 */
const PHONE = '(pointer: coarse) and (hover: none)'

export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(() => matches())

  useEffect(() => {
    // Guarded the way `store.ts`'s `initialTheme` is: `matchMedia` is absent
    // under jsdom and in any non-browser consumer, and a crash here would
    // take the whole app rather than one control.
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    // try/catch as well as the presence check: some embedded browsers expose
    // `matchMedia` and throw on an unsupported feature query. Falling back to
    // "not a phone" shows the app, which is the recoverable wrong answer —
    // the other direction hides galley behind a screen naming Obsidian.
    let query: MediaQueryList
    try {
      query = window.matchMedia(PHONE)
    } catch {
      return
    }
    const update = () => setIsPhone(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  return isPhone
}

function matches(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia(PHONE).matches
  } catch {
    return false
  }
}

export function MobileGate({ children }: { children: ReactNode }) {
  const isPhone = useIsPhone()
  if (!isPhone) return children

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm space-y-3 text-center">
        <img src="/logo.png" alt="" className="mx-auto size-10 rounded-md" />
        <h1 className="font-semibold text-lg tracking-tight">galley is a desktop tool</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Typesetting a book needs a real keyboard and a screen wide enough to see the
          page. Write on your phone in <strong>Obsidian</strong> — it is a better mobile
          editor than this could be — and open the same folder here when you are back at a
          desktop.
        </p>
        <p className="text-muted-foreground/70 text-xs">
          Chrome or Edge on macOS, Windows or Linux.
        </p>
      </div>
    </div>
  )
}
