#!/usr/bin/env bun
/**
 * Build the bundled TeX Live tree that ships in `public/texlive/`.
 *
 * MAINTAINER-ONLY. Requires a local TeX Live with XeTeX; its output is committed
 * so that neither CI nor a contributor needs one. Re-run it whenever the
 * preamble grows a package, because a file missing from the bundle fails only at
 * compile time in the browser, with an unhelpful message.
 *
 *   bun run scripts/build-texlive-bundle.ts
 *
 * How it works: the fixture manuscript is converted with the real preamble and
 * compiled by local XeTeX under `-recorder`, which logs every file kpathsea
 * opened. That list is the closed set — closed because a reader cannot inject a
 * preamble or request packages, so the reachable files are finite and can be
 * bundled. Fonts, their outlines and the ligature mapping are added explicitly,
 * because XeTeX's font loader bypasses kpathsea and never appears in the log.
 *
 * The tree is flat and keyed by bare filename. The vendored engine glue is
 * patched to request `{endpoint}{filename}` rather than upstream's
 * `{endpoint}xetex/{format}/{filename}`, which is what lets a static host serve
 * it. A name collision would therefore be a real bug, so the script fails loudly
 * on one rather than silently overwriting.
 */

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { DocumentCharacter, FontSize, GalleyConfig } from '../src/core/config'
import { presetFor } from '../src/core/config'
import { convert, readFrontmatter } from '../src/core/latex/document'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'public/texlive')
const FIXTURE = join(ROOT, 'src/core/__fixtures__/manuscript.md')
const WORK = join(ROOT, '.texlive-build')

/**
 * Computer Modern maths families, added explicitly because the harvest cannot
 * see them.
 *
 * Text is set in Latin Modern OpenType, but *maths* is still Computer Modern,
 * and LaTeX preloads the base maths fonts into the format file. Anything loaded
 * at format-build time is never opened at run time, so it leaves no trace in the
 * recorder log: a 10pt document full of maths records no cmmi, cmr or cmsy at
 * all. Only the off-default sizes showed up, which is why the bundle held
 * cmmi6 and cmmi8 but not the cmmi5/7/10 a 10pt document actually needs.
 *
 * Listing whole families rather than observed sizes is deliberate. Which size
 * LaTeX asks for depends on the base size and the nesting depth of a
 * superscript, so any harvest only ever proves what the fixture happened to
 * reach. These are small, and a missing one fails in the reader's browser.
 */
const MATH_FAMILIES = [
  'cmr', // roman: digits, operators, \mathrm
  'cmmi', // math italic: variables
  'cmsy', // symbols: relations, \mathcal
  'cmex', // extensibles: big operators, fences
  'cmbx', // \mathbf, and bold headings in maths
  'cmmib', // bold math italic, via \boldmath
  'cmbsy', // bold symbols, via \boldmath
  'cmss', // \mathsf
  'cmtt', // \mathtt
  'cmti', // \mathit
]
const MATH_SIZES = [5, 6, 7, 8, 9, 10, 12, 17]

/** Font faces referenced by the preamble. Never harvested — see the header. */
const FONTS = [
  'lmroman10-regular.otf',
  'lmroman10-bold.otf',
  'lmroman10-italic.otf',
  'lmroman10-bolditalic.otf',
  'lmsans10-regular.otf',
  'lmsans10-bold.otf',
  'lmsans10-oblique.otf',
  'lmsans10-boldoblique.otf',
  'lmmono10-regular.otf',
  'lmmono10-italic.otf',
  'lmmonolt10-bold.otf',
]

/**
 * The mapping that `Ligatures=TeX` applies. It is loaded by XeTeX's font
 * subsystem rather than through kpathsea, so like the faces themselves it never
 * reaches the recorder log — and kpathsea will not even resolve it without
 * being told the format.
 *
 * Missing, it fails silently and looks like a converter bug rather than a
 * bundle gap: the document compiles, but `---` and `--` stay literal hyphens
 * instead of becoming em and en dashes.
 */
const MAPPINGS = ['tex-text.tec']

function kpsewhich(name: string, format?: string): string | null {
  try {
    const args = format ? ['-format', format, name] : [name]
    const out = execFileSync('kpsewhich', args, { encoding: 'utf8' })
      .trim()
      .split('\n')[0]
    return out && existsSync(out) ? out : null
  } catch {
    return null
  }
}

function main() {
  if (!kpsewhich('article.cls')) {
    console.error(
      'No local TeX Live found. This script is maintainer-only; the bundle it',
    )
    console.error('produces is committed, so you do not need to run it to build galley.')
    process.exit(1)
  }

  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(WORK, { recursive: true })

  // Harvest across EVERY configuration a reader can reach, not just one.
  // Each document class pulls its own .cls, and each base size its own .clo —
  // an article-shaped document needs article.cls and size11.clo, which a
  // book-only harvest never sees. A file missing from the bundle does not fail
  // loudly; the engine caches whatever the server returned and TeX chokes on it.
  const source = readFileSync(FIXTURE, 'utf8')
  const metadata = readFrontmatter(source)
  const characters: DocumentCharacter[] = ['article', 'report', 'book']
  const sizes: FontSize[] = [10, 11, 12]
  const inputs: string[] = []

  // Options that pull in a package the default preamble does not, so the
  // harvest reaches them. A branch not compiled here is a branch whose packages
  // are missing from the bundle, and it fails only in the reader's browser.
  const variants = [
    { suffix: '', apply: (c: GalleyConfig) => c },
    {
      suffix: '-runon',
      apply: (c: GalleyConfig) => ({
        ...c,
        chapters: { ...c.chapters, startOnNewPage: false },
      }),
    },
  ]

  for (const character of characters) {
    for (const fontSize of sizes) {
      for (const variant of variants) {
        const config = variant.apply({ ...presetFor(character), fontSize, metadata })
        const name = `probe-${character}-${fontSize}${variant.suffix}`
        writeFileSync(join(WORK, `${name}.tex`), convert(source, config).tex)

        for (let pass = 0; pass < 2; pass++) {
          try {
            execFileSync(
              'xelatex',
              ['-interaction=nonstopmode', '-recorder', `${name}.tex`],
              { cwd: WORK, stdio: 'ignore' },
            )
          } catch {
            // nonstopmode exits non-zero on warnings; the .fls is what matters.
          }
        }

        const log = readFileSync(join(WORK, `${name}.log`), 'utf8')
        const errors = log.split('\n').filter((l) => l.startsWith('!'))
        if (errors.length > 0) {
          console.error(`${name} did not compile cleanly:`)
          for (const e of errors.slice(0, 5)) console.error(`  ${e}`)
          process.exit(1)
        }

        const fls = readFileSync(join(WORK, `${name}.fls`), 'utf8')
        inputs.push(
          ...fls
            .split('\n')
            .filter((l) => l.startsWith('INPUT '))
            .map((l) => l.slice(6).trim())
            .filter((p) => p.startsWith('/') && existsSync(p))
            // The local TeX Live format the harvest ran against. The browser
            // engine is preloaded with its own (swiftlatexxetex.fmt) and never
            // asks for this one, so it is 7 MB of pure dead weight.
            .filter((p) => !p.endsWith('xelatex.fmt')),
        )
      }
    }
  }

  const sources = [...new Set(inputs)]

  // Added before the .vf and outline passes below, so that the metrics carry
  // their virtual fonts and outlines with them.
  for (const family of MATH_FAMILIES) {
    for (const size of MATH_SIZES) {
      const tfm = kpsewhich(`${family}${size}.tfm`)
      if (tfm) sources.push(tfm)
    }
  }

  // dvipdfmx runs after XeTeX and has its own inputs, which xelatex's -recorder
  // cannot know about. Missing them fails at PDF-generation time with
  // "VF file ended prematurely" — a message that points at nothing useful.
  //
  // For every metrics file the document uses, the matching virtual font may
  // also be needed: cmex10.tfm and cmex10.vf are DIFFERENT files sharing a
  // stem, and dvipdfmx wants the .vf where XeTeX wanted the .tfm.
  for (const src of [...sources]) {
    if (!src.endsWith('.tfm')) continue
    const vf = kpsewhich(`${basename(src, '.tfm')}.vf`)
    if (vf) sources.push(vf)
  }

  // Glyph lists and font maps: dvipdfmx warns loudly without them and can
  // produce a PDF with missing glyphs.
  for (const support of ['glyphlist.txt', 'pdfglyphlist.txt', 'pdftex.map']) {
    const path = kpsewhich(support)
    if (path) sources.push(path)
  }

  // Maths is set in Computer Modern, which is a Type 1 font family: XeTeX reads
  // only the metrics, but dvipdfmx must embed the actual outline. So a .tfm in
  // the harvest implies a .pfb that the harvest cannot see, and without it any
  // document containing maths dies at the PDF stage with "Cannot proceed
  // without .vf or physical font" while plain prose renders perfectly.
  //
  // The map is the authority on which outline belongs to which metrics, and it
  // is not a stem match: pzdr is drawn by uzdr.pfb.
  const mapPath = kpsewhich('pdftex.map')
  const outlineOf = new Map<string, string>()
  if (mapPath) {
    for (const line of readFileSync(mapPath, 'utf8').split('\n')) {
      const tfm = line.match(/^([^\s%]+)\s/)?.[1]
      const pfb = line.match(/<+([^\s<]+\.pfb)/)?.[1]
      if (tfm && pfb && !outlineOf.has(tfm)) outlineOf.set(tfm, pfb)
    }
  }
  for (const src of [...sources]) {
    if (!src.endsWith('.tfm')) continue
    const pfb = outlineOf.get(basename(src, '.tfm'))
    if (!pfb) continue
    const path = kpsewhich(pfb)
    if (!path) {
      console.error(`${basename(src)} needs the outline ${pfb}, which is not installed.`)
      console.error('Install the amsfonts and urw-base35 font packages, then re-run.')
      process.exit(1)
    }
    sources.push(path)
  }

  for (const font of FONTS) {
    const path = kpsewhich(font)
    if (!path) {
      console.error(`Font missing from local TeX Live: ${font}`)
      process.exit(1)
    }
    sources.push(path)
  }

  for (const mapping of MAPPINGS) {
    const path = kpsewhich(mapping, 'misc fonts')
    if (!path) {
      console.error(`Font mapping missing from local TeX Live: ${mapping}`)
      process.exit(1)
    }
    sources.push(path)
  }

  // The engine format is NOT harvested — it must be built by the wasm engine
  // itself (see scripts/README.md) — so carry it across the rebuild rather than
  // deleting it with everything else. Losing it fails at run time with a bare
  // "I can't find the format file", which says nothing about the real cause.
  const FMT = 'swiftlatexxetex.fmt'
  const fmtPath = join(OUT, FMT)
  const preserved = existsSync(fmtPath) ? readFileSync(fmtPath) : null
  if (!preserved) {
    console.warn(`Warning: ${FMT} is not present and cannot be regenerated by this`)
    console.warn('script. The browser will fail to compile until it is restored.')
  }

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  if (preserved) writeFileSync(fmtPath, preserved)

  const claimed = new Map<string, string>()
  let bytes = 0
  for (const src of sources) {
    const name = basename(src)
    const previous = claimed.get(name)
    if (previous && previous !== src) {
      console.error(`Name collision on "${name}" — the flat tree cannot hold both:`)
      console.error(`  ${previous}\n  ${src}`)
      process.exit(1)
    }
    claimed.set(name, src)
    copyFileSync(src, join(OUT, name))
    bytes += readFileSync(src).byteLength
  }

  rmSync(WORK, { recursive: true, force: true })
  console.log(
    `Bundled ${claimed.size} files into public/texlive (${(bytes / 1048576).toFixed(1)} MB)`,
  )
  console.log('The XeTeX format file is a separate artifact — see scripts/README.md.')
}

main()
