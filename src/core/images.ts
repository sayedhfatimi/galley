/**
 * Which images galley can typeset, and what they are called. Pure — no DOM.
 *
 * ## One name, chosen once
 *
 * A filename here has to satisfy four consumers at once: the Markdown the
 * reader keeps, the key the attached bytes are stored under, the path those
 * bytes are written to inside the engine, and the argument to
 * `\includegraphics`. That last one is the strict one — graphicx TOKENISES its
 * argument, so a space, `#`, `%`, `_`, `&` or a brace in a filename breaks the
 * document rather than just the picture.
 *
 * Rather than escape at the point of use and hope four places agree, the name
 * is sanitised ONCE when the file is attached, and that is the name everywhere.
 *
 * ## What is supported
 *
 * `xetex.def` declares `.bmp .eps .jpeg .jpg .pdf .png .ps` to graphicx. PNG,
 * JPEG and PDF are read directly by both XeTeX and dvipdfmx, so those are
 * offered. EPS and PostScript are declared but need a conversion step this
 * build has no path for, and SVG is not declared at all — refusing them plainly
 * beats emitting a document that dies at render time.
 */

export const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf'] as const

export type SupportedImageExtension = (typeof SUPPORTED_IMAGE_EXTENSIONS)[number]

export type ImageClassification =
  /** Can be typeset, under this name. */
  | { kind: 'supported'; name: string; extension: SupportedImageExtension }
  /**
   * Names a host rather than a file. galley will not fetch it: reaching the
   * network for a document the reader merely pasted is the one thing
   * client-side compilation exists to rule out.
   */
  | { kind: 'remote' }
  | { kind: 'unsupported-format'; extension: string }

/** Anything shaped like `scheme:` — http, https, data, ftp — is not a local file. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

const COMBINING_MARKS = /[̀-ͯ]/g

/**
 * A filename `\includegraphics` can take verbatim.
 *
 * Deliberately conservative: ASCII letters and digits only, everything else
 * folded to a dash. A plainer name costs nothing; a name TeX mis-tokenises
 * costs the whole document.
 */
export function sanitizeImageName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : ''

  const safeStem =
    stem
      .normalize('NFKD')
      .replace(COMBINING_MARKS, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'image'

  return `${safeStem}${ext.replace(/[^a-z0-9.]/g, '')}`
}

export function classifyImage(url: string): ImageClassification {
  if (HAS_SCHEME.test(url)) return { kind: 'remote' }

  const name = sanitizeImageName(url)
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot) : ''

  if (!isSupported(extension)) {
    return { kind: 'unsupported-format', extension: extension || '(none)' }
  }
  return { kind: 'supported', name, extension }
}

function isSupported(ext: string): ext is SupportedImageExtension {
  return (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

/** For the notice a reader sees, and for the file picker's accept list. */
export const SUPPORTED_IMAGE_LIST = SUPPORTED_IMAGE_EXTENSIONS.map((e) =>
  e.slice(1).toUpperCase(),
).join(', ')

/**
 * Formats a browser can draw in an `<img>`.
 *
 * A PDF is a perfectly good figure — XeTeX and dvipdfmx both read one — but no
 * browser renders it in an image element. Pointing an `<img>` at PDF bytes
 * fails to load and collapses to nothing, so the editor showed the writer an
 * empty space where their figure was. The placeholder is kept for those.
 */
export const PREVIEWABLE_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'] as const

export function isPreviewable(name: string): boolean {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : ''
  return (PREVIEWABLE_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}
