import { describe, expect, it, vi } from 'vitest'
import { UNREACHABLE, createHttpApi, type Fetch } from './api.ts'

function respond(status: number, body: unknown) {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Bad' })
}

describe('the client', () => {
  it('marks every change with X-Diplomat and sends JSON', async () => {
    const fetcher = vi.fn<Fetch>(async () => respond(200, { nation: {}, government: {} }))
    const api = createHttpApi(fetcher)
    await api.decide('a b', { dilemmaId: 'd', course: 'o', veto: 'Too dear.' })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('/api/nations/a%20b/decide')
    expect(init!.method).toBe('POST')
    expect((init!.headers as Record<string, string>)['X-Diplomat']).toBe('1')
    expect((init!.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init!.body as string)).toEqual({ dilemmaId: 'd', course: 'o', veto: 'Too dear.' })
  })

  it('does not mark a read', async () => {
    const fetcher = vi.fn<Fetch>(async () => respond(200, { version: '0.6.1' }))
    await createHttpApi(fetcher).status()
    expect((fetcher.mock.calls[0]![1]!.headers as Record<string, string>)['X-Diplomat']).toBeUndefined()
  })

  it('throws the server’s own words for an error', async () => {
    const api = createHttpApi(async () => respond(409, { error: 'That course is barred. Give a Word to take it.' }))
    await expect(api.decide('x', { dilemmaId: 'd', course: 'o' })).rejects.toThrow('That course is barred. Give a Word to take it.')
  })

  it('says what came back when the server sent no words', async () => {
    const api = createHttpApi(async () => new Response('<html>', { status: 502, statusText: 'Bad Gateway' }))
    await expect(api.nations()).rejects.toThrow('The server refused that (502 Bad Gateway).')
  })

  it('says the server is not running when nothing answers', async () => {
    const api = createHttpApi(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(api.status()).rejects.toThrow(UNREACHABLE)
  })

  it('writes the archive query and accepts either shape of document', async () => {
    const fetcher = vi.fn<Fetch>(async (url) =>
      url.includes('/archive/')
        ? respond(200, { id: 'law-00001', series: 'law', title: 'T', body: 'B', citedBy: [{ id: 'x' }] })
        : respond(200, { documents: [], total: 0 }),
    )
    const api = createHttpApi(fetcher)
    await api.archive('n', { series: 'hansard', q: 'fish', limit: 25, offset: 0, issuer: '' })
    expect(fetcher.mock.calls[0]![0]).toBe('/api/nations/n/archive?series=hansard&q=fish&limit=25&offset=0')
    const page = await api.document('n', 'law-00001')
    expect(page.document.title).toBe('T')
    expect(page.citedBy).toEqual([{ id: 'x' }])
  })

  it('reads the dockets as a list or as a record', async () => {
    const api = createHttpApi(async () => respond(200, { dockets: { d: { dilemma: 'd' } } }))
    expect(await api.dockets('n')).toEqual([{ dilemma: 'd' }])
  })
})
