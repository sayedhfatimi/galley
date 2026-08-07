import { describe, expect, it } from 'vitest'
import { escapeText, escapeUrl, isVerbatimSafe } from './escape'

describe('escapeText', () => {
  it('leaves ordinary prose untouched', () => {
    expect(escapeText('The quick brown fox.')).toBe('The quick brown fox.')
  })

  it.each([
    ['#', '\\#'],
    ['$', '\\$'],
    ['%', '\\%'],
    ['&', '\\&'],
    ['_', '\\_'],
    ['{', '\\{'],
    ['}', '\\}'],
  ])('escapes %s with a backslash', (input, expected) => {
    expect(escapeText(input)).toBe(expected)
  })

  it.each([
    ['~', '\\textasciitilde{}'],
    ['^', '\\textasciicircum{}'],
    ['\\', '\\textbackslash{}'],
    ['`', '\\textasciigrave{}'],
  ])(
    'escapes %s with a command, since a backslash alone would be an accent',
    (input, expected) => {
      expect(escapeText(input)).toBe(expected)
    },
  )

  // The classic failure: escaping in sequential passes turns % into \% and then
  // into \textbackslash{}%. A single pass over the source is the only safe way.
  it('does not double-escape when a backslash precedes another special', () => {
    expect(escapeText('\\%')).toBe('\\textbackslash{}\\%')
  })

  it('does not re-escape its own output', () => {
    const once = escapeText('100% of a_b')
    expect(once).toBe('100\\% of a\\_b')
    expect(escapeText(once)).not.toBe(once)
  })

  it('handles a realistic filename', () => {
    expect(escapeText('my_file_name.txt')).toBe('my\\_file\\_name.txt')
  })

  it('handles several specials at once', () => {
    expect(escapeText('a & b # c % d')).toBe('a \\& b \\# c \\% d')
  })

  it('escapes a run of the same special', () => {
    expect(escapeText('###')).toBe('\\#\\#\\#')
  })

  // Ligatures=TeX is on, so `` and '' would become curly quotes. Escaping the
  // backtick keeps a literal backtick literal.
  it('prevents a double backtick from becoming an opening curly quote', () => {
    expect(escapeText('``')).toBe('\\textasciigrave{}\\textasciigrave{}')
  })

  // Hyphens and apostrophes are deliberately NOT escaped: their ligature
  // behaviour (-- en dash, --- em dash, ' right quote) is what a writer wants.
  it('leaves hyphens and apostrophes alone so TeX ligatures apply', () => {
    expect(escapeText("it's a well--known em---dash")).toBe(
      "it's a well--known em---dash",
    )
  })

  // Without this, Ligatures=TeX renders a bare " as a CLOSING curly quote on
  // both sides, so "hello" typesets as ”hello”. Found by compiling and reading
  // the PDF, not by string-matching.
  describe('directional double quotes', () => {
    it('opens and closes a quoted phrase correctly', () => {
      expect(escapeText('say "hello" now')).toBe('say “hello” now')
    })

    it('opens at the start of a run', () => {
      expect(escapeText('"quoted"')).toBe('“quoted”')
    })

    it('opens after an opening bracket or a dash', () => {
      expect(escapeText('("a")')).toBe('(“a”)')
      expect(escapeText('—"a"')).toBe('—“a”')
    })

    it('closes when it follows a word character or punctuation', () => {
      expect(escapeText('word" and')).toBe('word” and')
    })

    it('handles several quoted phrases in one run', () => {
      expect(escapeText('"a" and "b"')).toBe('“a” and “b”')
    })

    it('leaves apostrophes alone, since the ligature already renders them', () => {
      expect(escapeText("it's")).toBe("it's")
    })
  })

  it('passes non-ASCII through untouched, since XeTeX is Unicode-native', () => {
    expect(escapeText('naïve café Ωμέγα — “curly”')).toBe('naïve café Ωμέγα — “curly”')
  })

  it('returns an empty string unchanged', () => {
    expect(escapeText('')).toBe('')
  })
})

describe('escapeUrl', () => {
  // Inside \href the rules differ: % and # must survive as URL syntax, and
  // hyperref treats the argument mostly verbatim.
  it('escapes characters that would break the argument', () => {
    expect(escapeUrl('https://x.test/a%20b#frag')).toBe('https://x.test/a\\%20b\\#frag')
  })

  it('leaves an ordinary URL untouched', () => {
    expect(escapeUrl('https://example.com/path')).toBe('https://example.com/path')
  })

  it('escapes a tilde, which is common in URLs', () => {
    expect(escapeUrl('https://x.test/~user')).toBe('https://x.test/\\~user')
  })
})

describe('isVerbatimSafe', () => {
  // Code goes into a Verbatim environment unescaped, so the only real hazard is
  // content that closes the environment early.
  it('accepts ordinary code', () => {
    expect(isVerbatimSafe('const a = b % c & d')).toBe(true)
  })

  it('rejects content containing the closing delimiter', () => {
    expect(isVerbatimSafe('before\n\\end{Verbatim}\nafter')).toBe(false)
  })

  it('rejects the delimiter with surrounding whitespace', () => {
    expect(isVerbatimSafe('  \\end{Verbatim}  ')).toBe(false)
  })
})
