// A world of its own for each new nation: a continent drawn from a seed, and twenty nations on
// it with their own names, capitals, leaders, governments, economies and temperaments. The
// nations that touch the player's on the map are its neighbours; who borders whom is read off
// the map, so the rules and the map agree by construction. The same seed always makes the same
// world.

import { HOME, type Content, type GeneratedWorld, type NeighbourDef, type Temperament, type WorldMapDef } from './types.ts'
import { drawMap, type MapData, type Point } from './map.ts'

type Rng = () => number

function rngOf(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!
const between = (rng: Rng, lo: number, hi: number) => Math.round(lo + rng() * (hi - lo)) || 0
const clamp = (n: number) => Math.max(5, Math.min(95, Math.round(n)))

// ----------------------------------------------------------------------------------------
// Names: each region of the continent has its own way of naming things
// ----------------------------------------------------------------------------------------

type Person = [string, 'm' | 'f']

interface Culture {
  starts: string[]
  ends: string[]
  towns: string[]
  given: Person[]
  family: string[]
  demonym(name: string): string
}

const plainDemonym = (name: string): string => {
  if (/ia$/.test(name)) return `${name}n`
  if (/a$/.test(name)) return `${name}n`
  if (/land$/.test(name)) return `${name}er`
  if (/[eo]$/.test(name)) return `${name}se`
  if (/(os|us|is)$/.test(name)) return `${name.slice(0, -2)}ian`
  return `${name}er`
}

const CULTURES: Culture[] = [
  {
    starts: ['Esk', 'Halv', 'Ytter', 'Skar', 'Tor', 'Vald', 'Kjel', 'Ost', 'Rand', 'Fjell', 'Sval', 'Hård', 'Lys', 'Norr'],
    ends: ['land', 'mark', 'holm', 'heim', 'vik', 'dal', 'by'],
    towns: ['vik', 'havn', 'stad', 'by', 'sund', 'fjord'],
    given: [['Halvor', 'm'], ['Ingrid', 'f'], ['Sigrun', 'f'], ['Torben', 'm'], ['Astrid', 'f'], ['Leif', 'm'], ['Maren', 'f'], ['Eskil', 'm'], ['Solveig', 'f'], ['Arne', 'm']],
    family: ['Brask', 'Lund', 'Holt', 'Aaberg', 'Strand', 'Dahl', 'Rask', 'Vinter', 'Fjeld', 'Moe'],
    demonym: plainDemonym,
  },
  {
    starts: ['Mor', 'Val', 'Cor', 'Lun', 'Aur', 'Sar', 'Bel', 'Cast', 'Mar', 'Ver', 'Sol', 'Pell', 'Duv', 'Roch'],
    ends: ['aine', 'elle', 'esse', 'ia', 'onne', 'ence', 'alle', 'ande'],
    towns: ['-sur-Mer', 'ville', 'mont', 'bourg', 'lac', 'pont'],
    given: [['Agathe', 'f'], ['Odile', 'f'], ['Lucien', 'm'], ['Mathis', 'm'], ['Céline', 'f'], ['Bastien', 'm'], ['Isaure', 'f'], ['Gaspard', 'm'], ['Héloïse', 'f'], ['Rémi', 'm']],
    family: ['Sorel', 'Marr', 'Delaune', 'Fabre', 'Varenne', 'Roux', 'Aubert', 'Lacroix', 'Morel', 'Vidal'],
    demonym: (name) => (/ia$/.test(name) ? `${name}n` : /e$/.test(name) ? `${name}r` : plainDemonym(name)),
  },
  {
    starts: ['Vr', 'Gor', 'Kras', 'Dobr', 'Mil', 'Zar', 'Rad', 'Volk', 'Bel', 'Strel', 'Pol', 'Lub', 'Tes'],
    ends: ['ana', 'ovia', 'ina', 'avia', 'ensk', 'ova', 'ania'],
    towns: ['grad', 'ov', 'ava', 'ica', 'opol', 'ec'],
    given: [['Bogdan', 'm'], ['Milena', 'f'], ['Radek', 'm'], ['Vesna', 'f'], ['Dragan', 'm'], ['Zora', 'f'], ['Stanislav', 'm'], ['Jelena', 'f'], ['Miroslav', 'm'], ['Ludmila', 'f']],
    family: ['Kovar', 'Petrov', 'Varga', 'Novak', 'Lisko', 'Brod', 'Zelen', 'Horak', 'Dvorak', 'Mraz'],
    demonym: (name) => (/sk$/.test(name) ? `${name}i` : plainDemonym(name)),
  },
  {
    starts: ['Skerr', 'Glen', 'Kil', 'Aber', 'Penn', 'Tarr', 'Craig', 'Brann', 'Dun', 'Lism', 'Carr', 'Morr'],
    ends: ['in', 'more', 'dale', 'ock', 'an', 'ow', 'ey'],
    towns: ['wick', 'ford', 'haven', 'more', 'bridge', 'mouth'],
    given: [['Eilidh', 'f'], ['Rory', 'm'], ['Maeve', 'f'], ['Callum', 'm'], ['Siobhan', 'f'], ['Ewan', 'm'], ['Ailsa', 'f'], ['Fergus', 'm'], ['Niamh', 'f'], ['Hamish', 'm']],
    family: ['MacAra', 'Doyle', 'Penhallow', 'Brennan', 'Quaile', 'Tierney', 'Lennox', 'Gillies', 'Moray', 'Kerr'],
    demonym: plainDemonym,
  },
  {
    starts: ['Qas', 'Zah', 'Sab', 'Tah', 'Kar', 'Ham', 'Jaz', 'Raf', 'Nur', 'Bah', 'Sur', 'Dar'],
    ends: ['rin', 'ara', 'ir', 'iya', 'oun', 'abad', 'un'],
    towns: ['abad', 'iya', 'oun', 'an', 'ir'],
    given: [['Yusuf', 'm'], ['Leila', 'f'], ['Karim', 'm'], ['Samira', 'f'], ['Tariq', 'm'], ['Nadia', 'f'], ['Idris', 'm'], ['Yasmin', 'f'], ['Rami', 'm'], ['Huda', 'f']],
    family: ['al-Hadi', 'Haddad', 'Nasri', 'Qadir', 'Mansour', 'Khalil', 'Saleh', 'Darwish', 'Aziz', 'Farah'],
    demonym: (name) => (/[aiy]$/.test(name) ? `${name}n` : `${name}i`),
  },
  {
    starts: ['Kess', 'Brenn', 'Ard', 'Wald', 'Hoh', 'Stein', 'Eber', 'Rhen', 'Falk', 'Lind', 'Ober', 'Grau'],
    ends: ['mark', 'burg', 'holt', 'feld', 'au', 'tal', 'ingen', 'une'],
    towns: ['burg', 'stadt', 'berg', 'hafen', 'furt', 'dorf'],
    given: [['Konrad', 'm'], ['Greta', 'f'], ['Ulrich', 'm'], ['Liesel', 'f'], ['Anselm', 'm'], ['Hedda', 'f'], ['Matthias', 'm'], ['Irmgard', 'f'], ['Oskar', 'm'], ['Wiebke', 'f']],
    family: ['Doln', 'Brenner', 'Falkner', 'Reuss', 'Kessler', 'Albrecht', 'Vogt', 'Haller', 'Lang', 'Ziegler'],
    demonym: plainDemonym,
  },
  {
    starts: ['Tar', 'Pel', 'Ama', 'Kor', 'Thess', 'Lyk', 'Ael', 'Myr', 'Kal', 'Zeph', 'Ior', 'Nax'],
    ends: ['os', 'ia', 'is', 'ene', 'on', 'ara', 'ucia'],
    towns: ['polis', 'ion', 'a', 'eia', 'os'],
    given: [['Nikos', 'm'], ['Eleni', 'f'], ['Theron', 'm'], ['Ariadne', 'f'], ['Stavros', 'm'], ['Ione', 'f'], ['Dimitri', 'm'], ['Kalliope', 'f'], ['Petros', 'm'], ['Zoe', 'f']],
    family: ['Kallis', 'Doukas', 'Mavros', 'Andreou', 'Petrakis', 'Laskaris', 'Vlachos', 'Rallis', 'Galanis', 'Sotiriou'],
    demonym: plainDemonym,
  },
]

const VOWEL = /[aeiouyåéèëïô]/i

function join(start: string, end: string): string {
  const a = start[start.length - 1] ?? ''
  const b = end[0] ?? ''
  // Two consonants meeting after a cluster read badly: put a vowel between them.
  if (!VOWEL.test(a) && !VOWEL.test(b) && end[0] !== '-' && !VOWEL.test(start[start.length - 2] ?? 'a')) return `${start}e${end}`
  if (VOWEL.test(a) && VOWEL.test(b)) return `${start}${end.slice(1)}`
  return start + end
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// ----------------------------------------------------------------------------------------
// Governments, economies and what they care about
// ----------------------------------------------------------------------------------------

interface Form {
  form: string
  title(sex: 'm' | 'f'): string
  says: string[]
  temper: Partial<Temperament>
  likes?: string[]
}

const FORMS: Form[] = [
  { form: 'republic', title: () => 'President', says: ['A republic of loud elections and quiet coalitions.', 'Its parliament argues about everything and agrees, eventually, on most of it.'], temper: {} },
  { form: 'federal republic', title: () => 'Chancellor', says: ['A federation of proud provinces that agree on little but the flag.', 'Its provinces guard their rights and its capital pretends not to mind.'], temper: { loyalty: 8 } },
  { form: 'presidential republic', title: () => 'President', says: ['Its president is strong, its parliament is loud and its courts are the referee.', 'A presidency with long arms and a parliament that bites them.'], temper: { ambition: 8 } },
  { form: 'parliamentary monarchy', title: () => 'Prime Minister', says: ['A crown on the coins and a parliament in charge.', 'The monarch opens parliament and otherwise keeps out of it.'], temper: { loyalty: 10 } },
  { form: 'crowned republic', title: () => 'Prime Minister', says: ['A republic that kept its royal family for ceremonies and postage stamps.', 'It abolished the crown in all but name and kept the name.'], temper: { charity: 6 } },
  { form: 'monarchy', title: (s) => (s === 'f' ? 'Queen' : 'King'), says: ['The crown still governs here, and the court still matters.', 'An old dynasty that rules as well as reigns.'], temper: { ambition: 10, loyalty: 6 }, likes: ['paternalist'] },
  { form: 'principality', title: (s) => (s === 'f' ? 'Princess' : 'Prince'), says: ['A small principality run like a well-kept estate.', 'Its prince owns the casino, the bank and, by most accounts, the parliament.'], temper: { charity: -6 }, likes: ['free_trade'] },
  { form: 'one-party state', title: () => 'First Secretary', says: ['One party, one newspaper and a five-year plan.', 'The party has governed since anyone can remember, and says so often.'], temper: { ambition: 14, aggression: 8, charity: -8 }, likes: ['surveillance'] },
  { form: 'junta', title: () => 'General', says: ['The army took over to restore order and has been restoring it ever since.', 'A council of colonels, and elections promised for next year, every year.'], temper: { aggression: 20, ambition: 10, charity: -10 }, likes: ['hawkish'] },
  { form: 'theocracy', title: () => 'High Prelate', says: ['The clergy sit in the cabinet and the sermon is read on the wireless.', 'Its laws come from scripture and its scripture from the high council.'], temper: { loyalty: 10, charity: 8 }, likes: ['paternalist'] },
  { form: 'merchant republic', title: () => 'Doge', says: ['Governed by the great trading houses, in the interest of trade.', 'Its senate is a guild of shipowners with a flag.'], temper: { ambition: 6, aggression: -8 }, likes: ['free_trade'] },
  { form: 'commonwealth', title: () => 'First Minister', says: ['A cooperative commonwealth of town councils and trade unions.', 'Its government is a committee of committees, and proud of it.'], temper: { charity: 12, aggression: -8 }, likes: ['pro_labour'] },
  { form: 'council republic', title: () => 'Chair of the Council', says: ['Governed by a council that rotates its chair every year.', 'No president, no premier: a council of seven and a lot of meetings.'], temper: { aggression: -6, charity: 6 } },
]

const RESOURCES = ['food', 'energy', 'manufactures', 'capital', 'workers'] as const

const HAS: Record<string, string[]> = {
  food: ['Wheat to the horizon and cattle beyond it.', 'Orchards, vineyards and market towns.', 'Fishing fleets, salt-cod warehouses and a coast that smells of both.', 'Rice terraces, dairy herds and a farm lobby nobody crosses.'],
  energy: ['Gas fields and pipelines.', 'Coal country, black to the knees.', 'Hydro dams on every river worth the name.', 'Oil terminals along a grey coast.'],
  manufactures: ['Mills, foundries and shipyards.', 'Factories that run three shifts and a railway to carry it all.', 'Steelworks, car plants and a great deal of smoke.', 'Workshops that make the continent’s clocks, engines and rifles.'],
  capital: ['Banks, bourses and discreet lawyers.', 'Old money in new towers.', 'A financial quarter larger than some of its provinces.', 'Shipping insurers, merchant banks and very low taxes.'],
  workers: ['A young, crowded country whose people go abroad to work.', 'More hands than jobs, and a great many trains leaving.', 'Its villages empty every spring as the young leave for foreign factories.'],
}

const LACKS: Record<string, string> = {
  food: 'It cannot feed itself and knows it.',
  energy: 'It buys every drop of fuel it burns.',
  manufactures: 'It buys its machines from abroad.',
  capital: 'It is always short of money.',
  workers: 'It is short of hands and getting older.',
}

const TEMPERS: { when(t: Temperament): boolean; says: string }[] = [
  { when: (t) => t.aggression >= 65, says: 'It keeps its army polished and its grievances close.' },
  { when: (t) => t.ambition >= 68, says: 'It wants a bigger place at the table, and says so.' },
  { when: (t) => t.charity >= 65, says: 'Generous abroad, and keen that everyone knows it.' },
  { when: (t) => t.loyalty >= 68, says: 'Slow to make friends and slower to drop them.' },
  { when: (t) => t.aggression <= 25, says: 'It has not fought a war in living memory and would like to keep it that way.' },
  { when: (t) => t.loyalty <= 30, says: 'Its friendships last exactly as long as they pay.' },
]

// What each nation's papers say when a decision of the player's pleases or displeases it.
// {leader} and {country} are filled in here; {nation} is left for the game.
const NOTICES: Record<string, [string, string]> = {
  green: ['{leader} praises {nation}’s “good sense about the air we all share”.', '{country}’s papers call {nation} “the chimney of the continent”.'],
  polluting: ['{country}’s industrialists toast {nation}’s “realism” at their annual dinner.', '{leader} complains that {nation}’s smoke is blowing across the border again.'],
  hawkish: ['{leader} says {nation} has at last “found its spine”.', '{country}’s defence ministry asks, pointedly, what {nation} is arming for.'],
  dovish: ['{leader} calls {nation} “a voice of reason on a nervous continent”.', '{country}’s generals say {nation} has “disarmed itself in all but name”.'],
  paternalist: ['{country}’s pulpits and editorials agree, for once, that {nation} is setting a good example.', '{leader} worries aloud that {nation} is “losing its moral compass”.'],
  permissive: ['{country}’s young people hold {nation} up as the place to be.', '{leader} calls {nation}’s new laws “a carnival, not a country”.'],
  free_trade: ['{country}’s chambers of commerce send {nation} a warm open letter.', '{country}’s exporters ask {leader} to retaliate against {nation}’s tariffs.'],
  growth: ['{leader} calls {nation} “a country that finally means business”.', '{country}’s investors mark {nation} down as “not serious”.'],
  redistribution: ['{country}’s unions hold up {nation} as proof that it can be done.', '{country}’s financiers describe {nation} as “a confiscation with a flag”.'],
  surveillance: ['{leader} compliments {nation} on its “firm grip on public order”.', '{country}’s press calls {nation} “a nation behind a two-way mirror”.'],
  privacy: ['{country}’s civil-liberties groups give {nation} an award, in absentia.', '{leader} says {nation} has become “a haven for every smuggler on the continent”.'],
  pro_labour: ['{country}’s unions send {nation}’s unions a telegram of solidarity.', '{country}’s employers warn {leader} that {nation}’s “labour disease” could spread.'],
  anti_labour: ['{country}’s employers’ federation calls {nation} “a model of discipline”.', '{country}’s unions picket {nation}’s embassy.'],
  spending: ['{leader} calls {nation}’s new budget “generous and wise”.', '{country}’s treasury warns that {nation} is “spending money it will want back”.'],
  austerity: ['{country}’s bankers approve of {nation}’s “tightened belt”.', '{leader} says {nation} is “balancing its books on the backs of the poor”.'],
}

const OPPOSITE: Record<string, string> = {
  green: 'polluting', polluting: 'green', hawkish: 'dovish', dovish: 'hawkish', paternalist: 'permissive', permissive: 'paternalist',
  surveillance: 'privacy', privacy: 'surveillance', pro_labour: 'anti_labour', anti_labour: 'pro_labour', spending: 'austerity', austerity: 'spending',
  free_trade: 'redistribution', redistribution: 'free_trade', growth: 'green',
}

const PLACES = ['the {x} Valley', '{x} Moor', 'the {x} Marshes', 'the {x} Gap', '{x} Point', 'the {x} Hills', 'the {x} Fords', 'the {x} Coast', '{x} Heath', 'the {x} Forest', 'the {x} Downs', 'the Upper {x}']

// ----------------------------------------------------------------------------------------
// The map
// ----------------------------------------------------------------------------------------

const W = 1000
const H = 700

function placeSites(rng: Rng): { sites: Point[]; home: Point; sea: Point[] } {
  const home: Point = [between(rng, 440, 560), between(rng, 310, 390)]
  const sites: Point[] = []
  // Five round the player's country, so it has neighbours on every side.
  const turn = rng() * Math.PI * 2
  for (let i = 0; i < 5; i++) {
    const a = turn + (i / 5) * Math.PI * 2 + (rng() - 0.5) * 0.5
    const d = between(rng, 185, 215)
    sites.push([Math.round(home[0] + Math.cos(a) * d), Math.round(home[1] + Math.sin(a) * d * 0.85)])
  }
  // The rest wherever there is room.
  let gap = 125
  for (let tries = 0; sites.length < 20 && tries < 6000; tries++) {
    if (tries && tries % 1500 === 0) gap -= 12
    const p: Point = [between(rng, 70, W - 70), between(rng, 70, H - 70)]
    if (Math.hypot(p[0] - home[0], p[1] - home[1]) < 310) continue
    if (sites.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < gap)) continue
    sites.push(p)
  }
  // Inland seas, gulfs and lakes, kept away from the player's country.
  const sea: Point[] = [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]]
  const lakes = between(rng, 3, 6)
  for (let tries = 0; sea.length < 4 + lakes && tries < 2000; tries++) {
    const p: Point = [between(rng, 90, W - 90), between(rng, 90, H - 90)]
    if (Math.hypot(p[0] - home[0], p[1] - home[1]) < 230) continue
    if ([...sites, ...sea].some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 85)) continue
    sea.push(p)
  }
  return { sites, home, sea }
}

function fits(map: MapData, ids: string[]): boolean {
  const near = (map.neighbours[HOME] ?? []).filter((x) => !x.startsWith('sea'))
  if (near.length < 4 || near.length > 6) return false
  for (const id of ids) {
    const r = map.regions.find((x) => x.id === id)
    if (!r || r.area < 5000) return false
    // The player's country should be a country, not a gap between its neighbours.
    if ((map.regions.find((x) => x.id === HOME)?.area ?? 0) < 26000) return false
    if (!(map.neighbours[id] ?? []).some((x) => !x.startsWith('sea'))) return false
  }
  return true
}

// ----------------------------------------------------------------------------------------
// The world
// ----------------------------------------------------------------------------------------

export function generateWorld(content: Content, seed: number): GeneratedWorld {
  const rng = rngOf(seed ^ 0x5eed)

  // The map first: retry until the player's country has four to six neighbours and everyone
  // else has land and a border.
  let def: WorldMapDef | undefined
  let map: MapData | undefined
  let placed: ReturnType<typeof placeSites> | undefined
  const temp = Array.from({ length: 20 }, (_, i) => `n${i}`)
  for (let attempt = 0; attempt < 60; attempt++) {
    const p = placeSites(rng)
    if (p.sites.length < 20) continue
    const d: WorldMapDef = {
      width: W,
      height: H,
      spacing: 11,
      seed: between(rng, 1, 1_000_000),
      warp: 46,
      margin: 18,
      sites: { [HOME]: p.home, ...Object.fromEntries(p.sites.map((s, i) => [temp[i]!, s])) },
      sea: p.sea,
    }
    const m = drawMap(d)
    if (fits(m, temp)) {
      def = d
      map = m
      placed = p
      break
    }
  }
  if (!def || !map || !placed) throw new Error(`could not draw a world from seed ${seed}`)

  // Regions of the continent share a way of naming things: each culture has a home ground.
  const cultures = [...CULTURES].sort(() => rng() - 0.5).slice(0, 5)
  const centres: Point[] = cultures.map(() => [between(rng, 80, W - 80), between(rng, 80, H - 80)])
  const cultureAt = (p: Point) => {
    let best = 0
    centres.forEach((c, i) => {
      if (Math.hypot(c[0] - p[0], c[1] - p[1]) < Math.hypot(centres[best]![0] - p[0], centres[best]![1] - p[1])) best = i
    })
    return cultures[best]!
  }

  const used = new Set<string>()
  // No two nations' names start the same way: a continent of Castalles is no continent.
  const stems = new Set<string>()
  const stem = (c: Culture) => {
    const free = c.starts.filter((s) => !stems.has(s))
    const s = pick(rng, free.length ? free : c.starts)
    stems.add(s)
    return s
  }
  const fresh = (make: () => string): string => {
    for (let i = 0; i < 50; i++) {
      const n = make()
      if (!used.has(slug(n)) && n.length <= 14 && n.length >= 4) {
        used.add(slug(n))
        return n
      }
    }
    const n = `${make()} ${used.size}`
    used.add(slug(n))
    return n
  }
  const tagsUsed = new Set(content.dilemmas.flatMap((d) => d.options.flatMap((o) => (o as { tags?: string[] }).tags ?? [])))
  const tags = Object.keys(NOTICES).filter((t) => tagsUsed.has(t))
  const near = new Set((map.neighbours[HOME] ?? []).filter((x) => !x.startsWith('sea')))

  const nations: NeighbourDef[] = temp.map((tid, i) => {
    const at = placed!.sites[i]!
    const c = cultureAt(at)
    const own = stem(c)
    const name = fresh(() => join(own, pick(rng, c.ends)))
    // A capital usually takes another root, sometimes the country's own.
    const capital = fresh(() => {
      const t = pick(rng, c.towns)
      const root = rng() < 0.3 ? own : pick(rng, c.starts.filter((s) => !stems.has(s) || s === own))
      return t.startsWith('-') ? `${join(root, pick(rng, ['e', 'a', 'ine']))}${t}` : join(root, t)
    })
    const form = pick(rng, FORMS)
    const [given, sex] = pick(rng, c.given)
    const leader = `${form.title(sex)} ${fresh(() => `${given} ${pick(rng, c.family)}`)}`
    const t = form.temper
    const temperament: Temperament = {
      ambition: clamp(between(rng, 20, 75) + (t.ambition ?? 0)),
      aggression: clamp(between(rng, 15, 70) + (t.aggression ?? 0)),
      loyalty: clamp(between(rng, 20, 80) + (t.loyalty ?? 0)),
      charity: clamp(between(rng, 15, 75) + (t.charity ?? 0)),
    }
    const pool = [...RESOURCES].sort(() => rng() - 0.5)
    const surpluses = pool.slice(0, rng() < 0.4 ? 2 : 1)
    const needs = pool.slice(2, rng() < 0.4 ? 4 : 3)
    const area = map!.regions.find((r) => r.id === tid)?.area ?? 20000
    const big = Math.max(-12, Math.min(12, (area - 26000) / 1500))
    const strength = clamp(between(rng, 30, 70) + big + (form.form === 'junta' ? 10 : 0))
    const wealth = clamp(between(rng, 30, 70) + (surpluses.includes('capital') ? 10 : 0) + (needs.includes('capital') ? -8 : 0))

    const likes = [...new Set([...(form.likes ?? []).filter((x) => tags.includes(x) && rng() < 0.7), pick(rng, tags)])].slice(0, 2)
    const against = likes.map((l) => OPPOSITE[l]).filter((x): x is string => Boolean(x) && tags.includes(x!) && !likes.includes(x!))
    const dislikes = [...new Set([...against.slice(0, 1), ...(rng() < 0.5 ? [pick(rng, tags)] : [])])].filter((x) => !likes.includes(x)).slice(0, 2)
    if (!dislikes.length) dislikes.push(tags.find((x) => !likes.includes(x))!)

    const fill = (s: string) => s.replaceAll('{leader}', leader).replaceAll('{country}', name)
    const temper = TEMPERS.filter((x) => x.when(temperament)).map((x) => x.says)
    const description = [pick(rng, HAS[surpluses[0]!]!), pick(rng, form.says), LACKS[needs[0]!], ...(temper.length ? [pick(rng, temper)] : [])].join(' ')

    return {
      id: slug(name),
      name,
      capital,
      demonym: c.demonym(name),
      leader,
      description,
      standing: near.has(tid) ? between(rng, -15, 15) : between(rng, -10, 10),
      needs,
      surpluses,
      likes,
      dislikes,
      pleased: fill(NOTICES[likes[0]!]![0]),
      displeased: fill(NOTICES[dislikes[0]!]![1]),
      near: near.has(tid),
      borders: [],
      temperament,
      strength,
      wealth,
      form: form.form,
    }
  })

  // Every dilemma about another country needs a country it can be about.
  for (const d of content.dilemmas) {
    const want = d.abroad
    if (!want || (want.supplies === undefined && want.wants === undefined)) continue
    const ok = (n: NeighbourDef) => (want.supplies === undefined || n.surpluses.includes(want.supplies)) && (want.wants === undefined || n.needs.includes(want.wants))
    if (nations.some((n) => ok(n) && n.near)) continue
    const n = pick(rng, nations.filter((x) => x.near))
    if (want.supplies !== undefined && !n.surpluses.includes(want.supplies)) {
      n.needs = n.needs.filter((r) => r !== want.supplies)
      n.surpluses = [...n.surpluses, want.supplies]
    }
    if (want.wants !== undefined && !n.needs.includes(want.wants)) {
      n.surpluses = n.surpluses.filter((r) => r !== want.wants)
      n.needs = [...n.needs, want.wants]
    }
    if (!n.needs.length) n.needs = [RESOURCES.find((r) => !n.surpluses.includes(r))!]
    if (!n.surpluses.length) n.surpluses = [RESOURCES.find((r) => !n.needs.includes(r))!]
  }

  // Ids on the map from the placeholders to the nations' own, and borders read off it.
  const idOf = Object.fromEntries(temp.map((t, i) => [t, nations[i]!.id]))
  def.sites = { [HOME]: def.sites[HOME]!, ...Object.fromEntries(temp.map((t) => [idOf[t]!, def!.sites[t]!])) }
  temp.forEach((t, i) => {
    nations[i]!.borders = (map!.neighbours[t] ?? []).filter((x) => x !== HOME && !x.startsWith('sea')).map((x) => idOf[x]!).sort()
  })

  const regions = new Set<string>()
  const borderlands: string[] = []
  for (let i = 0; borderlands.length < 16 && i < 200; i++) {
    const c = pick(rng, cultures)
    const x = join(pick(rng, c.starts), pick(rng, ['en', 'ar', 'ow', 'el', 'is', 'ing', 'ey', 'ach']))
    const place = pick(rng, PLACES).replace('{x}', x)
    if (!regions.has(x)) {
      regions.add(x)
      borderlands.push(place)
    }
  }
  const continent = join(pick(rng, pick(rng, CULTURES).starts), pick(rng, ['ia', 'ara', 'ene', 'onia', 'esse', 'avia']))
  return { name: continent, seed, nations, map: def, borderlands }
}
