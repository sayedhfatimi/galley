import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CompileErrorReason,
  CompileImage,
  CompileRequest,
  CompileResponse,
} from '@/workers/compile.worker'

/**
 * Drives the compile worker.
 *
 * Compilation is an explicit step, never automatic. LaTeX generation is instant
 * and free; compilation is neither, and conflating them would make the
 * configuration panel feel sluggish and pull tens of megabytes of engine down
 * before the reader has asked for a PDF.
 */

export type CompileState = 'idle' | 'running' | 'done' | 'error'

/**
 * A hard ceiling on any single compile.
 *
 * This is the whole resource-bounding story, and it is why galley can accept
 * arbitrary user mathematics without an allow-list: TeX is Turing-complete, but
 * it is running on the reader's own CPU in their own tab, so a runaway is bounded
 * by terminating the worker rather than by policing the input.
 */
const TIMEOUT_MS = 60_000

export interface CompileResult {
  state: CompileState
  progress: string
  pdfUrl: string | null
  pdfBytes: number
  log: string
  error: { reason: CompileErrorReason; message: string } | null
  elapsedMs: number
}

export function useCompile() {
  const [result, setResult] = useState<CompileResult>({
    state: 'idle',
    progress: '',
    pdfUrl: null,
    pdfBytes: 0,
    log: '',
    error: null,
    elapsedMs: 0,
  })

  const workerRef = useRef<Worker | null>(null)
  const timerRef = useRef<number | null>(null)
  const urlRef = useRef<string | null>(null)
  const startedRef = useRef(0)

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    cleanup()
  }, [cleanup])

  // Revoke the previous object URL whenever a new one replaces it, and on
  // unmount. Without this a reader who renders twenty times leaks twenty PDFs.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      workerRef.current?.terminate()
    }
  }, [])

  const cancel = useCallback(() => {
    terminate()
    setResult((r) => ({ ...r, state: 'idle', progress: '' }))
  }, [terminate])

  const compile = useCallback(
    (tex: string, images: CompileImage[] = []) => {
      // A worker is kept alive between renders so the engine and the TeX Live
      // files it has cached are not re-fetched on every press.
      if (!workerRef.current) {
        workerRef.current = new Worker(
          new URL('../../workers/compile.worker.ts', import.meta.url),
          {
            type: 'module',
          },
        )
      }
      const worker = workerRef.current
      startedRef.current = performance.now()

      setResult((r) => ({
        ...r,
        state: 'running',
        progress: 'Starting…',
        error: null,
        elapsedMs: 0,
      }))

      worker.onmessage = (event: MessageEvent<CompileResponse>) => {
        const data = event.data
        if (data.type === 'progress') {
          setResult((r) => ({ ...r, progress: data.message }))
          return
        }

        cleanup()
        const elapsedMs = Math.round(performance.now() - startedRef.current)

        if (data.type === 'error') {
          setResult((r) => ({
            ...r,
            state: 'error',
            progress: '',
            log: data.log,
            error: { reason: data.reason, message: data.message },
            elapsedMs,
          }))
          return
        }

        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        const url = URL.createObjectURL(new Blob([data.pdf], { type: 'application/pdf' }))
        urlRef.current = url
        setResult({
          state: 'done',
          progress: '',
          pdfUrl: url,
          pdfBytes: data.pdf.byteLength,
          log: data.log,
          error: null,
          elapsedMs,
        })
      }

      worker.onerror = (event) => {
        cleanup()
        setResult((r) => ({
          ...r,
          state: 'error',
          progress: '',
          error: {
            reason: 'engine',
            message:
              'The typesetting engine stopped unexpectedly. Reloading usually fixes it.',
          },
          log: event.message ?? '',
        }))
      }

      cleanup()
      timerRef.current = window.setTimeout(() => {
        // Terminating is the point: a wedged TeX process cannot be asked to stop.
        terminate()
        setResult((r) => ({
          ...r,
          state: 'error',
          progress: '',
          error: {
            reason: 'document',
            message: `Compilation was stopped after ${TIMEOUT_MS / 1000} seconds. The document is too complex to typeset in the browser — the LaTeX source is still yours to download and compile locally.`,
          },
          elapsedMs: TIMEOUT_MS,
        }))
      }, TIMEOUT_MS)

      worker.postMessage({ type: 'compile', tex, images } satisfies CompileRequest)
    },
    [cleanup, terminate],
  )

  return { ...result, compile, cancel }
}
