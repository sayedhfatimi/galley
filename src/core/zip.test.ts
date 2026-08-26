import { describe, expect, it } from 'vitest'
import { createZip, type ZipStamp } from './zip'

const STAMP: ZipStamp = {
  year: 2026,
  month: 8,
  day: 26,
  hours: 12,
  minutes: 30,
  seconds: 0,
}

const bytes = (s: string) => new TextEncoder().encode(s)
const u32 = (a: Uint8Array, at: number) => new DataView(a.buffer).getUint32(at, true)
const u16 = (a: Uint8Array, at: number) => new DataView(a.buffer).getUint16(at, true)

/**
 * Verified against the real thing, not only against these assertions: the
 * output was written to disk and `unzip -t` confirmed both entries and their
 * CRCs, `unzip -l` read back the 2026-08-26 12:30 stamp, and the extracted
 * .tex compiled with xelatex. These tests pin what that run proved.
 */
describe('createZip', () => {
  it('starts with a local file header and ends with a central directory', () => {
    const zip = createZip([{ name: 'a.txt', bytes: bytes('hello') }], STAMP)
    expect(u32(zip, 0)).toBe(0x04034b50)
    expect(u32(zip, zip.length - 22)).toBe(0x06054b50)
  })

  it('stores rather than compresses, so no DEFLATE is needed to read it', () => {
    const zip = createZip([{ name: 'a.txt', bytes: bytes('hello') }], STAMP)
    expect(u16(zip, 8)).toBe(0)
    // Stored means the two sizes agree.
    expect(u32(zip, 18)).toBe(5)
    expect(u32(zip, 22)).toBe(5)
  })

  it('writes the content verbatim', () => {
    const zip = createZip([{ name: 'a.txt', bytes: bytes('hello') }], STAMP)
    const name = 30
    expect(new TextDecoder().decode(zip.slice(name, name + 5))).toBe('a.txt')
    expect(new TextDecoder().decode(zip.slice(name + 5, name + 10))).toBe('hello')
  })

  it('records every entry in the central directory', () => {
    const zip = createZip(
      [
        { name: 'a.tex', bytes: bytes('x') },
        { name: 'b.png', bytes: new Uint8Array([1, 2, 3]) },
      ],
      STAMP,
    )
    expect(u16(zip, zip.length - 22 + 8)).toBe(2)
    expect(u16(zip, zip.length - 22 + 10)).toBe(2)
  })

  it('encodes the DOS date from the 1980 epoch', () => {
    const zip = createZip([{ name: 'a', bytes: bytes('') }], STAMP)
    // (2026-1980) << 9 | 8 << 5 | 26
    expect(u16(zip, 12)).toBe((46 << 9) | (8 << 5) | 26)
    // Seconds are stored in two-second units.
    expect(u16(zip, 10)).toBe((12 << 11) | (30 << 5) | 0)
  })

  it('produces a readable archive with no entries at all', () => {
    const zip = createZip([], STAMP)
    expect(zip.length).toBe(22)
    expect(u32(zip, 0)).toBe(0x06054b50)
  })

  it('gives different content different CRCs', () => {
    const a = createZip([{ name: 'f', bytes: bytes('one') }], STAMP)
    const b = createZip([{ name: 'f', bytes: bytes('two') }], STAMP)
    expect(u32(a, 14)).not.toBe(u32(b, 14))
  })
})
