import type { Editor } from '@tiptap/core'
import { classifyImage, SUPPORTED_IMAGE_LIST, sanitizeImageName } from '@/core/images'
import { putImage } from '@/ui/lib/imageStore'

/**
 * Take a file the reader has dropped or pasted, keep the bytes, and put an
 * image into the document.
 *
 * The name is decided HERE and nowhere else. `core/images.ts` explains why:
 * the Markdown, the store key, the engine's filesystem path and the
 * `\includegraphics` argument all have to be the same string, and
 * `\includegraphics` is the one with opinions about it.
 */
export async function attachImage(
  editor: Editor,
  file: File,
): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  const name = sanitizeImageName(file.name || 'image.png')
  const image = classifyImage(name)

  if (image.kind !== 'supported') {
    return {
      ok: false,
      reason: `${file.name || 'That file'} cannot be typeset. Use ${SUPPORTED_IMAGE_LIST}.`,
    }
  }

  const bytes = await file.arrayBuffer()
  const stored = await putImage(image.name, bytes)
  if (!stored) {
    return {
      ok: false,
      reason:
        'That image could not be saved in this browser, so it would not survive a reload. It has not been added.',
    }
  }

  // The alt text doubles as the figure's caption, and an empty one is better
  // than a filename masquerading as a caption the writer did not write.
  editor
    .chain()
    .focus()
    .insertContent({ type: 'image', attrs: { src: image.name } })
    .run()
  return { ok: true, name: image.name }
}

/**
 * Whether a dropped or pasted file is an attempt at a figure.
 *
 * MIME type first, because that is what a paste supplies and a screenshot has
 * no useful name. `application/pdf` has to be named explicitly: a PDF IS a
 * supported figure, but it is not `image/*`, and without this it falls through
 * to the "open it as the document" branch and replaces the manuscript with its
 * own bytes as text.
 *
 * A file with no MIME type at all — some file managers supply none — falls back
 * to what the name says. An unsupported image type still counts as an attempt,
 * so `attachImage` can refuse it by name rather than the caller silently
 * treating a picture as prose.
 */
export function looksLikeFigure(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  if (file.type === 'application/pdf') return true
  return (
    file.type === '' && classifyImage(sanitizeImageName(file.name)).kind === 'supported'
  )
}

/** Figure candidates from a drop or paste, ignoring anything that is not one. */
export function imageFilesFrom(list: FileList | DataTransferItemList | null): File[] {
  if (!list) return []
  const files: File[] = []
  for (const entry of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = 'getAsFile' in entry ? entry.getAsFile() : entry
    if (file && looksLikeFigure(file)) files.push(file)
  }
  return files
}
