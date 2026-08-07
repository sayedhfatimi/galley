/**
 * The finished page count, read from the typesetter's own log.
 *
 * Not from the PDF bytes: dvipdfmx packs the page objects into compressed
 * object streams, so scanning the file for page dictionaries finds nothing.
 * TeX states the count outright at the end of the run, and that is the number
 * the typesetter actually produced.
 *
 * The engine writes `.xdv` on the first stage and `.pdf` on the second, and
 * says "1 page" rather than "1 pages" for a single one, so the pattern accepts
 * both. The LAST match wins, since the log holds one line per stage.
 */
const OUTPUT_LINE = /Output written on [^\n(]*\((\d+)\s+pages?/g

export function pageCountFromLog(log: string): number | null {
  let count: number | null = null
  for (const match of log.matchAll(OUTPUT_LINE)) {
    const parsed = Number(match[1])
    if (Number.isFinite(parsed)) count = parsed
  }
  return count
}
