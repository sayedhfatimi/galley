import { isSupported } from '@/core/images'
import type { SourceFile } from '@/core/project/read'

/**
 * Read a project folder off disk into the shape `readProject` expects.
 *
 * ## The dotfolder rule is about ENUMERATION, not filtering
 *
 * `readProject` already drops any path with a dot-prefixed segment, so
 * filtering here would be a second copy of one fact. This is not that: the
 * requirement is that galley never *enumerates* inside `.obsidian/`, and a
 * walk that descends and then discards has already read every file in it.
 * On a real vault that is most of the I/O, and `.obsidian/` is the
 * application's private state — a plugin's cache is not galley's business to
 * page through. So the descent stops at the directory, and
 * `walk.test.ts` asserts it on the enumeration count rather than on the
 * result, because a result-only test passes either way.
 *
 * `readProject`'s own filter stays. Two mechanisms, deliberately: it is pure
 * and protects every caller, this one protects the reader's disk.
 */

/** The largest file galley will read. Shared with the editor's own guard. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024

export interface ProjectContents {
  markdown: SourceFile[]
  /** Project-relative paths of every image file found. */
  assetPaths: string[]
  /** Every readable file, by project-relative path, for reading and writing later. */
  handles: Map<string, FileSystemFileHandle>
  /**
   * When each Markdown file was last written, captured during the read that
   * was happening anyway. Every later write is checked against this, and
   * re-reading the whole project to learn it would be a second pass over the
   * disk for something already in hand.
   */
  modified: Map<string, number>
  /** Files skipped for being too large, so the UI can say so rather than lose them silently. */
  skipped: string[]
}

function hidden(name: string): boolean {
  return name.startsWith('.')
}

function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name)
}

function isImage(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return isSupported(dot > 0 ? name.slice(dot).toLowerCase() : '')
}

/**
 * Every Markdown file and every figure in the folder, with the handles needed
 * to read and write them later.
 *
 * Never throws: a directory that cannot be read is skipped rather than
 * failing the open. A vault is someone's real disk, and one unreadable
 * folder is not a reason to refuse the other twenty-four chapters.
 */
export async function walkProject(
  root: FileSystemDirectoryHandle,
): Promise<ProjectContents> {
  const markdown: SourceFile[] = []
  const assetPaths: string[] = []
  const handles = new Map<string, FileSystemFileHandle>()
  const modified = new Map<string, number>()
  const skipped: string[] = []

  const descend = async (directory: FileSystemDirectoryHandle, prefix: string) => {
    let entries: AsyncIterable<[string, FileSystemHandle]>
    try {
      entries = directory.entries() as AsyncIterable<[string, FileSystemHandle]>
    } catch {
      return
    }
    try {
      for await (const [name, handle] of entries) {
        // Checked BEFORE descending, which is the whole point.
        if (hidden(name)) continue
        const path = prefix === '' ? name : `${prefix}/${name}`

        if (handle.kind === 'directory') {
          await descend(handle as FileSystemDirectoryHandle, path)
          continue
        }
        if (!isMarkdown(name) && !isImage(name)) continue

        const fileHandle = handle as FileSystemFileHandle
        handles.set(path, fileHandle)

        if (isImage(name)) {
          assetPaths.push(path)
          continue
        }
        try {
          const file = await fileHandle.getFile()
          // The editor refuses a 2 MB paste; a file read off disk went
          // through no such guard at all before this.
          if (file.size > MAX_FILE_BYTES) {
            skipped.push(path)
            handles.delete(path)
            continue
          }
          markdown.push({ path, source: await file.text() })
          modified.set(path, file.lastModified)
        } catch {
          handles.delete(path)
        }
      }
    } catch {
      // A directory that stops being readable mid-walk takes only itself.
    }
  }

  await descend(root, '')
  return { markdown, assetPaths, handles, modified, skipped }
}
