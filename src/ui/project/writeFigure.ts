import { classifyImage, SUPPORTED_IMAGE_LIST } from '@/core/images'

/**
 * Putting a dropped picture into the author's folder, and never on top of
 * something already there.
 *
 * This is the one place galley CREATES a file in someone's vault, so the rule
 * is narrow: beside the chapter that received the drop, under a name the
 * author has agreed to, and never over an existing file. Overwriting a figure
 * has no undo — the bytes that were there are simply gone — so it is not
 * offered even as a confirmation.
 */

/** Where a figure would go, and whether something is already there. */
export interface FigurePlacement {
  /** Project-relative path the file would be written to. */
  path: string
  /** Directory segments, relative to the project root. */
  directory: string[]
  name: string
}

export function directoryOf(partPath: string): string[] {
  const segments = partPath.split('/')
  segments.pop()
  return segments
}

/**
 * A reference from one file to another, as the author would write it.
 *
 * Relative to the chapter, because that is what `buildFigureResolver` tries
 * first and what Obsidian shows. A figure beside the chapter is just its name.
 */
export function relativeReference(fromPart: string, figurePath: string): string {
  const from = directoryOf(fromPart)
  const to = figurePath.split('/')
  const name = to.pop() ?? figurePath

  let shared = 0
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) {
    shared += 1
  }
  const up = Array(from.length - shared).fill('..')
  const down = to.slice(shared)
  return [...up, ...down, name].join('/')
}

/**
 * The next free name in a directory, as a SUGGESTION.
 *
 * Offered pre-filled rather than applied: silently renaming someone's file is
 * a quieter surprise than refusing it, but it is still a surprise, and the
 * author is right there.
 */
export function suggestName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${stem}-${n}${extension}`
    if (!taken.has(candidate)) return candidate
  }
  return `${stem}-${Date.now()}${extension}`
}

export type FigureWrite =
  /** `handle` is returned so the caller can register the figure without re-walking. */
  | { ok: true; path: string; handle: FileSystemFileHandle }
  | { ok: false; reason: 'unsupported'; message: string }
  | { ok: false; reason: 'exists'; suggestion: string }
  | { ok: false; reason: 'failed' }

/**
 * Write `bytes` into the project, refusing rather than replacing.
 *
 * The existence check asks the DISK, not the figure list read when the project
 * was opened: another device may have added the file since, and a list from
 * five minutes ago is exactly the thing that would let this overwrite it.
 */
export async function writeFigure(
  root: FileSystemDirectoryHandle,
  placement: FigurePlacement,
  bytes: ArrayBuffer,
): Promise<FigureWrite> {
  const image = classifyImage(placement.name)
  if (image.kind !== 'supported') {
    return {
      ok: false,
      reason: 'unsupported',
      message: `${placement.name} cannot be typeset. Use ${SUPPORTED_IMAGE_LIST}.`,
    }
  }

  let directory: FileSystemDirectoryHandle
  try {
    directory = root
    for (const segment of placement.directory) {
      directory = await directory.getDirectoryHandle(segment, { create: true })
    }
  } catch {
    return { ok: false, reason: 'failed' }
  }

  try {
    await directory.getFileHandle(placement.name)
    // It exists. Asked for a different name rather than replaced.
    const taken = new Set<string>()
    for await (const [name] of directory.entries()) taken.add(name)
    return { ok: false, reason: 'exists', suggestion: suggestName(placement.name, taken) }
  } catch {
    // Not there, which is the only case that may proceed.
  }

  try {
    const handle = await directory.getFileHandle(placement.name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
    return { ok: true, path: placement.path, handle }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Write the rendered book into the project folder, replacing what is there.
 *
 * The ONE place galley overwrites a file on purpose, and it is safe precisely
 * because `book.pdf` is not a file anyone edits — it is output, regenerated
 * whole every time, and nothing in it is the author's typing.
 *
 * On request only. Every write into a synced folder is replicated, and a
 * multi-megabyte PDF rewritten on every render would be repeated traffic
 * against someone's quota for a file they asked for once.
 */
export async function writePdf(
  root: FileSystemDirectoryHandle,
  name: string,
  bytes: ArrayBuffer,
): Promise<boolean> {
  try {
    const handle = await root.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
    return true
  } catch {
    return false
  }
}
