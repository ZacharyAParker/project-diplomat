export const FOUND_STEPS = ['identity', 'flag', 'questions'] as const
export type FoundStep = (typeof FOUND_STEPS)[number]

export const NATION_PAGES = ['morning', 'desk', 'nation', 'record', 'settings', 'sandbox'] as const
export type NationPage = (typeof NATION_PAGES)[number]

export type Route =
  | { name: 'home' }
  | { name: 'found'; step: FoundStep }
  | { name: 'nation'; id: string; page: NationPage }
  | { name: 'kit' }
  | { name: 'admin' }
  | { name: 'lost' }

const oneOf = <T extends string>(list: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (list as readonly string[]).includes(value)

function decodePart(part: string): string | null {
  try {
    return decodeURIComponent(part)
  } catch {
    return null
  }
}

export function parseRoute(hash: string): Route {
  const parts = hash
    .replace(/^#?\/?/, '')
    .split('/')
    .filter(Boolean)
  const [first, second, third] = parts
  if (first === undefined) return { name: 'home' }
  if (first === 'found' && parts.length === 1) return { name: 'found', step: 'identity' }
  if (first === 'found' && parts.length === 2 && oneOf(FOUND_STEPS, second))
    return { name: 'found', step: second }
  if (first === 'kit' && parts.length === 1) return { name: 'kit' }
  if (first === 'admin' && parts.length === 1) return { name: 'admin' }
  if (first === 'n' && second !== undefined && parts.length <= 3) {
    const id = decodePart(second)
    if (id === null) return { name: 'lost' }
    if (third === undefined) return { name: 'nation', id, page: 'desk' }
    if (oneOf(NATION_PAGES, third)) return { name: 'nation', id, page: third }
  }
  return { name: 'lost' }
}

export function routeHref(route: Route): string {
  if (route.name === 'found') return route.step === 'identity' ? '#/found' : `#/found/${route.step}`
  if (route.name === 'nation') return `#/n/${encodeURIComponent(route.id)}/${route.page}`
  if (route.name === 'kit') return '#/kit'
  if (route.name === 'admin') return '#/admin'
  return '#/'
}
