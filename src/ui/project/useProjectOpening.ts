import { useCallback, useEffect, useState } from 'react'
import { canOpenFolder, ensurePermission, pickProjectFolder } from '@/ui/lib/fs/pick'
import { forgetProject, rememberedProject, rememberProject } from '@/ui/lib/projectStore'
import { useStore } from '@/ui/lib/store'
import { loadProject } from './load'

/**
 * Picking a folder, reopening the last one, and saying why not.
 *
 * The permission dance is the shape of this: `requestPermission` needs a user
 * GESTURE, so nothing here may run on mount. Reopening is offered and then
 * performed by a click, which is why the remembered folder is state the empty
 * state renders rather than something restored behind the scenes.
 */
export function useProjectOpening() {
  const openProject = useStore((s) => s.openProject)
  const remembered = useStore((s) => s.rememberedProject)
  const forgetRemembered = useStore((s) => s.forgetRememberedProject)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)

  // The handle for the remembered folder, read once. Reading it is not the
  // same as using it: permission is asked for on the click, never here.
  useEffect(() => {
    let live = true
    void rememberedProject().then((found) => {
      if (live) setHandle(found?.handle ?? null)
    })
    return () => {
      live = false
    }
  }, [])

  const open = useCallback(
    async (chosen: FileSystemDirectoryHandle) => {
      setBusy(true)
      setError(null)
      try {
        if (!(await ensurePermission(chosen))) {
          setError(
            'galley needs permission to read and write that folder. Nothing has been changed.',
          )
          return
        }
        const session = await loadProject(chosen)
        await rememberProject(chosen)
        openProject(session)
      } catch {
        // `loadProject` does not throw on a bad folder — it produces
        // diagnostics — so reaching here means the handle itself went away.
        setError('That folder could not be opened. It may have been moved or renamed.')
      } finally {
        setBusy(false)
      }
    },
    [openProject],
  )

  const pick = useCallback(async () => {
    const result = await pickProjectFolder()
    if (!result.ok) {
      // Changing your mind is not an error and must not be reported as one.
      if (result.reason === 'cancelled') return
      setError(
        result.reason === 'unsupported'
          ? 'This browser cannot open a folder.'
          : 'That folder could not be opened.',
      )
      return
    }
    await open(result.handle)
  }, [open])

  const reopen = useCallback(async () => {
    if (!handle) {
      setError('That folder is no longer available. Choose it again.')
      return
    }
    await open(handle)
  }, [handle, open])

  const forget = useCallback(async () => {
    await forgetProject()
    setHandle(null)
    forgetRemembered()
  }, [forgetRemembered])

  return {
    supported: canOpenFolder(),
    remembered: handle ? remembered : null,
    busy,
    error,
    pick,
    reopen,
    forget,
  }
}
