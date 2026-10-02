import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { KeyValue } from '../logic/saves.ts'
import { readSettings, resolveTheme, writeSettings, type Settings } from '../logic/settings.ts'

interface SettingsApi {
  settings: Settings
  // What is actually on screen, after "follow the system" has been resolved.
  theme: 'light' | 'dark'
  change(next: Partial<Settings>): void
}

const SettingsContext = createContext<SettingsApi | null>(null)

const DARK = '(prefers-color-scheme: dark)'

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DARK).matches
}

export function SettingsProvider({ kv, children }: { kv: KeyValue; children: ReactNode }) {
  const [settings, setSettings] = useState(() => readSettings(kv))
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia(DARK)
    const listen = () => setSystemDark(query.matches)
    query.addEventListener('change', listen)
    return () => query.removeEventListener('change', listen)
  }, [])

  const theme = resolveTheme(settings.theme, systemDark)

  // index.html sets the same two attributes before the first paint, so there is no flash.
  useEffect(() => {
    const root = document.documentElement
    root.dataset['theme'] = theme
    if (settings.reduceMotion) root.dataset['motion'] = 'reduced'
    else delete root.dataset['motion']
  }, [theme, settings.reduceMotion])

  const change = useCallback(
    (next: Partial<Settings>) => {
      setSettings((old) => {
        const merged = { ...old, ...next }
        writeSettings(kv, merged)
        return merged
      })
    },
    [kv],
  )

  const api = useMemo(() => ({ settings, theme, change }), [settings, theme, change])
  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsApi {
  const api = useContext(SettingsContext)
  if (!api) throw new Error('useSettings needs a SettingsProvider above it')
  return api
}
