// Checks what a model returned before anything uses it, the way engine/save.ts checks a
// save: by hand, all the way down. Arithmetic that does not add up is refused, so the task
// is retried or played by the stand-in. What code can tidy it tidies: strings are trimmed,
// unknown fields are dropped, Markdown is capped, and a missing ruling on dismissal is
// filled in as permitted. Verdicts, carried and binding are worked out again later from the
// votes, whatever the model said about them.

import { INDICATORS, type Effect } from '@diplomat/engine'
import { DISMISS, type Body, type Course, type Task, type TaskInput, type TaskOutput } from './types.ts'
import { apportion, isObject } from './util.ts'

export const MAX_MARKDOWN = 40_000
const MAX_LINE = 2_000

type Result<T> = { ok: true; value: T } | { ok: false; problems: string[] }

class Problems {
  list: string[] = []
  add(path: string, message: string) {
    if (this.list.length < 40) this.list.push(`${path} ${message}`)
  }
}

function text(p: Problems, value: unknown, path: string, opts: { markdown?: boolean; optional?: boolean; empty?: boolean } = {}): string | undefined {
  if (value === undefined || value === null) {
    if (!opts.optional) p.add(path, 'is missing')
    return undefined
  }
  if (typeof value !== 'string') {
    p.add(path, 'is not text')
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed && !opts.empty && !opts.optional) p.add(path, 'is empty')
  if (!trimmed && opts.optional) return undefined
  return trimmed.slice(0, opts.markdown ? MAX_MARKDOWN : MAX_LINE)
}

function texts(p: Problems, value: unknown, path: string, optional = false): string[] {
  if (value === undefined && optional) return []
  if (!Array.isArray(value)) {
    p.add(path, 'is not a list')
    return []
  }
  return value
    .map((v, i) => text(p, v, `${path}[${i}]`, { empty: true }))
    .filter((v): v is string => v !== undefined && v !== '')
}

function count(p: Problems, value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    p.add(path, 'is not a whole number of zero or more')
    return 0
  }
  return value as number
}

function list(p: Problems, value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    p.add(path, 'is not a list')
    return []
  }
  return value
}

function object(p: Problems, value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) {
    p.add(path, 'is not an object')
    return {}
  }
  return value
}

function course(p: Problems, value: unknown, path: string, courses: readonly Course[]): Course | undefined {
  const c = text(p, value, path)
  if (c === undefined) return undefined
  if (!courses.includes(c)) {
    p.add(path, `is "${c}", which is not one of the courses: ${courses.join(', ')}`)
    return undefined
  }
  return c
}

const coursesOf = (petition: { options: { course: Course }[] }) => {
  const cs = petition.options.map((o) => o.course)
  return cs.includes(DISMISS) ? cs : [...cs, DISMISS]
}

function ladder(p: Problems, value: unknown, path: string, courses: readonly Course[]): Course[] {
  const items = list(p, value, path).map((v, i) => course(p, v, `${path}[${i}]`, courses))
  const seen = new Set<string>()
  for (const c of items) {
    if (c === undefined) continue
    if (seen.has(c)) p.add(path, `names ${c} more than once`)
    seen.add(c)
  }
  const missing = courses.filter((c) => !seen.has(c))
  if (missing.length) p.add(path, `leaves out ${missing.join(', ')}; it must rank every course, dismissal included`)
  return items.filter((c): c is Course => c !== undefined)
}

function division(p: Problems, value: unknown, path: string, body: Body) {
  const d = object(p, value, path)
  const totals = { aye: count(p, d['aye'], `${path}.aye`), no: count(p, d['no'], `${path}.no`), abstain: count(p, d['abstain'], `${path}.abstain`) }
  const by = object(p, d['byParty'], `${path}.byParty`)
  // A body with no parties (or one) may return no breakdown; its totals stand for it.
  if (Object.keys(by).length === 0 && body.parties.length <= 1) {
    const total = totals.aye + totals.no + totals.abstain
    if (total !== body.size) p.add(path, `adds up to ${total}, but ${body.name} has ${body.size} members`)
    return { ...totals, byParty: body.parties.length ? { [body.parties[0]!.id]: { ...totals } } : {} }
  }
  const byParty: Record<string, { aye: number; no: number; abstain: number }> = {}
  const sums = { aye: 0, no: 0, abstain: 0 }
  for (const party of body.parties) {
    const at = `${path}.byParty.${party.id}`
    if (!isObject(by[party.id])) {
      p.add(at, `is missing: every party of ${body.name} divides`)
      continue
    }
    const row = by[party.id] as Record<string, unknown>
    const r = { aye: count(p, row['aye'], `${at}.aye`), no: count(p, row['no'], `${at}.no`), abstain: count(p, row['abstain'], `${at}.abstain`) }
    if (r.aye + r.no + r.abstain !== party.seats) p.add(at, `adds up to ${r.aye + r.no + r.abstain}, but ${party.name} has ${party.seats} seats`)
    byParty[party.id] = r
    sums.aye += r.aye
    sums.no += r.no
    sums.abstain += r.abstain
  }
  for (const key of Object.keys(by)) if (!body.parties.some((x) => x.id === key)) p.add(`${path}.byParty.${key}`, 'is not a party of this body')
  for (const k of ['aye', 'no', 'abstain'] as const) {
    if (totals[k] !== sums[k]) p.add(`${path}.${k}`, `is ${totals[k]}, but the parties' ${k} votes add up to ${sums[k]}`)
  }
  const total = totals.aye + totals.no + totals.abstain
  if (total !== body.size) p.add(path, `adds up to ${total}, but ${body.name} has ${body.size} members`)
  return { ...sums, byParty }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// The shape of an effect, as the engine's save check reads one. Whether it is a kind the
// world may have, and how far it may move, is bounds.ts's business.
export function effectOf(p: Problems, value: unknown, path: string): Effect | undefined {
  if (!isObject(value)) {
    p.add(path, 'is not an effect')
    return undefined
  }
  const why = typeof value['why'] === 'string' ? value['why'].trim() : ''
  const by = value['by']
  const moves = (key: string, ok: boolean) => {
    if (!ok || !isNum(by)) {
      p.add(path, `is a ${key} effect without a known target and a number`)
      return undefined
    }
    return { [key]: value[key], by, why } as unknown as Effect
  }
  if ('indicator' in value) return moves('indicator', (INDICATORS as readonly unknown[]).includes(value['indicator']))
  if ('faction' in value) return moves('faction', typeof value['faction'] === 'string')
  if ('minister' in value) return moves('minister', typeof value['minister'] === 'string')
  if ('policy' in value) {
    const to = value['to']
    if (typeof value['policy'] !== 'string' || !(typeof to === 'boolean' || isNum(to))) {
      p.add(path, 'is a policy effect without a policy and a setting')
      return undefined
    }
    return { policy: value['policy'], to }
  }
  if ('flag' in value && typeof value['flag'] === 'string') {
    return value['clear'] === true ? { flag: value['flag'], clear: true } : { flag: value['flag'] }
  }
  p.add(path, 'is not an indicator, faction, minister, policy or flag effect')
  return undefined
}

const effects = (p: Problems, value: unknown, path: string): Effect[] =>
  value === undefined ? [] : list(p, value, path).map((e, i) => effectOf(p, e, `${path}[${i}]`)).filter((e): e is Effect => e !== undefined)

function legislature(p: Problems, input: TaskInput['legislature.sitting'], o: Record<string, unknown>): TaskOutput['legislature.sitting'] {
  const courses = coursesOf(input.petition)
  const ranked = ladder(p, o['ladder'], 'ladder', courses)
  if (input.permitted && ranked[0] !== undefined && ranked[0] !== DISMISS && !input.permitted.includes(ranked[0])) {
    p.add('ladder[0]', `is ${ranked[0]}, which is barred: this sitting chooses among ${input.permitted.join(', ')} only`)
  }
  const out: TaskOutput['legislature.sitting'] = {
    debate: text(p, o['debate'], 'debate', { markdown: true }) ?? '',
    ladder: ranked,
    division: division(p, o['division'], 'division', input.body),
  }
  const remonstrance = text(p, o['remonstrance'], 'remonstrance', { optional: true, markdown: true })
  const address = text(p, o['address'], 'address', { optional: true, markdown: true })
  if (remonstrance) out.remonstrance = remonstrance
  if (address) out.address = address
  if (o['canon'] !== undefined) out.canon = texts(p, o['canon'], 'canon')
  return out
}

function court(p: Problems, input: TaskInput['court.opinion'], o: Record<string, unknown>): TaskOutput['court.opinion'] {
  const options = input.petition.options.map((x) => x.course).filter((c) => c !== DISMISS)
  const courses = [...options, DISMISS]
  const members = input.body.members.map((m) => m.id)
  const rulings: TaskOutput['court.opinion']['rulings'] = []
  list(p, o['rulings'], 'rulings').forEach((raw, i) => {
    const at = `rulings[${i}]`
    const r = object(p, raw, at)
    const c = course(p, r['course'], `${at}.course`, courses)
    const v = object(p, r['votes'], `${at}.votes`)
    const votes: Record<string, 'permit' | 'bar'> = {}
    for (const id of members) {
      const vote = typeof v[id] === 'string' ? (v[id] as string).trim().toLowerCase() : v[id]
      if (vote !== 'permit' && vote !== 'bar') p.add(`${at}.votes.${id}`, 'must be "permit" or "bar": every member votes')
      else votes[id] = vote
    }
    for (const key of Object.keys(v)) if (!members.includes(key)) p.add(`${at}.votes.${key}`, 'is not a member of this body')
    if (c === undefined) return
    if (rulings.some((x) => x.course === c)) p.add(at, `rules on ${c} a second time`)
    rulings.push({ course: c, votes, articles: texts(p, r['articles'] ?? [], `${at}.articles`), markers: texts(p, r['markers'] ?? [], `${at}.markers`) })
  })
  const missing = options.filter((c) => !rulings.some((r) => r.course === c))
  if (missing.length) p.add('rulings', `leave out ${missing.join(', ')}: the court rules on every option`)
  // Dismissal is never unlawful; a court that says nothing about it permits it.
  if (!rulings.some((r) => r.course === DISMISS)) {
    rulings.push({ course: DISMISS, votes: Object.fromEntries(members.map((id) => [id, 'permit' as const])), articles: [], markers: [] })
  }
  const order = (c: Course) => courses.indexOf(c)
  rulings.sort((a, b) => order(a.course) - order(b.course))
  const out: TaskOutput['court.opinion'] = {
    rulings,
    opinion: text(p, o['opinion'], 'opinion', { markdown: true }) ?? '',
    cautions: texts(p, o['cautions'] ?? [], 'cautions'),
    directions: texts(p, o['directions'] ?? [], 'directions'),
  }
  if (o['canon'] !== undefined) out.canon = texts(p, o['canon'], 'canon')
  return out
}

function referendum(p: Problems, input: TaskInput['electorate.referendum'], o: Record<string, unknown>): TaskOutput['electorate.referendum'] {
  const courses = coursesOf(input.petition)
  const raw = object(p, o['results'], 'results')
  for (const key of Object.keys(raw)) if (!courses.includes(key)) p.add(`results.${key}`, 'is not a course')
  const shares = courses.map((c) => {
    const v = raw[c] ?? 0
    if (!isNum(v) || v < 0) {
      p.add(`results.${c}`, 'is not a share of zero or more')
      return 0
    }
    return v
  })
  const sum = shares.reduce((a, b) => a + b, 0)
  if (sum < 99 || sum > 101) p.add('results', `add up to ${sum}; shares of the vote add up to 100`)
  const whole = apportion(100, shares)
  let turnout = o['turnout']
  if (isNum(turnout) && turnout > 1 && turnout <= 100) turnout = turnout / 100
  if (!isNum(turnout) || turnout <= 0 || turnout > 1) p.add('turnout', 'is not a share between 0 and 1')
  return {
    results: Object.fromEntries(courses.map((c, i) => [c, whole[i]!])),
    turnout: isNum(turnout) ? Math.round(turnout * 1000) / 1000 : 0,
    campaign: text(p, o['campaign'], 'campaign', { markdown: true }) ?? '',
  }
}

function worldDay(p: Problems, input: TaskInput['world.day'], o: Record<string, unknown>): TaskOutput['world.day'] {
  const outlet = (v: unknown, at: string) => {
    const name = text(p, v, at)
    if (name === undefined) return ''
    const found = input.press.find((x) => x.name.toLowerCase() === name.toLowerCase() || x.id === name)
    if (!found) p.add(at, `is "${name}", which is not one of the nation's press`)
    return found?.name ?? name
  }
  const out: TaskOutput['world.day'] = {
    weather: text(p, o['weather'], 'weather') ?? '',
    events: list(p, o['events'] ?? [], 'events').slice(0, 8).map((raw, i) => {
      const e = object(p, raw, `events[${i}]`)
      const island = text(p, e['island'], `events[${i}].island`, { optional: true })
      return { headline: text(p, e['headline'], `events[${i}].headline`) ?? '', text: text(p, e['text'], `events[${i}].text`, { markdown: true }) ?? '', ...(island ? { island } : {}) }
    }),
    reaction: text(p, o['reaction'], 'reaction', { markdown: true }) ?? '',
    press: list(p, o['press'] ?? [], 'press').slice(0, 12).map((raw, i) => {
      const e = object(p, raw, `press[${i}]`)
      return { outlet: outlet(e['outlet'], `press[${i}].outlet`), headline: text(p, e['headline'], `press[${i}].headline`) ?? '', text: text(p, e['text'], `press[${i}].text`, { markdown: true }) ?? '' }
    }),
    opinion: text(p, o['opinion'], 'opinion', { markdown: true }) ?? '',
    matters: list(p, o['matters'] ?? [], 'matters').slice(0, 6).map((raw, i) => {
      const e = object(p, raw, `matters[${i}]`)
      return { to: text(p, e['to'], `matters[${i}].to`) ?? '', text: text(p, e['text'], `matters[${i}].text`, { markdown: true }) ?? '' }
    }),
    effects: effects(p, o['effects'], 'effects'),
    almanac: text(p, o['almanac'], 'almanac', { markdown: true }) ?? '',
  }
  if (o['poll'] !== undefined) {
    const poll = object(p, o['poll'], 'poll')
    const results = object(p, poll['results'], 'poll.results')
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(results)) {
      if (!isNum(v) || v < 0) p.add(`poll.results.${k}`, 'is not a share')
      else clean[k.trim()] = v
    }
    out.poll = { question: text(p, poll['question'], 'poll.question') ?? '', results: clean }
  }
  if (o['canon'] !== undefined) out.canon = texts(p, o['canon'], 'canon')
  return out
}

const HEX = /^#[0-9a-fA-F]{6}$/

function founding(p: Problems, input: TaskInput['founding.institutions'], o: Record<string, unknown>): TaskOutput['founding.institutions'] {
  const pickText = (src: Record<string, unknown>, keys: string[], at: string) => {
    const out: Record<string, string> = {}
    for (const k of keys) {
      const v = text(p, src[k], `${at}.${k}`, { optional: true, markdown: k === 'description' || k === 'character' })
      if (v) out[k] = v
    }
    return out
  }
  return {
    bodies: list(p, o['bodies'] ?? [], 'bodies').map((raw, i) => {
      const at = `bodies[${i}]`
      const b = object(p, raw, at)
      const id = text(p, b['id'], `${at}.id`) ?? ''
      const body = input.institutions.bodies.find((x) => x.id === id)
      if (!body) p.add(`${at}.id`, `is "${id}", which is not a body of this government`)
      const parties = b['parties'] === undefined ? undefined : list(p, b['parties'], `${at}.parties`).map((rp, j) => {
        const r = object(p, rp, `${at}.parties[${j}]`)
        const pid = text(p, r['id'], `${at}.parties[${j}].id`) ?? ''
        if (body && !body.parties.some((x) => x.id === pid)) p.add(`${at}.parties[${j}].id`, `is "${pid}", which is not a party of ${body.name}`)
        const out: Record<string, string> = { id: pid, ...pickText(r, ['name', 'nickname', 'leader', 'description'], `${at}.parties[${j}]`) }
        if (typeof r['colour'] === 'string' && HEX.test(r['colour'].trim())) out['colour'] = r['colour'].trim()
        return out
      })
      const members = b['members'] === undefined ? undefined : list(p, b['members'], `${at}.members`).map((rm, j) => {
        const r = object(p, rm, `${at}.members[${j}]`)
        const mid = text(p, r['id'], `${at}.members[${j}].id`) ?? ''
        if (body && !body.members.some((x) => x.id === mid)) p.add(`${at}.members[${j}].id`, `is "${mid}", which is not a member of ${body.name}`)
        return { id: mid, ...pickText(r, ['name', 'office', 'character', 'philosophy'], `${at}.members[${j}]`) }
      })
      return { id, ...pickText(b, ['name', 'shortName', 'description'], at), ...(parties ? { parties } : {}), ...(members ? { members } : {}) }
    }),
    ...(o['press'] === undefined
      ? {}
      : {
          press: list(p, o['press'], 'press').map((raw, i) => {
            const r = object(p, raw, `press[${i}]`)
            const id = text(p, r['id'], `press[${i}].id`) ?? ''
            if (!input.institutions.press.some((x) => x.id === id)) p.add(`press[${i}].id`, `is "${id}", which is not one of the press`)
            return { id, ...pickText(r, ['name', 'line'], `press[${i}]`) }
          }),
        }),
    canon: texts(p, o['canon'] ?? [], 'canon'),
    lore: list(p, o['lore'] ?? [], 'lore').map((raw, i) => {
      const r = object(p, raw, `lore[${i}]`)
      return { title: text(p, r['title'], `lore[${i}].title`) ?? '', body: text(p, r['body'], `lore[${i}].body`, { markdown: true }) ?? '' }
    }),
  }
}

const STAGES = ['introduced', 'committee', 'passed', 'signed', 'returned', 'failed', 'law'] as const

function bills(p: Problems, input: TaskInput['bill.sitting'], o: Record<string, unknown>): TaskOutput['bill.sitting'] {
  return {
    bills: list(p, o['bills'], 'bills').map((raw, i) => {
      const at = `bills[${i}]`
      const b = object(p, raw, at)
      const stage = text(p, b['stage'], `${at}.stage`) as (typeof STAGES)[number]
      if (stage !== undefined && !STAGES.includes(stage)) p.add(`${at}.stage`, `is "${stage}", not one of ${STAGES.join(', ')}`)
      const out: TaskOutput['bill.sitting']['bills'][number] = {
        title: text(p, b['title'], `${at}.title`) ?? '',
        moved: text(p, b['moved'], `${at}.moved`) ?? '',
        summary: text(p, b['summary'], `${at}.summary`, { markdown: true }) ?? '',
        stage: stage ?? 'introduced',
      }
      if (b['number'] !== undefined) {
        const n = count(p, b['number'], `${at}.number`)
        if (!input.bills.some((x) => x.number === n)) p.add(`${at}.number`, `is ${n}, which is not a bill before the House; leave it out for a new bill`)
        out.number = n
      }
      if (b['division'] !== undefined) {
        const d = object(p, b['division'], `${at}.division`)
        const div = { reading: text(p, d['reading'], `${at}.division.reading`) ?? '', aye: count(p, d['aye'], `${at}.division.aye`), no: count(p, d['no'], `${at}.division.no`), abstain: count(p, d['abstain'], `${at}.division.abstain`) }
        if (div.aye + div.no + div.abstain !== input.body.size) p.add(`${at}.division`, `adds up to ${div.aye + div.no + div.abstain}, but ${input.body.name} has ${input.body.size} members`)
        out.division = div
      }
      if (b['effects'] !== undefined) out.effects = effects(p, b['effects'], `${at}.effects`)
      return out
    }),
    hansard: text(p, o['hansard'], 'hansard', { markdown: true }) ?? '',
  }
}

export function validate<T extends Task>(task: T, input: TaskInput[T], output: unknown): Result<TaskOutput[T]> {
  const p = new Problems()
  if (!isObject(output)) return { ok: false, problems: ['the reply is not a JSON object'] }
  const o = output
  let value: unknown
  switch (task as Task) {
    case 'legislature.sitting':
      value = legislature(p, input as TaskInput['legislature.sitting'], o)
      break
    case 'court.opinion':
      value = court(p, input as TaskInput['court.opinion'], o)
      break
    case 'council.sitting': {
      const i = input as TaskInput['council.sitting']
      value = 'rights' in i ? court(p, i, o) : legislature(p, i, o)
      break
    }
    case 'electorate.referendum':
      value = referendum(p, input as TaskInput['electorate.referendum'], o)
      break
    case 'ministry.advice': {
      const i = input as TaskInput['ministry.advice']
      const favours = o['favours'] === undefined || o['favours'] === null || o['favours'] === '' ? undefined : course(p, o['favours'], 'favours', coursesOf(i.petition))
      const costing = text(p, o['costing'], 'costing', { optional: true })
      value = {
        ...(favours ? { favours } : {}),
        summary: text(p, o['summary'], 'summary', { markdown: true }) ?? '',
        ...(costing ? { costing } : {}),
        paper: text(p, o['paper'], 'paper', { markdown: true }) ?? '',
      }
      break
    }
    case 'executive.decision': {
      const i = input as TaskInput['executive.decision']
      const courses = coursesOf(i.petition)
      let veto: { course: Course; reasons: string } | undefined
      if (o['veto'] !== undefined && o['veto'] !== null) {
        const v = object(p, o['veto'], 'veto')
        const c = course(p, v['course'], 'veto.course', courses)
        const reasons = text(p, v['reasons'], 'veto.reasons', { markdown: true })
        if (c && reasons) veto = { course: c, reasons }
      }
      value = {
        course: course(p, o['course'], 'course', courses) ?? '',
        reasons: text(p, o['reasons'], 'reasons', { markdown: true }) ?? '',
        ...(veto ? { veto } : {}),
        papers: text(p, o['papers'], 'papers', { markdown: true }) ?? '',
      }
      break
    }
    case 'world.day':
      value = worldDay(p, input as TaskInput['world.day'], o)
      break
    case 'founding.institutions':
      value = founding(p, input as TaskInput['founding.institutions'], o)
      break
    case 'factbook.draft':
      value = { title: text(p, o['title'], 'title') ?? '', body: text(p, o['body'], 'body', { markdown: true }) ?? '' }
      break
    case 'letters.draft': {
      const i = input as TaskInput['letters.draft']
      const letters = list(p, o['letters'], 'letters')
      if (letters.length === 0) p.add('letters', 'is empty')
      value = {
        letters: letters.slice(0, i.count + 2).map((raw, k) => {
          const r = object(p, raw, `letters[${k}]`)
          const place = text(p, r['place'], `letters[${k}].place`, { optional: true })
          if (r['urgent'] !== undefined && typeof r['urgent'] !== 'boolean') p.add(`letters[${k}].urgent`, 'is not true or false')
          return {
            from: text(p, r['from'], `letters[${k}].from`) ?? '',
            ...(place ? { place } : {}),
            text: text(p, r['text'], `letters[${k}].text`, { markdown: true }) ?? '',
            urgent: r['urgent'] === true,
            draft: text(p, r['draft'], `letters[${k}].draft`, { markdown: true }) ?? '',
          }
        }),
      }
      break
    }
    case 'exchange.reply': {
      const i = input as TaskInput['exchange.reply']
      const courses = i.petition ? coursesOf(i.petition) : undefined
      const changes = o['changes'] === undefined ? undefined : list(p, o['changes'], 'changes').map((raw, k) => {
        const r = object(p, raw, `changes[${k}]`)
        const c = courses ? course(p, r['course'], `changes[${k}].course`, courses) : text(p, r['course'], `changes[${k}].course`)
        const verdict = r['verdict']
        if (verdict !== undefined && verdict !== 'permitted' && verdict !== 'barred') p.add(`changes[${k}].verdict`, 'must be "permitted" or "barred"')
        const out: { course: Course; verdict?: 'permitted' | 'barred'; ladder?: Course[] } = { course: c ?? '' }
        if (verdict === 'permitted' || verdict === 'barred') out.verdict = verdict
        if (r['ladder'] !== undefined && courses) out.ladder = ladder(p, r['ladder'], `changes[${k}].ladder`, courses)
        return out
      })
      const said = text(p, o['text'], 'text', { markdown: true }) ?? ''
      value = { text: said, ...(changes ? { changes } : {}), document: text(p, o['document'], 'document', { markdown: true, optional: true }) ?? said }
      break
    }
    case 'bill.sitting':
      value = bills(p, input as TaskInput['bill.sitting'], o)
      break
    default:
      p.add('task', `${String(task)} is not a task`)
  }
  return p.list.length ? { ok: false, problems: p.list } : { ok: true, value: value as TaskOutput[T] }
}
