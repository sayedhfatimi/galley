// biome-ignore-all lint/suspicious/noTemplateCurlyInString: TextMate-style ${N} placeholder convention for cursor slots — parsed by insertLatex.ts
/*
 * Typed catalog of LaTeX snippets surfaced by the toolbar inserter.
 *
 * Cell rendering rule:
 *   - `unicode` set → the cell renders that glyph directly (cheap).
 *   - `unicode` absent → the cell renders a MathJax SVG preview of
 *     `latex` (templates, multi-piece structures).
 *
 * Snippet placeholders:
 *   - `${1}`, `${2}`, … mark cursor slots. The insertion helper
 *     strips them from the inserted text and places the caret at
 *     slot 1. Slot 2+ are left as empty positions the user navigates
 *     to with arrow keys.
 *
 * Adding entries: just push to CATALOG. The filter input matches
 * `label`, `keywords[]`, and the `\<command>` extracted from `latex`.
 */

export type LatexCategory =
  | 'greek'
  | 'operators'
  | 'relations'
  | 'logic'
  | 'structures'
  | 'functions'

export type LatexEntry = {
  id: string
  category: LatexCategory
  latex: string
  label: string
  unicode?: string
  keywords: string[]
}

export const CATEGORY_LABELS: Record<LatexCategory, string> = {
  greek: 'Greek',
  operators: 'Operators',
  relations: 'Relations',
  logic: 'Logic',
  structures: 'Structures',
  functions: 'Functions',
}

// Order here drives tab order.
export const CATEGORY_ORDER: LatexCategory[] = [
  'greek',
  'operators',
  'relations',
  'logic',
  'structures',
  'functions',
]

export const CATALOG: LatexEntry[] = [
  // ─── Greek (lowercase) ───────────────────────────────────
  {
    id: 'alpha',
    category: 'greek',
    latex: '\\alpha',
    label: 'alpha',
    unicode: 'α',
    keywords: ['greek', 'alpha', 'a'],
  },
  {
    id: 'beta',
    category: 'greek',
    latex: '\\beta',
    label: 'beta',
    unicode: 'β',
    keywords: ['greek', 'beta', 'b'],
  },
  {
    id: 'gamma',
    category: 'greek',
    latex: '\\gamma',
    label: 'gamma',
    unicode: 'γ',
    keywords: ['greek', 'gamma', 'g'],
  },
  {
    id: 'delta',
    category: 'greek',
    latex: '\\delta',
    label: 'delta',
    unicode: 'δ',
    keywords: ['greek', 'delta', 'd'],
  },
  {
    id: 'epsilon',
    category: 'greek',
    latex: '\\epsilon',
    label: 'epsilon',
    unicode: 'ϵ',
    keywords: ['greek', 'epsilon', 'e'],
  },
  {
    id: 'varepsilon',
    category: 'greek',
    latex: '\\varepsilon',
    label: 'varepsilon',
    unicode: 'ε',
    keywords: ['greek', 'epsilon', 'var'],
  },
  {
    id: 'zeta',
    category: 'greek',
    latex: '\\zeta',
    label: 'zeta',
    unicode: 'ζ',
    keywords: ['greek', 'zeta', 'z'],
  },
  {
    id: 'eta',
    category: 'greek',
    latex: '\\eta',
    label: 'eta',
    unicode: 'η',
    keywords: ['greek', 'eta', 'n'],
  },
  {
    id: 'theta',
    category: 'greek',
    latex: '\\theta',
    label: 'theta',
    unicode: 'θ',
    keywords: ['greek', 'theta'],
  },
  {
    id: 'vartheta',
    category: 'greek',
    latex: '\\vartheta',
    label: 'vartheta',
    unicode: 'ϑ',
    keywords: ['greek', 'theta', 'var'],
  },
  {
    id: 'iota',
    category: 'greek',
    latex: '\\iota',
    label: 'iota',
    unicode: 'ι',
    keywords: ['greek', 'iota'],
  },
  {
    id: 'kappa',
    category: 'greek',
    latex: '\\kappa',
    label: 'kappa',
    unicode: 'κ',
    keywords: ['greek', 'kappa', 'k'],
  },
  {
    id: 'lambda',
    category: 'greek',
    latex: '\\lambda',
    label: 'lambda',
    unicode: 'λ',
    keywords: ['greek', 'lambda', 'l'],
  },
  {
    id: 'mu',
    category: 'greek',
    latex: '\\mu',
    label: 'mu',
    unicode: 'μ',
    keywords: ['greek', 'mu', 'm'],
  },
  {
    id: 'nu',
    category: 'greek',
    latex: '\\nu',
    label: 'nu',
    unicode: 'ν',
    keywords: ['greek', 'nu', 'v'],
  },
  {
    id: 'xi',
    category: 'greek',
    latex: '\\xi',
    label: 'xi',
    unicode: 'ξ',
    keywords: ['greek', 'xi', 'x'],
  },
  {
    id: 'pi',
    category: 'greek',
    latex: '\\pi',
    label: 'pi',
    unicode: 'π',
    keywords: ['greek', 'pi', 'p'],
  },
  {
    id: 'rho',
    category: 'greek',
    latex: '\\rho',
    label: 'rho',
    unicode: 'ρ',
    keywords: ['greek', 'rho', 'r'],
  },
  {
    id: 'sigma',
    category: 'greek',
    latex: '\\sigma',
    label: 'sigma',
    unicode: 'σ',
    keywords: ['greek', 'sigma', 's'],
  },
  {
    id: 'tau',
    category: 'greek',
    latex: '\\tau',
    label: 'tau',
    unicode: 'τ',
    keywords: ['greek', 'tau', 't'],
  },
  {
    id: 'upsilon',
    category: 'greek',
    latex: '\\upsilon',
    label: 'upsilon',
    unicode: 'υ',
    keywords: ['greek', 'upsilon', 'u'],
  },
  {
    id: 'phi',
    category: 'greek',
    latex: '\\phi',
    label: 'phi',
    unicode: 'ϕ',
    keywords: ['greek', 'phi', 'f'],
  },
  {
    id: 'varphi',
    category: 'greek',
    latex: '\\varphi',
    label: 'varphi',
    unicode: 'φ',
    keywords: ['greek', 'phi', 'var'],
  },
  {
    id: 'chi',
    category: 'greek',
    latex: '\\chi',
    label: 'chi',
    unicode: 'χ',
    keywords: ['greek', 'chi', 'x'],
  },
  {
    id: 'psi',
    category: 'greek',
    latex: '\\psi',
    label: 'psi',
    unicode: 'ψ',
    keywords: ['greek', 'psi'],
  },
  {
    id: 'omega',
    category: 'greek',
    latex: '\\omega',
    label: 'omega',
    unicode: 'ω',
    keywords: ['greek', 'omega', 'w'],
  },

  // ─── Greek (uppercase, distinct from Latin) ──────────────
  {
    id: 'Gamma',
    category: 'greek',
    latex: '\\Gamma',
    label: 'Gamma',
    unicode: 'Γ',
    keywords: ['greek', 'gamma', 'cap'],
  },
  {
    id: 'Delta',
    category: 'greek',
    latex: '\\Delta',
    label: 'Delta',
    unicode: 'Δ',
    keywords: ['greek', 'delta', 'cap'],
  },
  {
    id: 'Theta',
    category: 'greek',
    latex: '\\Theta',
    label: 'Theta',
    unicode: 'Θ',
    keywords: ['greek', 'theta', 'cap'],
  },
  {
    id: 'Lambda',
    category: 'greek',
    latex: '\\Lambda',
    label: 'Lambda',
    unicode: 'Λ',
    keywords: ['greek', 'lambda', 'cap'],
  },
  {
    id: 'Xi',
    category: 'greek',
    latex: '\\Xi',
    label: 'Xi',
    unicode: 'Ξ',
    keywords: ['greek', 'xi', 'cap'],
  },
  {
    id: 'Pi',
    category: 'greek',
    latex: '\\Pi',
    label: 'Pi',
    unicode: 'Π',
    keywords: ['greek', 'pi', 'cap'],
  },
  {
    id: 'Sigma',
    category: 'greek',
    latex: '\\Sigma',
    label: 'Sigma',
    unicode: 'Σ',
    keywords: ['greek', 'sigma', 'cap'],
  },
  {
    id: 'Upsilon',
    category: 'greek',
    latex: '\\Upsilon',
    label: 'Upsilon',
    unicode: 'Υ',
    keywords: ['greek', 'upsilon', 'cap'],
  },
  {
    id: 'Phi',
    category: 'greek',
    latex: '\\Phi',
    label: 'Phi',
    unicode: 'Φ',
    keywords: ['greek', 'phi', 'cap'],
  },
  {
    id: 'Psi',
    category: 'greek',
    latex: '\\Psi',
    label: 'Psi',
    unicode: 'Ψ',
    keywords: ['greek', 'psi', 'cap'],
  },
  {
    id: 'Omega',
    category: 'greek',
    latex: '\\Omega',
    label: 'Omega',
    unicode: 'Ω',
    keywords: ['greek', 'omega', 'cap'],
  },

  // ─── Operators ───────────────────────────────────────────
  {
    id: 'sum',
    category: 'operators',
    latex: '\\sum',
    label: 'sum',
    unicode: '∑',
    keywords: ['sum', 'sigma'],
  },
  {
    id: 'prod',
    category: 'operators',
    latex: '\\prod',
    label: 'product',
    unicode: '∏',
    keywords: ['product', 'prod'],
  },
  {
    id: 'int',
    category: 'operators',
    latex: '\\int',
    label: 'integral',
    unicode: '∫',
    keywords: ['int', 'integral'],
  },
  {
    id: 'oint',
    category: 'operators',
    latex: '\\oint',
    label: 'contour integral',
    unicode: '∮',
    keywords: ['oint', 'contour'],
  },
  {
    id: 'partial',
    category: 'operators',
    latex: '\\partial',
    label: 'partial',
    unicode: '∂',
    keywords: ['partial', 'del'],
  },
  {
    id: 'nabla',
    category: 'operators',
    latex: '\\nabla',
    label: 'nabla',
    unicode: '∇',
    keywords: ['nabla', 'del', 'grad'],
  },
  {
    id: 'infty',
    category: 'operators',
    latex: '\\infty',
    label: 'infinity',
    unicode: '∞',
    keywords: ['inf', 'infinity'],
  },
  {
    id: 'pm',
    category: 'operators',
    latex: '\\pm',
    label: 'plus-minus',
    unicode: '±',
    keywords: ['plus', 'minus', 'pm'],
  },
  {
    id: 'mp',
    category: 'operators',
    latex: '\\mp',
    label: 'minus-plus',
    unicode: '∓',
    keywords: ['minus', 'plus', 'mp'],
  },
  {
    id: 'times',
    category: 'operators',
    latex: '\\times',
    label: 'times',
    unicode: '×',
    keywords: ['times', 'multiply', 'cross'],
  },
  {
    id: 'div',
    category: 'operators',
    latex: '\\div',
    label: 'divide',
    unicode: '÷',
    keywords: ['divide', 'div'],
  },
  {
    id: 'cdot',
    category: 'operators',
    latex: '\\cdot',
    label: 'centered dot',
    unicode: '⋅',
    keywords: ['cdot', 'dot', 'multiply'],
  },
  {
    id: 'circ',
    category: 'operators',
    latex: '\\circ',
    label: 'circle',
    unicode: '∘',
    keywords: ['circ', 'compose'],
  },
  {
    id: 'oplus',
    category: 'operators',
    latex: '\\oplus',
    label: 'oplus',
    unicode: '⊕',
    keywords: ['plus', 'circle'],
  },
  {
    id: 'otimes',
    category: 'operators',
    latex: '\\otimes',
    label: 'otimes',
    unicode: '⊗',
    keywords: ['times', 'tensor'],
  },

  // ─── Relations ───────────────────────────────────────────
  {
    id: 'neq',
    category: 'relations',
    latex: '\\neq',
    label: 'not equal',
    unicode: '≠',
    keywords: ['not', 'equal', 'neq'],
  },
  {
    id: 'leq',
    category: 'relations',
    latex: '\\leq',
    label: 'less than or equal',
    unicode: '≤',
    keywords: ['less', 'leq', 'le'],
  },
  {
    id: 'geq',
    category: 'relations',
    latex: '\\geq',
    label: 'greater than or equal',
    unicode: '≥',
    keywords: ['greater', 'geq', 'ge'],
  },
  {
    id: 'll',
    category: 'relations',
    latex: '\\ll',
    label: 'much less',
    unicode: '≪',
    keywords: ['ll', 'much', 'less'],
  },
  {
    id: 'gg',
    category: 'relations',
    latex: '\\gg',
    label: 'much greater',
    unicode: '≫',
    keywords: ['gg', 'much', 'greater'],
  },
  {
    id: 'approx',
    category: 'relations',
    latex: '\\approx',
    label: 'approximately',
    unicode: '≈',
    keywords: ['approx', 'almost'],
  },
  {
    id: 'sim',
    category: 'relations',
    latex: '\\sim',
    label: 'similar',
    unicode: '∼',
    keywords: ['sim', 'tilde'],
  },
  {
    id: 'equiv',
    category: 'relations',
    latex: '\\equiv',
    label: 'equivalent',
    unicode: '≡',
    keywords: ['equiv', 'equal'],
  },
  {
    id: 'propto',
    category: 'relations',
    latex: '\\propto',
    label: 'proportional',
    unicode: '∝',
    keywords: ['propto', 'proportional'],
  },
  {
    id: 'in',
    category: 'relations',
    latex: '\\in',
    label: 'in',
    unicode: '∈',
    keywords: ['in', 'element', 'of'],
  },
  {
    id: 'notin',
    category: 'relations',
    latex: '\\notin',
    label: 'not in',
    unicode: '∉',
    keywords: ['not', 'in'],
  },
  {
    id: 'subset',
    category: 'relations',
    latex: '\\subset',
    label: 'subset',
    unicode: '⊂',
    keywords: ['subset'],
  },
  {
    id: 'subseteq',
    category: 'relations',
    latex: '\\subseteq',
    label: 'subset or equal',
    unicode: '⊆',
    keywords: ['subset', 'equal'],
  },
  {
    id: 'supset',
    category: 'relations',
    latex: '\\supset',
    label: 'superset',
    unicode: '⊃',
    keywords: ['supset'],
  },
  {
    id: 'to',
    category: 'relations',
    latex: '\\to',
    label: 'to',
    unicode: '→',
    keywords: ['to', 'arrow', 'right'],
  },
  {
    id: 'leftrightarrow',
    category: 'relations',
    latex: '\\leftrightarrow',
    label: 'left-right arrow',
    unicode: '↔',
    keywords: ['arrow', 'both'],
  },

  // ─── Logic ───────────────────────────────────────────────
  {
    id: 'forall',
    category: 'logic',
    latex: '\\forall',
    label: 'for all',
    unicode: '∀',
    keywords: ['forall', 'all', 'every'],
  },
  {
    id: 'exists',
    category: 'logic',
    latex: '\\exists',
    label: 'exists',
    unicode: '∃',
    keywords: ['exists', 'some'],
  },
  {
    id: 'nexists',
    category: 'logic',
    latex: '\\nexists',
    label: 'does not exist',
    unicode: '∄',
    keywords: ['not', 'exists'],
  },
  {
    id: 'neg',
    category: 'logic',
    latex: '\\neg',
    label: 'not',
    unicode: '¬',
    keywords: ['neg', 'not'],
  },
  {
    id: 'land',
    category: 'logic',
    latex: '\\land',
    label: 'and',
    unicode: '∧',
    keywords: ['and', 'land', 'wedge'],
  },
  {
    id: 'lor',
    category: 'logic',
    latex: '\\lor',
    label: 'or',
    unicode: '∨',
    keywords: ['or', 'lor', 'vee'],
  },
  {
    id: 'implies',
    category: 'logic',
    latex: '\\implies',
    label: 'implies',
    unicode: '⇒',
    keywords: ['implies', 'right', 'arrow'],
  },
  {
    id: 'iff',
    category: 'logic',
    latex: '\\iff',
    label: 'if and only if',
    unicode: '⇔',
    keywords: ['iff', 'biconditional'],
  },
  {
    id: 'emptyset',
    category: 'logic',
    latex: '\\emptyset',
    label: 'empty set',
    unicode: '∅',
    keywords: ['empty', 'set', 'null'],
  },
  {
    id: 'top',
    category: 'logic',
    latex: '\\top',
    label: 'top',
    unicode: '⊤',
    keywords: ['top', 'true'],
  },
  {
    id: 'bot',
    category: 'logic',
    latex: '\\bot',
    label: 'bottom',
    unicode: '⊥',
    keywords: ['bot', 'false', 'perp'],
  },

  // ─── Structures (templates — MathJax preview, slot cursors) ──
  {
    id: 'frac',
    category: 'structures',
    latex: '\\frac{${1}}{${2}}',
    label: 'fraction',
    keywords: ['frac', 'fraction', 'divide'],
  },
  {
    id: 'sqrt',
    category: 'structures',
    latex: '\\sqrt{${1}}',
    label: 'square root',
    keywords: ['sqrt', 'root'],
  },
  {
    id: 'sqrt-n',
    category: 'structures',
    latex: '\\sqrt[${1}]{${2}}',
    label: 'nth root',
    keywords: ['sqrt', 'root', 'nth'],
  },
  {
    id: 'sum-bounds',
    category: 'structures',
    latex: '\\sum_{${1}}^{${2}}',
    label: 'sum with bounds',
    keywords: ['sum', 'sigma', 'bounds'],
  },
  {
    id: 'prod-bounds',
    category: 'structures',
    latex: '\\prod_{${1}}^{${2}}',
    label: 'product with bounds',
    keywords: ['product', 'prod', 'bounds'],
  },
  {
    id: 'int-bounds',
    category: 'structures',
    latex: '\\int_{${1}}^{${2}}',
    label: 'integral with bounds',
    keywords: ['int', 'integral', 'bounds'],
  },
  {
    id: 'lim',
    category: 'structures',
    latex: '\\lim_{${1} \\to ${2}}',
    label: 'limit',
    keywords: ['lim', 'limit'],
  },
  {
    id: 'pmatrix',
    category: 'structures',
    latex: '\\begin{pmatrix} ${1} & ${2} \\\\ ${3} & ${4} \\end{pmatrix}',
    label: 'parentheses matrix',
    keywords: ['matrix', 'pmatrix', 'parens'],
  },
  {
    id: 'bmatrix',
    category: 'structures',
    latex: '\\begin{bmatrix} ${1} & ${2} \\\\ ${3} & ${4} \\end{bmatrix}',
    label: 'bracket matrix',
    keywords: ['matrix', 'bmatrix', 'brackets'],
  },
  {
    id: 'cases',
    category: 'structures',
    latex: '\\begin{cases} ${1} & ${2} \\\\ ${3} & ${4} \\end{cases}',
    label: 'cases',
    keywords: ['cases', 'piecewise'],
  },

  // ─── Functions ───────────────────────────────────────────
  {
    id: 'sin',
    category: 'functions',
    latex: '\\sin',
    label: 'sin',
    keywords: ['sin', 'sine', 'trig'],
  },
  {
    id: 'cos',
    category: 'functions',
    latex: '\\cos',
    label: 'cos',
    keywords: ['cos', 'cosine', 'trig'],
  },
  {
    id: 'tan',
    category: 'functions',
    latex: '\\tan',
    label: 'tan',
    keywords: ['tan', 'tangent', 'trig'],
  },
  {
    id: 'log',
    category: 'functions',
    latex: '\\log',
    label: 'log',
    keywords: ['log'],
  },
  {
    id: 'ln',
    category: 'functions',
    latex: '\\ln',
    label: 'ln',
    keywords: ['ln', 'log', 'natural'],
  },
  {
    id: 'exp',
    category: 'functions',
    latex: '\\exp',
    label: 'exp',
    keywords: ['exp', 'exponential'],
  },
  {
    id: 'fn-lim',
    category: 'functions',
    latex: '\\lim',
    label: 'lim',
    keywords: ['lim', 'limit'],
  },
  {
    id: 'max',
    category: 'functions',
    latex: '\\max',
    label: 'max',
    keywords: ['max', 'maximum'],
  },
  {
    id: 'min',
    category: 'functions',
    latex: '\\min',
    label: 'min',
    keywords: ['min', 'minimum'],
  },
  {
    id: 'hat',
    category: 'functions',
    latex: '\\hat{${1}}',
    label: 'hat',
    keywords: ['hat', 'accent'],
  },
  {
    id: 'bar',
    category: 'functions',
    latex: '\\bar{${1}}',
    label: 'bar',
    keywords: ['bar', 'accent'],
  },
  {
    id: 'vec',
    category: 'functions',
    latex: '\\vec{${1}}',
    label: 'vector',
    keywords: ['vec', 'vector', 'arrow'],
  },
]

/** Catalog grouped by category, in CATEGORY_ORDER. */
export function groupedCatalog(): Array<{
  category: LatexCategory
  entries: LatexEntry[]
}> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    entries: CATALOG.filter((e) => e.category === category),
  }))
}

/** Case-insensitive substring filter across label, keywords, latex command. */
export function filterCatalog(query: string): LatexEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return CATALOG
  return CATALOG.filter((entry) => {
    if (entry.label.toLowerCase().includes(q)) return true
    if (entry.id.toLowerCase().includes(q)) return true
    if (entry.latex.toLowerCase().includes(q)) return true
    if (entry.keywords.some((k) => k.toLowerCase().includes(q))) return true
    return false
  })
}
