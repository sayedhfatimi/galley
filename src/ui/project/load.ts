import { type GalleyConfig, presetFor } from '@/core/config'
import { readProject } from '@/core/project/read'
import { walkProject } from '@/ui/lib/fs/walk'
import { type FileState, type ProjectSession, UNKNOWN_FILE } from '@/ui/lib/store'

/**
 * A directory handle becomes an open project.
 *
 * Pure enough to test: everything it touches is the `ProjectDirectory` shape,
 * so the in-memory fake drives it end to end. Nothing here throws — `walkProject`
 * skips what it cannot read and `readProject` turns every problem into a
 * diagnostic — so an odd folder opens with notices rather than refusing.
 */

/**
 * A folder project is a BOOK unless its `book.md` says otherwise.
 *
 * `DEFAULT_CONFIG` is article-shaped, and an article has no front matter, no
 * chapters and no contents page — every one of which a folder project exists
 * to express. Built from `presetFor` rather than by spreading a character over
 * the default, because `presetFor('book')` also sets `toc.include` and
 * `toc.depth`, which the spread would silently leave article-shaped.
 */
const DEFAULT_CHARACTER = 'book'

export async function loadProject(
  handle: FileSystemDirectoryHandle,
): Promise<ProjectSession> {
  const contents = await walkProject(handle)
  const project = readProject(contents.markdown, contents.assetPaths)

  const character = project.config.character ?? DEFAULT_CHARACTER
  const config: GalleyConfig = {
    ...presetFor(character),
    ...project.config,
    // `book.md`'s own frontmatter is the BOOK's title and author. A chapter's
    // frontmatter is never consulted for this — that is what makes the folder
    // portable rather than dependent on which file happens to be first.
    metadata: project.metadata,
  }

  const files = new Map<string, FileState>()
  for (const [path, lastModified] of contents.modified) {
    files.set(path, { ...UNKNOWN_FILE, lastModified })
  }

  return {
    handle,
    name: handle.name,
    project,
    handles: contents.handles,
    config,
    files,
    // The first chapter in reading order, so opening a book lands somewhere
    // rather than on an empty pane asking to be told what to do.
    panes: {
      left: project.parts[0]?.path ?? project.notes[0]?.path ?? null,
      right: null,
    },
    lastFocused: 'left',
  }
}
