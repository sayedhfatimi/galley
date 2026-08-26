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

/** Image files from a drop or paste, ignoring anything that is not one. */
export function imageFilesFrom(list: FileList | DataTransferItemList | null): File[] {
  if (!list) return []
  const files: File[] = []
  for (const entry of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = 'getAsFile' in entry ? entry.getAsFile() : entry
    if (file?.type.startsWith('image/')) files.push(file)
  }
  return files
}
