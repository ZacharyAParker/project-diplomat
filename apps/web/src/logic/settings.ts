import type { KeyValue } from './saves.ts'

export const SETTINGS_KEY = 'diplomat:settings'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export interface Settings {
  theme: Theme
  reduceMotion: boolean
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', reduceMotion: false }

// Settings are a convenience, so anything unreadable quietly becomes the defaults.
export function readSettings(kv: KeyValue): Settings {
  try {
    const raw: unknown = JSON.parse(kv.getItem(SETTINGS_KEY) ?? '{}')
    if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS
    const { theme, reduceMotion } = raw as Record<string, unknown>
    return {
      theme: THEMES.includes(theme as Theme) ? (theme as Theme) : DEFAULT_SETTINGS.theme,
      reduceMotion: reduceMotion === true,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function writeSettings(kv: KeyValue, settings: Settings) {
  try {
    kv.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Not worth a message. The theme still applies until the tab is closed.
  }
}

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light'
  return theme
}
