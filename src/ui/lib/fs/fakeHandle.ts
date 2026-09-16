/**
 * An in-memory stand-in for the File System Access API, for tests.
 *
 * jsdom implements none of it, so without this the whole filesystem layer —
 * the walk, the dotfolder rule, path normalisation, and every staleness
 * decision — would be reachable only by hand in a browser. That is the
 * difference between a safety property that is tested and one that is merely
 * intended, and this layer is the one that writes to an author's manuscript.
 *
 * It implements the parts galley actually uses and no more: enumerate, read,
 * write, and ask when a file last changed.
 *
 * Three things it does that a real handle cannot, each in service of a test
 * that is otherwise impossible to write:
 *
 * - counts `entries()` calls per directory, so "never enumerate inside
 *   `.obsidian/`" can be asserted on the enumeration rather than on the
 *   filtered result — a walk that descends and then discards passes any test
 *   that only looks at the output;
 * - lets a file change from OUTSIDE, which is how an edit arriving from
 *   another device mid-session is simulated;
 * - runs a hook the moment a writable is opened, which is the only way to
 *   land that outside change in the window between the staleness check and
 *   the write itself.
 */

export interface FakeFile {
  content: string
  lastModified: number
}

export interface FakeFs {
  /** The root handle, to pass to the code under test. */
  root: FileSystemDirectoryHandle
  /** How many times `entries()` was called on each directory path ('' is the root). */
  enumerated: Map<string, number>
  /** Current contents, by project-relative path. */
  files: Map<string, FakeFile>
  /** Change a file as though another device had, without going through galley. */
  touch: (path: string, content: string, lastModified?: number) => void
  /** Run once, the next time any writable is opened. Lands a race deliberately. */
  onOpenWritable: (hook: (path: string) => void) => void
  /** How many times a write was ATTEMPTED, per path — refused ones included. */
  writeAttempts: Map<string, number>
  /** How many times each file was READ, including every staleness check. */
  reads: Map<string, number>
}

const DEFAULT_MTIME = 1_000_000

export function fakeFs(initial: Record<string, string | FakeFile>): FakeFs {
  const files = new Map<string, FakeFile>()
  for (const [path, value] of Object.entries(initial)) {
    files.set(
      path,
      typeof value === 'string'
        ? { content: value, lastModified: DEFAULT_MTIME }
        : { ...value },
    )
  }

  const enumerated = new Map<string, number>()
  const writeAttempts = new Map<string, number>()
  const reads = new Map<string, number>()
  let writableHook: ((path: string) => void) | null = null

  const childrenOf = (dir: string) => {
    const prefix = dir === '' ? '' : `${dir}/`
    const dirs = new Set<string>()
    const plain: string[] = []
    for (const path of files.keys()) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) plain.push(rest)
      else dirs.add(rest.slice(0, slash))
    }
    return { dirs: [...dirs], plain }
  }

  const fileHandle = (path: string, name: string): FileSystemFileHandle =>
    ({
      kind: 'file',
      name,
      getFile: async () => {
        reads.set(path, (reads.get(path) ?? 0) + 1)
        const entry = files.get(path)
        if (!entry) throw new DOMException('not found', 'NotFoundError')
        const file = new File([entry.content], name, { lastModified: entry.lastModified })
        return file
      },
      createWritable: async () => {
        writeAttempts.set(path, (writeAttempts.get(path) ?? 0) + 1)
        writableHook?.(path)
        writableHook = null
        let buffer = ''
        return {
          write: async (data: unknown) => {
            buffer += typeof data === 'string' ? data : String(data)
          },
          close: async () => {
            const previous = files.get(path)?.lastModified ?? DEFAULT_MTIME
            files.set(path, { content: buffer, lastModified: previous + 1 })
          },
          abort: async () => {},
        } as unknown as FileSystemWritableFileStream
      },
    }) as unknown as FileSystemFileHandle

  const directoryHandle = (dir: string, name: string): FileSystemDirectoryHandle => {
    const handle = {
      kind: 'directory',
      name,
      entries: async function* () {
        enumerated.set(dir, (enumerated.get(dir) ?? 0) + 1)
        const { dirs, plain } = childrenOf(dir)
        for (const child of dirs) {
          yield [
            child,
            directoryHandle(dir === '' ? child : `${dir}/${child}`, child),
          ] as [string, FileSystemDirectoryHandle]
        }
        for (const child of plain) {
          yield [child, fileHandle(dir === '' ? child : `${dir}/${child}`, child)] as [
            string,
            FileSystemFileHandle,
          ]
        }
      },
      getFileHandle: async (child: string, options?: { create?: boolean }) => {
        const path = dir === '' ? child : `${dir}/${child}`
        if (!files.has(path)) {
          if (!options?.create) throw new DOMException('not found', 'NotFoundError')
          files.set(path, { content: '', lastModified: DEFAULT_MTIME })
        }
        return fileHandle(path, child)
      },
      getDirectoryHandle: async (child: string) => {
        const path = dir === '' ? child : `${dir}/${child}`
        return directoryHandle(path, child)
      },
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
    }
    return handle as unknown as FileSystemDirectoryHandle
  }

  return {
    root: directoryHandle('', 'project'),
    enumerated,
    writeAttempts,
    reads,
    files,
    touch: (path, content, lastModified) => {
      const previous = files.get(path)?.lastModified ?? DEFAULT_MTIME
      files.set(path, { content, lastModified: lastModified ?? previous + 100 })
    },
    onOpenWritable: (hook) => {
      writableHook = hook
    },
  }
}
