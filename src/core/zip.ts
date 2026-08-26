/**
 * A minimal ZIP writer. Pure — no DOM, no dependency.
 *
 * Exists because the `.tex` stopped being self-sufficient the moment galley
 * could place a figure: the source and the images it names have to travel
 * together or the document will not compile anywhere else. That is the whole
 * promise of handing over the LaTeX, so it cannot be left half-kept.
 *
 * STORED (uncompressed) entries only. Images are already PNG or JPEG, which
 * deflate cannot meaningfully shrink, and the `.tex` is a few kilobytes — so
 * compression would buy nothing and cost either a dependency or a DEFLATE
 * implementation to get wrong. A stored zip is a header, the bytes, and a
 * directory, and every unzipper reads it.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  bytes: Uint8Array
}

/**
 * MS-DOS date and time, which is what the format stores.
 *
 * Passed in rather than read from the clock so the output is deterministic and
 * testable; the caller decides what "now" means.
 */
export interface ZipStamp {
  year: number
  month: number
  day: number
  hours: number
  minutes: number
  seconds: number
}

function dosDateTime(s: ZipStamp): { date: number; time: number } {
  // The epoch is 1980, and seconds are stored in two-second units.
  const year = Math.max(0, s.year - 1980)
  return {
    date: (year << 9) | (s.month << 5) | s.day,
    time: (s.hours << 11) | (s.minutes << 5) | Math.floor(s.seconds / 2),
  }
}

export function createZip(
  entries: readonly ZipEntry[],
  stamp: ZipStamp,
  // Explicitly ArrayBuffer-backed rather than the ArrayBufferLike default, so
  // the result can be handed straight to a Blob without a copy or a cast.
): Uint8Array<ArrayBuffer> {
  const { date, time } = dosDateTime(stamp)
  const encoder = new TextEncoder()

  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.bytes)
    const size = entry.bytes.length

    const local = new Uint8Array(30 + name.length + size)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, 0, true) // method: stored
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true) // compressed
    lv.setUint32(22, size, true) // uncompressed
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true) // extra field length
    local.set(name, 30)
    local.set(entry.bytes, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true) // central directory header
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true) // stored
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comment
    cv.setUint16(34, 0, true) // disk number
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central directory
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const total = locals.reduce((n, l) => n + l.length, 0) + centralSize + end.length
  const out = new Uint8Array(total)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}
