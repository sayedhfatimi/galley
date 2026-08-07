/// <reference lib="webworker" />
/**
 * The only place in galley that knows a TeX engine exists.
 *
 * Everything above this file — the converter, the config panel, the preview —
 * deals in strings. That boundary is deliberate and load-bearing: v1 ships
 * SwiftLaTeX's 2022 XeTeX + dvipdfm, and replacing them with a current build is
 * planned work, not a rewrite. Keep engine detail on this side of the line.
 *
 * Compilation runs here rather than on the main thread because a book-length
 * document takes seconds of solid CPU, and because terminating a worker is the
 * only reliable way to bound a runaway compile — which is what lets galley
 * accept arbitrary user mathematics without an allow-list.
 */

const ENGINE_BASE = '/engines'
const TEXLIVE_ENDPOINT = '/texlive/'

export interface CompileRequest {
  type: 'compile'
  tex: string
}

export type CompileResponse =
  | { type: 'progress'; stage: 'loading' | 'typesetting' | 'rendering'; message: string }
  | { type: 'done'; pdf: ArrayBuffer; log: string; passes: number }
  | { type: 'error'; reason: CompileErrorReason; message: string; log: string }

/**
 * Compilation failure is almost always one of two things, and the reader needs
 * to be told which in language that means something to them. A raw compiler log
 * is not an acceptable error message, though offering it as detail is fine.
 */
export type CompileErrorReason = 'maths' | 'document' | 'engine'

interface Engine {
  loadEngine(): Promise<void>
  setTexliveEndpoint(url: string): void
  writeMemFSFile(name: string, content: string | Uint8Array): void
  setEngineMainFile(name: string): void
  isReady(): boolean
  compileLaTeX(): Promise<{ status: number; pdf?: Uint8Array; log: string }>
  compilePDF(): Promise<{ status: number; pdf?: Uint8Array; log: string }>
}

let xetex: Engine | undefined
let dvipdfm: Engine | undefined

/**
 * Load a driver as an ES module.
 *
 * Both drivers declare `exports`, `__awaiter`, `__generator`, `EngineStatus` and
 * `CompileResult` at top level, so loading them as classic scripts makes the
 * second clobber the first. Module scope fixes that natively — and avoids
 * evaluating fetched source, so no `unsafe-eval` is needed in the CSP. The
 * `export` statements are patch 4 in `public/engines/PATCHES.md`.
 */
async function loadDriver<T>(file: string, exportName: string): Promise<new () => T> {
  const module = await import(/* @vite-ignore */ `${ENGINE_BASE}/${file}`)
  return module[exportName] as new () => T
}

async function ensureEngines(post: (m: CompileResponse) => void): Promise<void> {
  if (xetex && dvipdfm) return

  post({
    type: 'progress',
    stage: 'loading',
    message: 'Preparing the typesetting engine. This happens once.',
  })

  const [XeTeXEngine, DvipdfmxEngine] = await Promise.all([
    loadDriver<Engine>('XeTeXEngine.js', 'XeTeXEngine'),
    loadDriver<Engine>('DvipdfmxEngine.js', 'DvipdfmxEngine'),
  ])

  const xe = new XeTeXEngine()
  const dv = new DvipdfmxEngine()
  await xe.loadEngine()
  await dv.loadEngine()

  // Point both at galley's own origin. Upstream's default endpoint is a
  // third-party host that has been offline since at least 2026-08.
  xe.setTexliveEndpoint(TEXLIVE_ENDPOINT)
  dv.setTexliveEndpoint(TEXLIVE_ENDPOINT)

  xetex = xe
  dvipdfm = dv
}

/**
 * Classify a failure from the engine log.
 *
 * Deliberately conservative: it only claims "maths" when the log actually points
 * at a maths environment, because telling a reader to check their equations when
 * the real fault lies elsewhere wastes more of their time than saying nothing
 * specific.
 */
function classify(log: string): { reason: CompileErrorReason; message: string } {
  const mathsSignals = [
    'Missing $ inserted',
    'Extra }, or forgotten $',
    'Display math should end with',
    'Missing \\right',
    'Missing \\endgroup inserted',
  ]
  if (mathsSignals.some((s) => log.includes(s))) {
    return {
      reason: 'maths',
      message:
        'A mathematical expression could not be typeset. Check for an unclosed $ or a mismatched brace in your equations.',
    }
  }
  if (log.includes('TeX capacity exceeded') || log.includes('Interwoven alignment')) {
    return {
      reason: 'document',
      message:
        'The document was too complex for the typesetter to finish. A very large table or a deeply nested structure is the usual cause.',
    }
  }
  return {
    reason: 'document',
    message:
      'The document could not be typeset. The details below say where the typesetter stopped.',
  }
}

async function compile(tex: string, post: (m: CompileResponse) => void): Promise<void> {
  await ensureEngines(post)
  if (!xetex || !dvipdfm) throw new Error('engines unavailable')

  post({ type: 'progress', stage: 'typesetting', message: 'Typesetting…' })

  xetex.writeMemFSFile('main.tex', tex)
  xetex.setEngineMainFile('main.tex')

  // Two passes: a table of contents needs the second for page numbers to settle.
  // The first pass decides success, so a failure is reported without waiting.
  const first = await xetex.compileLaTeX()
  if (first.status !== 0 || !first.pdf) {
    const { reason, message } = classify(first.log)
    post({ type: 'error', reason, message, log: first.log })
    return
  }
  const second = await xetex.compileLaTeX()
  const xdv = second.status === 0 && second.pdf ? second.pdf : first.pdf

  post({ type: 'progress', stage: 'rendering', message: 'Rendering the PDF…' })

  dvipdfm.writeMemFSFile('main.xdv', xdv)
  dvipdfm.setEngineMainFile('main.xdv')
  const rendered = await dvipdfm.compilePDF()

  if (rendered.status !== 0 || !rendered.pdf) {
    post({
      type: 'error',
      reason: 'engine',
      message: 'The document typeset correctly but could not be turned into a PDF.',
      log: rendered.log,
    })
    return
  }

  // Transfer rather than copy: a book-length PDF is worth not duplicating.
  const buffer = rendered.pdf.buffer.slice(
    rendered.pdf.byteOffset,
    rendered.pdf.byteOffset + rendered.pdf.byteLength,
  ) as ArrayBuffer
  self.postMessage(
    {
      type: 'done',
      pdf: buffer,
      log: second.log || first.log,
      passes: 2,
    } satisfies CompileResponse,
    [buffer],
  )
}

self.onmessage = async (event: MessageEvent<CompileRequest>) => {
  if (event.data?.type !== 'compile') return
  const post = (m: CompileResponse) => self.postMessage(m)
  try {
    await compile(event.data.tex, post)
  } catch (error) {
    post({
      type: 'error',
      reason: 'engine',
      message:
        'The typesetting engine could not start. Reloading the page usually fixes it.',
      log:
        error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
    })
  }
}
