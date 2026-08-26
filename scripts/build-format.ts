#!/usr/bin/env bun
/**
 * Rebuild `swiftlatexxetex.fmt`, the XeTeX format file in `public/texlive/`.
 *
 * MAINTAINER-ONLY, and separate from `build-texlive-bundle.ts` for a reason: a
 * format file is engine-specific. A `xelatex.fmt` from a local TeX Live will
 * not load here — it must be built BY the wasm engine that will read it, which
 * means the build has to happen in a browser rather than in this process.
 *
 *   bun run scripts/build-format.ts
 *
 * How it works. Building a format needs `xelatex.ini`, `latex.ltx`, the
 * hyphenation patterns and `unicode-letters.tex` — none of which are in
 * `public/texlive/`, because that bundle holds only what *compiling* needs.
 * So this script stands up a small server that resolves any bare filename
 * through kpathsea against the local TeX Live, serves the vendored engine
 * beside it, and hands back a page that drives `XeTeXEngine.compileFormat()`.
 * The finished format is posted back and written to `scripts/out/`.
 *
 * The engine's resolver (see patches 3, 6 and 7 in public/engines/PATCHES.md)
 * requests `{endpoint}{name}` over a SYNCHRONOUS XHR, treats any non-200 or any
 * HTML-looking body as a miss, and appends an extension derived from the
 * kpathsea format number when the name has none. This server matches that
 * contract exactly.
 *
 * IT DOES NOT OVERWRITE THE COMMITTED FORMAT, deliberately. The format is built
 * from whatever TeX Live is installed here, while the engine is SwiftLaTeX's
 * 2022 XeTeX; a newer kernel can rely on primitives that binary does not have,
 * which is the same version-skew that keeps microtype out of the preamble.
 * Test the new format before promoting it. See scripts/README.md.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const ENGINES = join(ROOT, 'public/engines')
const OUT_DIR = join(ROOT, 'scripts/out')
const OUT = join(OUT_DIR, 'swiftlatexxetex.fmt')
const PORT = 7171

/**
 * kpathsea cannot resolve every extension from the name alone. These are the
 * hints `build-texlive-bundle.ts` needs too; trying the bare name first keeps
 * the common case to a single lookup.
 */
const FORMAT_HINTS = ['', 'tex', 'misc fonts', 'opentype fonts', 'truetype fonts']

const cache = new Map<string, string | null>()

function locate(name: string): string | null {
  if (cache.has(name)) return cache.get(name) ?? null
  let found: string | null = null
  for (const format of FORMAT_HINTS) {
    try {
      const args = format ? ['-format', format, name] : [name]
      const out = execFileSync('kpsewhich', args, { encoding: 'utf8' })
        .trim()
        .split('\n')[0]
      if (out && existsSync(out)) {
        found = out
        break
      }
    } catch {
      // kpsewhich exits non-zero when it finds nothing; try the next hint.
    }
  }
  cache.set(name, found)
  return found
}

const HARNESS = `<!doctype html>
<meta charset="utf-8">
<title>galley — rebuild the XeTeX format</title>
<style>
  body { font: 14px/1.6 ui-monospace, monospace; max-width: 46rem; margin: 3rem auto; padding: 0 1rem; }
  #log { white-space: pre-wrap; border: 1px solid #ccc; padding: 1rem; margin-top: 1rem; }
</style>
<h1>Rebuilding swiftlatexxetex.fmt</h1>
<p>This takes a minute or two. Leave the tab open.</p>
<div id="log">starting…</div>
<script type="module">
  const log = (m) => { document.getElementById('log').textContent += '\\n' + m }
  try {
    const { XeTeXEngine } = await import('/engines/XeTeXEngine.js')
    const engine = new XeTeXEngine()
    log('loading the engine…')
    await engine.loadEngine()
    engine.setTexliveEndpoint(location.origin + '/tex/')
    log('building the format (this is the slow part)…')
    const fmt = await engine.compileFormat()
    log('built ' + fmt.byteLength + ' bytes; posting back…')
    const res = await fetch('/result', { method: 'POST', body: fmt })
    log(res.ok ? 'DONE — written to scripts/out/. You can close this tab.' : 'FAILED to write: ' + res.status)
  } catch (err) {
    log('FAILED: ' + (err && err.message ? err.message : String(err)))
    log(typeof err === 'string' ? err : '')
  }
</script>
`

function main() {
  if (!locate('xelatex.ini')) {
    console.error('No local TeX Live found (kpsewhich cannot resolve xelatex.ini).')
    console.error('This script is maintainer-only; the committed format is what ships.')
    process.exit(1)
  }
  mkdirSync(OUT_DIR, { recursive: true })

  let served = 0
  let missed = 0

  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url)
      const path = decodeURIComponent(url.pathname)

      if (path === '/')
        return new Response(HARNESS, { headers: { 'content-type': 'text/html' } })

      if (path === '/result' && req.method === 'POST') {
        const bytes = new Uint8Array(await req.arrayBuffer())
        writeFileSync(OUT, bytes)
        console.log(`\nWrote ${OUT} (${(bytes.byteLength / 1048576).toFixed(1)} MB)`)
        console.log(`Resolved ${served} files, ${missed} misses.`)
        console.log(
          '\nNOT installed automatically — see scripts/README.md before promoting it.',
        )
        return new Response('ok')
      }

      // The vendored engine, served from the path XeTeXEngine.js hardcodes.
      if (path.startsWith('/engines/')) {
        const file = Bun.file(join(ENGINES, path.slice('/engines/'.length)))
        return (await file.exists())
          ? new Response(file)
          : new Response('no', { status: 404 })
      }

      // Everything else is a kpathsea lookup. A miss must NOT be a 200 with a
      // page of HTML — the engine sniffs for that and would cache it as a font.
      if (path.startsWith('/tex/')) {
        const name = path.slice('/tex/'.length)
        if (!name || name.includes('/')) return new Response('no', { status: 404 })
        const found = locate(name)
        if (!found) {
          missed++
          return new Response('no', { status: 404 })
        }
        served++
        process.stdout.write(
          `\r  resolved ${served} files… (${name.padEnd(28).slice(0, 28)})`,
        )
        return new Response(readFileSync(found), {
          headers: { 'content-type': 'application/octet-stream' },
        })
      }

      return new Response('no', { status: 404 })
    },
  })

  console.log(`Serving the format builder on http://localhost:${PORT}/`)
  console.log('Open that URL in a browser. The page drives the engine and posts')
  console.log('the finished format back here. Ctrl-C when it says DONE.\n')
}

main()
