import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, presetFor } from '../config'
import { frontmatterData } from '../markdown/frontmatter'
import { parseMarkdown } from '../markdown/parse'
import { readBookConfig, writeBookConfig } from './config'

const read = (source: string) => readBookConfig(frontmatterData(parseMarkdown(source)))

describe('readBookConfig', () => {
  it('reads nothing from a file with no book block', () => {
    expect(read('---\ntitle: T\n---\n')).toEqual({})
  })

  it('reads each field', () => {
    const config = read(
      '---\nbook:\n  character: book\n  paper: royal\n  two_sided: true\n' +
        '  font_size: 12\n  typeface: pagella\n  line_spacing: onehalf\n' +
        '  toc: { include: true, depth: 0 }\n  sections: { numbered: false }\n' +
        '  chapters: { start_on_new_page: true, force_recto: true }\n' +
        '  links: { footnote_urls: false }\n  print_target: kdp\n' +
        '  margins: { top: 20, bottom: 22, inner: 22, outer: 18, unit: mm }\n---\n',
    )
    expect(config).toEqual({
      character: 'book',
      paper: { kind: 'named', name: 'royal' },
      twoSided: true,
      fontSize: 12,
      typeface: 'pagella',
      lineSpacing: 'onehalf',
      toc: { include: true, depth: 0 },
      sections: { numbered: false },
      chapters: { startOnNewPage: true, forceRecto: true },
      links: { footnoteUrls: false },
      printTarget: 'kdp',
      margins: { top: 20, bottom: 22, inner: 22, outer: 18, unit: 'mm' },
    })
  })

  it('reads a custom paper size', () => {
    const config = read(
      '---\nbook:\n  paper: { width: 200, height: 300, unit: in }\n---\n',
    )
    expect(config).toEqual({
      paper: { kind: 'custom', width: 200, height: 300, unit: 'in' },
    })
  })

  it('ignores values outside the supported sets rather than throwing', () => {
    expect(
      read('---\nbook:\n  character: novella\n  typeface: comic\n  font_size: 42\n---\n'),
    ).toEqual({})
  })

  it('ignores an unsupported paper name rather than accepting it', () => {
    // "letter-half" is not a key in PAPER_SIZES and has no width/height/unit,
    // so it must be rejected as a named size AND fail the custom-paper shape —
    // not merely rejected for one of those two reasons.
    expect(read('---\nbook:\n  paper: letter-half\n---\n')).toEqual({})
  })

  it('drops margins entirely when one side is missing, rather than a partial box', () => {
    expect(
      read('---\nbook:\n  margins: { top: 20, bottom: 22, inner: 22, unit: mm }\n---\n'),
    ).toEqual({})
  })

  it('ignores a galley: block — that key answers a different question', () => {
    expect(read('---\ngalley:\n  character: book\n---\n')).toEqual({})
  })

  it('never throws on hostile input', () => {
    for (const source of [
      '---\nbook: 3\n---\n',
      '---\nbook:\n  - a\n---\n',
      '---\nbook:\n  toc: 7\n---\n',
    ]) {
      expect(() => read(source)).not.toThrow()
    }
  })
})

describe('writeBookConfig', () => {
  it('round-trips every field', () => {
    // Every field is set away from DEFAULT_CONFIG's own value, including the
    // ones `presetFor('book')` leaves at the default (fontSize, typeface,
    // links, sections) — otherwise a field dropped by BOTH the writer and the
    // reader would round-trip back to the same default it started at, and this
    // test would pass regardless.
    const config = {
      ...presetFor('book'),
      printTarget: 'kdp' as const,
      fontSize: 12 as const,
      typeface: 'pagella' as const,
      links: { footnoteUrls: false },
      sections: { numbered: false },
    }
    expect(config.fontSize).not.toBe(DEFAULT_CONFIG.fontSize)
    expect(config.typeface).not.toBe(DEFAULT_CONFIG.typeface)
    expect(config.links).not.toEqual(DEFAULT_CONFIG.links)
    expect(config.sections).not.toEqual(DEFAULT_CONFIG.sections)

    const written = writeBookConfig('---\ntitle: A Book\n---\n', config)
    const back = read(written)
    expect({ ...DEFAULT_CONFIG, ...back, metadata: {} }).toEqual({
      ...config,
      metadata: {},
    })
  })

  it('round-trips a custom paper size', () => {
    const config = {
      ...presetFor('article'),
      paper: { kind: 'custom' as const, width: 200, height: 300, unit: 'in' as const },
    }
    const written = writeBookConfig('---\ntitle: A Book\n---\n', config)
    expect(read(written)).toMatchObject({ paper: config.paper })
  })

  it('preserves the author’s other keys', () => {
    const written = writeBookConfig(
      '---\ntitle: A Book\nauthor: A. Writer\n---\n',
      presetFor('book'),
    )
    expect(written).toContain('title: A Book')
    expect(written).toContain('author: A. Writer')
  })

  it('returns the source unchanged when the frontmatter cannot be rewritten', () => {
    const src = '---\na: 1\na: 2\n---\n'
    expect(writeBookConfig(src, presetFor('book'))).toBe(src)
  })
})
