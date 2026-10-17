import type { WorldDay } from '@diplomat/government'

// The structured part of an almanac document, read with suspicion: whatever is missing or
// of the wrong kind is left out rather than trusted.
export interface AlmanacData {
  opinion: string | null
  weather: string | null
  press: { outlet: string; headline: string; text: string }[]
  matters: { to: string; text: string }[]
  poll: WorldDay['poll'] | null
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null)

export function readAlmanac(data: unknown): AlmanacData {
  const d = isObject(data) ? data : {}
  const press = Array.isArray(d['press'])
    ? d['press'].flatMap((p) => {
        if (!isObject(p)) return []
        const outlet = text(p['outlet'])
        const headline = text(p['headline'])
        return outlet && headline ? [{ outlet, headline, text: text(p['text']) ?? '' }] : []
      })
    : []
  const matters = Array.isArray(d['matters'])
    ? d['matters'].flatMap((m) => {
        if (!isObject(m)) return []
        const said = text(m['text'])
        return said ? [{ to: text(m['to']) ?? '', text: said }] : []
      })
    : []
  const poll = isObject(d['poll']) && typeof d['poll']['question'] === 'string' && isObject(d['poll']['results'])
    ? {
        question: d['poll']['question'],
        results: Object.fromEntries(
          Object.entries(d['poll']['results']).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
        ),
      }
    : null
  return { opinion: text(d['opinion']), weather: text(d['weather']), press, matters, poll }
}
