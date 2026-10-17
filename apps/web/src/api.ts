import type { Adjustment, Identity, TimelineEntry } from '@diplomat/engine'
import type {
  ArchiveDocument,
  CensusFigure,
  Docket,
  DocumentHead,
  Factbook,
  FormId,
  GovernmentState,
  Mode,
  ProviderStatus,
  Tier,
} from '@diplomat/government'
import type { Snapshot, Summary } from './logic/saves.ts'

// The local server (apps/server), and the one place the browser talks to it. Everything
// here is JSON over fetch to the same origin. A request that changes anything carries
// X-Diplomat: 1, which another web page cannot add, so it cannot drive the game. An error
// comes back as { error } and is thrown as an Error with that message, already written for
// the player.

// A nation as the server sends it. state is the engine's own serialize() text.
export interface NationPayload {
  id: string
  createdAt: string
  updatedAt: string
  state: string
  history: Snapshot[]
}

// GET /api/nations/:id. census is worked out by the server from the indicators and the
// census base; the browser never computes it.
export interface NationResponse {
  nation: NationPayload
  government: GovernmentState
  census?: CensusFigure[]
}

// What any action may send back. The store takes whatever is present.
export interface Changed {
  nation?: NationPayload
  government?: GovernmentState
  census?: CensusFigure[]
}

export interface ServerStatus {
  version: string
  pack: { id: string; name?: string; version: string } | string
  ai: ProviderStatus
}

export type Backend = ProviderStatus['backend']

export interface AiSettings {
  backend: Backend
  // The key itself never comes back. Only whether one is stored.
  apiKeySet: boolean
  models: Record<Tier, string>
  minorsThroughBodies: boolean
}

export interface AiSettingsChange {
  backend?: Backend
  apiKey?: string
  models?: Partial<Record<Tier, string>>
  minorsThroughBodies?: boolean
}

export interface FoundRequest {
  identity: Identity
  answers: Record<string, string>
  form: FormId
  mode: Mode
  founder: { name: string; title: string }
}

export interface DecideRequest {
  dilemmaId: string
  // An option id, or 'dismiss'.
  course: string
  // A name the player wrote, for an option that asks for one.
  text?: string
  // The written reasons for setting aside a carried recommendation.
  veto?: string
  // A Founder's Word, word for word, overruling whatever the rules say.
  word?: string
}

export type SandboxRequest =
  { adjust: readonly Adjustment[] } | { callUp: string } | { crisis: string } | { skip: number }

export type WordRequest =
  { text: string; overrules?: string; silence?: boolean } | { number: number; confirm: true }

export type QuestionAnswer = { answer: string } | { noAnswer: true } | { later: true }

export type LetterAction = { reply: string } | { adopt: true } | { noReply: true } | { read: true }

export interface ArchiveQuery {
  series?: string
  q?: string
  // Engine days, inclusive.
  from?: number
  to?: number
  issuer?: string
  limit?: number
  offset?: number
}

export interface ArchivePage {
  documents: DocumentHead[]
  total: number
}

export interface DocumentPage {
  document: ArchiveDocument
  citedBy: DocumentHead[]
}

export interface FactbookWrite {
  title: string
  category: Factbook['category']
  body: string
}

export interface Imported {
  id: string
  name?: string
  notice?: string
}

// Everything the web app asks of the server. The store takes one of these, so the tests
// can hand it an in-memory server built on the engine (src/test/fakeServer.ts).
export interface Api {
  status(): Promise<ServerStatus>
  settings(): Promise<AiSettings>
  saveSettings(change: AiSettingsChange): Promise<AiSettings>
  testSettings(): Promise<ProviderStatus>

  nations(): Promise<Summary[]>
  found(request: FoundRequest): Promise<{ id: string }>
  importSave(text: string): Promise<Imported>
  nation(id: string): Promise<NationResponse>
  exportNation(id: string): Promise<string>
  remove(id: string): Promise<void>

  decide(id: string, request: DecideRequest): Promise<Changed & { entry?: TimelineEntry }>
  situation(id: string, optionId: string): Promise<Changed & { entry?: TimelineEntry }>
  endDay(id: string): Promise<Changed & { entries?: TimelineEntry[] }>
  run(id: string, days: number): Promise<Changed & { entries?: TimelineEntry[] }>
  convene(id: string, dilemmaId: string): Promise<Changed>
  dockets(id: string): Promise<Docket[]>
  sandbox(id: string, request: SandboxRequest): Promise<Changed>
  identity(id: string, identity: Identity): Promise<Changed>
  mode(id: string, mode: Mode): Promise<Changed>

  word(id: string, request: WordRequest): Promise<Changed>
  question(id: string, questionId: string, answer: QuestionAnswer): Promise<Changed>
  letter(id: string, letterId: string, action: LetterAction): Promise<Changed>
  moveBill(id: string, bill: { title: string; summary: string }): Promise<Changed>

  archive(id: string, query: ArchiveQuery): Promise<ArchivePage>
  document(id: string, docId: string): Promise<DocumentPage>

  writeFactbook(id: string, factbook: FactbookWrite): Promise<Changed>
  editFactbook(id: string, factbookId: string, factbook: FactbookWrite): Promise<Changed>
  draftFactbook(
    id: string,
    request: { title: string; category: Factbook['category']; notes: string },
  ): Promise<{ title: string; body: string }>
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// What the player is told when the server is not there at all.
export const UNREACHABLE =
  'The game’s server is not answering. Start it from the project folder with pnpm start, then try again.'

// Reads a reply. A failure is thrown with the server's own words, or a plain description
// of what came back when it sent none.
async function reply(response: Response): Promise<unknown> {
  const text = await response.text()
  let body: unknown = null
  if (text !== '') {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (!response.ok) {
    const said = isObject(body) && typeof body['error'] === 'string' ? body['error'] : null
    throw new Error(said ?? `The server refused that (${response.status} ${response.statusText}).`.replace(' )', ')'))
  }
  return body
}

export function createHttpApi(fetcher: Fetch = (input, init) => fetch(input, init), base = ''): Api {
  async function call(method: string, path: string, body?: unknown, raw = false): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (method !== 'GET') headers['X-Diplomat'] = '1'
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let response: Response
    try {
      response = await fetcher(`${base}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'same-origin',
      })
    } catch {
      throw new Error(UNREACHABLE)
    }
    if (raw) {
      if (!response.ok) await reply(response)
      return response.text()
    }
    return reply(response)
  }

  const get = (path: string) => call('GET', path)
  const post = (path: string, body: unknown = {}) => call('POST', path, body)
  const put = (path: string, body: unknown) => call('PUT', path, body)
  const n = (id: string) => `/api/nations/${encodeURIComponent(id)}`

  return {
    status: async () => (await get('/api/status')) as ServerStatus,
    settings: async () => (await get('/api/settings')) as AiSettings,
    saveSettings: async (change) => (await put('/api/settings', change)) as AiSettings,
    testSettings: async () => {
      const body = await post('/api/settings/test')
      return (isObject(body) && isObject(body['status']) ? body['status'] : body) as ProviderStatus
    },

    nations: async () => {
      const body = await get('/api/nations')
      const list = isObject(body) ? body['nations'] : body
      return (Array.isArray(list) ? list : []) as Summary[]
    },
    found: async (request) => (await post('/api/nations', request)) as { id: string },
    importSave: async (text) => (await post('/api/nations/import', { text })) as Imported,
    nation: async (id) => (await get(n(id))) as NationResponse,
    exportNation: async (id) => (await call('GET', `${n(id)}/export`, undefined, true)) as string,
    remove: async (id) => void (await call('DELETE', n(id))),

    decide: async (id, request) => (await post(`${n(id)}/decide`, request)) as Changed & { entry?: TimelineEntry },
    situation: async (id, optionId) =>
      (await post(`${n(id)}/situation`, { optionId })) as Changed & { entry?: TimelineEntry },
    endDay: async (id) => (await post(`${n(id)}/end-day`)) as Changed & { entries?: TimelineEntry[] },
    run: async (id, days) => (await post(`${n(id)}/run`, { days })) as Changed & { entries?: TimelineEntry[] },
    convene: async (id, dilemmaId) =>
      (await post(`${n(id)}/dockets/${encodeURIComponent(dilemmaId)}/convene`)) as Changed,
    dockets: async (id) => {
      const body = await get(`${n(id)}/dockets`)
      const list = isObject(body) && 'dockets' in body ? body['dockets'] : body
      if (Array.isArray(list)) return list as Docket[]
      return isObject(list) ? (Object.values(list) as Docket[]) : []
    },
    sandbox: async (id, request) => (await post(`${n(id)}/sandbox`, request)) as Changed,
    identity: async (id, identity) => (await put(`${n(id)}/identity`, identity)) as Changed,
    mode: async (id, mode) => (await put(`${n(id)}/mode`, { mode })) as Changed,

    word: async (id, request) => (await post(`${n(id)}/words`, request)) as Changed,
    question: async (id, qid, answer) =>
      (await post(`${n(id)}/questions/${encodeURIComponent(qid)}`, answer)) as Changed,
    letter: async (id, lid, action) =>
      (await post(`${n(id)}/letters/${encodeURIComponent(lid)}`, action)) as Changed,
    moveBill: async (id, bill) => (await post(`${n(id)}/bills`, bill)) as Changed,

    archive: async (id, query) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') params.set(key, String(value))
      }
      const qs = params.toString()
      const body = await get(`${n(id)}/archive${qs ? `?${qs}` : ''}`)
      if (Array.isArray(body)) return { documents: body as DocumentHead[], total: body.length }
      const documents = isObject(body) && Array.isArray(body['documents']) ? (body['documents'] as DocumentHead[]) : []
      const total = isObject(body) && typeof body['total'] === 'number' ? body['total'] : documents.length
      return { documents, total }
    },
    document: async (id, docId) => {
      const body = await get(`${n(id)}/archive/${encodeURIComponent(docId)}`)
      if (!isObject(body)) throw new Error('The server sent back something that is not a document.')
      // Either { document, citedBy } or the document itself with citedBy beside its fields.
      if (isObject(body['document'])) {
        return {
          document: body['document'] as unknown as ArchiveDocument,
          citedBy: (Array.isArray(body['citedBy']) ? body['citedBy'] : []) as DocumentHead[],
        }
      }
      const { citedBy, ...document } = body
      return {
        document: document as unknown as ArchiveDocument,
        citedBy: (Array.isArray(citedBy) ? citedBy : []) as DocumentHead[],
      }
    },

    writeFactbook: async (id, factbook) => (await post(`${n(id)}/factbooks`, factbook)) as Changed,
    editFactbook: async (id, fid, factbook) =>
      (await put(`${n(id)}/factbooks/${encodeURIComponent(fid)}`, factbook)) as Changed,
    draftFactbook: async (id, request) =>
      (await post(`${n(id)}/factbooks/draft`, request)) as { title: string; body: string },
  }
}
