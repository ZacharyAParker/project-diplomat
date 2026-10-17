import { useCallback, useState } from 'react'

export interface Action {
  // Which action is on its way, by the name it was run under, or null.
  busy: string | null
  // What went wrong with the last one, in the server's words.
  error: string | null
  run<T>(name: string, act: () => Promise<T>): Promise<T | undefined>
  clear(): void
}

// For a screen's buttons: one request at a time, a busy mark while it is out, and the
// reason when it is refused. A refused action changes nothing, so the screen just says why.
export function useAction(): Action {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T,>(name: string, act: () => Promise<T>): Promise<T | undefined> => {
    setBusy(name)
    setError(null)
    try {
      return await act()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That was refused.')
      return undefined
    } finally {
      setBusy(null)
    }
  }, [])

  const clear = useCallback(() => setError(null), [])
  return { busy, error, run, clear }
}
