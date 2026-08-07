/*
 * Lazy MathJax singleton.
 *
 * TeX input → SVG output. SVG is self-contained, so no fonts load on the
 * client, and it inherits the surrounding text colour via currentColor — which
 * means it follows the light and dark themes for free.
 *
 * The mathjax-full bundle is heavy (~200KB gzipped), so it is dynamically
 * imported here rather than landing in the initial chunk. It loads the first
 * time a maths node mounts and is cached for the rest of the session.
 */

type MathJaxBundle = {
  adaptor: {
    outerHTML: (node: unknown) => string
  }
  html: {
    convert: (tex: string, options: { display: boolean }) => unknown
  }
}

let bundlePromise: Promise<MathJaxBundle> | null = null

async function loadMathJax(): Promise<MathJaxBundle> {
  if (bundlePromise) return bundlePromise

  bundlePromise = (async () => {
    const [
      { mathjax },
      { TeX },
      { SVG },
      { liteAdaptor },
      { RegisterHTMLHandler },
      { AllPackages },
    ] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
    ])

    const adaptor = liteAdaptor()
    RegisterHTMLHandler(adaptor)

    const tex = new TeX({ packages: AllPackages })
    const svg = new SVG({ fontCache: 'local' })
    const html = mathjax.document('', {
      InputJax: tex,
      OutputJax: svg,
    })

    return {
      adaptor: adaptor as unknown as MathJaxBundle['adaptor'],
      html: html as unknown as MathJaxBundle['html'],
    }
  })()

  return bundlePromise
}

/*
 * Render a TeX string to an HTML string containing `<mjx-container>` +
 * `<svg>`. Returns "" on empty input. Throws on TeX syntax errors —
 * callers should catch and render a fallback (greyed source).
 */
export async function renderTex(tex: string, display: boolean): Promise<string> {
  if (!tex.trim()) return ''
  const { adaptor, html } = await loadMathJax()
  const node = html.convert(tex, { display })
  return adaptor.outerHTML(node)
}
