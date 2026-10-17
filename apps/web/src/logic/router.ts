export const FOUND_STEPS = ['identity', 'flag', 'questions', 'form', 'mode', 'founder'] as const
export type FoundStep = (typeof FOUND_STEPS)[number]

export const NATION_PAGES = ['morning', 'desk', 'nation', 'world', 'record', 'settings', 'sandbox', 'director', 'ooc'] as const
export type NationPage = (typeof NATION_PAGES)[number]

// The government website's pages that need nothing more than their name.
export const GOV_PAGES = ['today', 'library', 'in-force', 'executive', 'country', 'founder'] as const
export type GovPage = (typeof GOV_PAGES)[number] | 'doc' | 'body'
const PLAIN_GOV_PAGES = ['today', 'in-force', 'executive', 'country', 'founder'] as const

// The library's filters, kept in the address so a search can be bookmarked and Back works.
export interface LibraryQuery {
  q?: string
  series?: string
  issuer?: string
  // Engine days, inclusive.
  from?: number
  to?: number
  // Counted from 1.
  page?: number
}

export type GovRoute =
  | { name: 'gov'; id: string; page: 'today' | 'in-force' | 'executive' | 'country' | 'founder' }
  | { name: 'gov'; id: string; page: 'library'; query: LibraryQuery }
  | { name: 'gov'; id: string; page: 'doc'; doc: string }
  | { name: 'gov'; id: string; page: 'body'; body: string }

export type Route =
  | { name: 'home' }
  | { name: 'found'; step: FoundStep }
  | { name: 'nation'; id: string; page: NationPage }
  | GovRoute
  | { name: 'ai' }
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

const whole = (text: string | null): number | undefined => {
  if (text === null || !/^\d{1,7}$/.test(text)) return undefined
  return Number(text)
}

function readQuery(search: string): LibraryQuery {
  const params = new URLSearchParams(search)
  const query: LibraryQuery = {}
  for (const key of ['q', 'series', 'issuer'] as const) {
    const value = params.get(key)
    if (value) query[key] = value
  }
  for (const key of ['from', 'to', 'page'] as const) {
    const value = whole(params.get(key))
    if (value !== undefined && (key !== 'page' || value >= 1)) query[key] = value
  }
  return query
}

function parseGov(id: string, rest: string[], search: string): Route {
  const [page, arg, ...more] = rest
  if (page === 'library' && arg === undefined) return { name: 'gov', id, page: 'library', query: readQuery(search) }
  if (search) return { name: 'lost' }
  if (page === undefined) return { name: 'gov', id, page: 'today' }
  if ((page === 'doc' || page === 'body') && arg !== undefined && more.length === 0) {
    const value = decodePart(arg)
    if (value === null || value === '') return { name: 'lost' }
    return page === 'doc'
      ? { name: 'gov', id, page: 'doc', doc: value }
      : { name: 'gov', id, page: 'body', body: value }
  }
  if (arg === undefined && oneOf(PLAIN_GOV_PAGES, page)) return { name: 'gov', id, page }
  return { name: 'lost' }
}

export function parseRoute(hash: string): Route {
  const bare = hash.replace(/^#?\/?/, '')
  const mark = bare.indexOf('?')
  const path = mark < 0 ? bare : bare.slice(0, mark)
  const search = mark < 0 ? '' : bare.slice(mark + 1)
  const parts = path.split('/').filter(Boolean)
  const [first, second, third] = parts
  const gov = first === 'n' && third === 'gov'
  if (search && !gov) return { name: 'lost' }
  if (first === undefined) return { name: 'home' }
  if (first === 'found' && parts.length === 1) return { name: 'found', step: 'identity' }
  if (first === 'found' && parts.length === 2 && oneOf(FOUND_STEPS, second))
    return { name: 'found', step: second }
  if (first === 'kit' && parts.length === 1) return { name: 'kit' }
  if (first === 'admin' && parts.length === 1) return { name: 'admin' }
  if (first === 'ai' && parts.length === 1) return { name: 'ai' }
  if (first === 'n' && second !== undefined) {
    const id = decodePart(second)
    if (id === null) return { name: 'lost' }
    if (gov) return parseGov(id, parts.slice(3), search)
    if (parts.length > 3) return { name: 'lost' }
    if (third === undefined) return { name: 'nation', id, page: 'desk' }
    if (oneOf(NATION_PAGES, third)) return { name: 'nation', id, page: third }
  }
  return { name: 'lost' }
}

function writeQuery(query: LibraryQuery): string {
  const params = new URLSearchParams()
  for (const key of ['q', 'series', 'issuer', 'from', 'to', 'page'] as const) {
    const value = query[key]
    if (value === undefined || value === '') continue
    if (key === 'page' && value === 1) continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function routeHref(route: Route): string {
  if (route.name === 'found') return route.step === 'identity' ? '#/found' : `#/found/${route.step}`
  if (route.name === 'nation') return `#/n/${encodeURIComponent(route.id)}/${route.page}`
  if (route.name === 'gov') {
    const base = `#/n/${encodeURIComponent(route.id)}/gov`
    if (route.page === 'today') return base
    if (route.page === 'library') return `${base}/library${writeQuery(route.query)}`
    if (route.page === 'doc') return `${base}/doc/${encodeURIComponent(route.doc)}`
    if (route.page === 'body') return `${base}/body/${encodeURIComponent(route.body)}`
    return `${base}/${route.page}`
  }
  if (route.name === 'kit') return '#/kit'
  if (route.name === 'admin') return '#/admin'
  if (route.name === 'ai') return '#/ai'
  return '#/'
}

// A document's address, for links in rendered text and lists.
export const docRoute = (id: string, doc: string): Route => ({ name: 'gov', id, page: 'doc', doc })

// Is this text the id of a document in the Archive ("hansard-00012")?
export const isDocId = (text: string) => /^[a-z]+-\d{5}$/.test(text)
