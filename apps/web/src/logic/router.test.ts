import { describe, expect, it } from 'vitest'
import { parseRoute, routeHref, type Route } from './router.ts'
import { DEFAULT_SETTINGS, SETTINGS_KEY, readSettings, resolveTheme, writeSettings } from './settings.ts'
import { memoryStore } from './saves.ts'

describe('routes', () => {
  const routes: Route[] = [
    { name: 'home' },
    { name: 'found', step: 'identity' },
    { name: 'found', step: 'flag' },
    { name: 'found', step: 'questions' },
    { name: 'kit' },
    { name: 'nation', id: 'abc123', page: 'desk' },
    { name: 'nation', id: 'abc123', page: 'morning' },
    { name: 'nation', id: 'abc123', page: 'record' },
    { name: 'nation', id: 'odd id/with?bits#', page: 'settings' },
  ]

  it('round-trips every route through its address', () => {
    for (const route of routes) expect(parseRoute(routeHref(route)), routeHref(route)).toEqual(route)
  })

  it('treats an empty or bare hash as home', () => {
    for (const hash of ['', '#', '#/', '/']) expect(parseRoute(hash)).toEqual({ name: 'home' })
  })

  it('opens a nation at its desk when no page is given', () => {
    expect(parseRoute('#/n/abc')).toEqual({ name: 'nation', id: 'abc', page: 'desk' })
  })

  it('is lost anywhere else', () => {
    for (const hash of [
      '#/nowhere',
      '#/found/extra',
      '#/found/flag/more',
      '#/n',
      '#/n/abc/budget',
      '#/n/%E0%A4%A/desk',
      '#/kit/x',
    ]) {
      expect(parseRoute(hash), hash).toEqual({ name: 'lost' })
    }
  })
})

describe('settings', () => {
  it('starts from the defaults and survives anything unreadable', () => {
    expect(readSettings(memoryStore())).toEqual(DEFAULT_SETTINGS)
    for (const bad of ['', 'null', '[]', '{"theme":"sepia","reduceMotion":"yes"}', '{{{']) {
      expect(readSettings(memoryStore({ [SETTINGS_KEY]: bad })), bad).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('reads back what it wrote', () => {
    const kv = memoryStore()
    writeSettings(kv, { theme: 'dark', reduceMotion: true })
    expect(readSettings(kv)).toEqual({ theme: 'dark', reduceMotion: true })
  })

  it('follows the system only when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
