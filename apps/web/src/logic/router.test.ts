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
    { name: 'found', step: 'form' },
    { name: 'found', step: 'mode' },
    { name: 'found', step: 'founder' },
    { name: 'kit' },
    { name: 'ai' },
    { name: 'gov', id: 'abc123', page: 'today' },
    { name: 'gov', id: 'abc123', page: 'in-force' },
    { name: 'gov', id: 'abc123', page: 'executive' },
    { name: 'gov', id: 'abc123', page: 'country' },
    { name: 'gov', id: 'abc123', page: 'founder' },
    { name: 'gov', id: 'abc123', page: 'library', query: {} },
    { name: 'gov', id: 'abc123', page: 'library', query: { q: 'fish & chips?', series: 'hansard', issuer: 'The Assembly', from: 3, to: 12, page: 2 } },
    { name: 'gov', id: 'abc123', page: 'doc', doc: 'hansard-00012' },
    { name: 'gov', id: 'abc123', page: 'body', body: 'assembly' },
    { name: 'gov', id: 'odd id/with?bits#', page: 'body', body: 'a/b?c' },
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

  it('opens the government website at Today, and writes its addresses plainly', () => {
    expect(parseRoute('#/n/abc/gov')).toEqual({ name: 'gov', id: 'abc', page: 'today' })
    expect(routeHref({ name: 'gov', id: 'abc', page: 'today' })).toBe('#/n/abc/gov')
    expect(routeHref({ name: 'gov', id: 'abc', page: 'doc', doc: 'court-00001' })).toBe('#/n/abc/gov/doc/court-00001')
    expect(routeHref({ name: 'gov', id: 'abc', page: 'library', query: { series: 'law', page: 1 } })).toBe(
      '#/n/abc/gov/library?series=law',
    )
  })

  it('keeps only the library filters it understands', () => {
    expect(parseRoute('#/n/abc/gov/library?q=x&page=0&from=soon&colour=red&to=4')).toEqual({
      name: 'gov',
      id: 'abc',
      page: 'library',
      query: { q: 'x', to: 4 },
    })
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
      '#/found/government',
      '#/n/abc/desk?x=1',
      '#/n/abc/gov/nowhere',
      '#/n/abc/gov/doc',
      '#/n/abc/gov/doc/a/b',
      '#/n/abc/gov/body',
      '#/n/abc/gov/today/more',
      '#/n/abc/gov/founder?x=1',
      '#/n/abc/gov/doc/%E0%A4%A',
      '#/ai/x',
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
