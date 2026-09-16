import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Keeps one broken surface from taking the whole application.
 *
 * There was no error boundary anywhere in galley before this, which was
 * survivable while the worst case was losing a pasted document that
 * localStorage would hand back. It stops being survivable once a folder
 * project is open: a throw during an autosave would unmount the editor with
 * the author's unsaved text still in it, and nothing would be written.
 *
 * So the fallback's job is not to apologise, it is to offer a way OUT with
 * the work intact. A boundary that traps the reader on a dead screen is worse
 * than the crash it caught.
 */
interface Props {
  children: ReactNode
  /** Shown as the way out. Closing a project returns to the single document. */
  onRecover?: () => void
  recoverLabel?: string
  /** The text the reader had open, so it can be rescued from the fallback. */
  rescue?: () => string | null
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry — galley sends nothing anywhere, and that promise does not
    // get an exception for crashes. The console is the reader's own.
    console.error('galley: a surface failed', error, info.componentStack)
  }

  private download = () => {
    const text = this.props.rescue?.()
    if (!text) return
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'galley-recovered.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <h2 className="font-semibold text-base tracking-tight">
              Something in this view stopped working
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Nothing has been written to your files. If you were editing, take a copy
              before going on.
            </p>
            <p className="font-mono text-muted-foreground/70 text-xs">
              {this.state.error.message}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {this.props.rescue && (
              <Button size="sm" variant="outline" onClick={this.download}>
                Download your work
              </Button>
            )}
            {this.props.onRecover && (
              <Button size="sm" onClick={this.props.onRecover}>
                {this.props.recoverLabel ?? 'Go back'}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
