// The map. Each nation owns a point (`map.sites` in world.yaml); the land is a fine jittered
// grid of small cells, and each cell belongs to the nation (or the sea) nearest it once the
// grid has been warped by noise, so borders and coasts wander the way real ones do. Pure
// geometry with no dependencies: the validator checks that the borders it draws are the borders
// the rules use, and the web page draws it.

import { HOME, type Content, type WorldMapDef } from './types.ts'

export type Point = [number, number]

export interface MapRegion {
  id: string
  sea: boolean
  // SVG path data: every cell the region owns, one subpath each.
  d: string
  // Where its name goes: inside the region, near its middle.
  centre: Point
  area: number
}

export interface MapData {
  width: number
  height: number
  regions: MapRegion[]
  // Who touches whom, by region id. Sea regions are named sea-0, sea-1 and so on.
  neighbours: Record<string, string[]>
  // The line between each pair of nations that touch, for drawing borders and fronts.
  borders: { between: [string, string]; d: string; length: number; middle: Point }[]
  coast: string
  mountains: Point[]
  // Where each nation's capital lies: a cell well inside it.
  capitals: Record<string, Point>
}

// ----------------------------------------------------------------------------------------
// Noise and randomness, seeded, so the same pack always draws the same map
// ----------------------------------------------------------------------------------------

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const s = (t: number) => t * t * (3 - 2 * t)
  const a = hash(xi, yi, seed)
  const b = hash(xi + 1, yi, seed)
  const c = hash(xi, yi + 1, seed)
  const d = hash(xi + 1, yi + 1, seed)
  const top = a + (b - a) * s(fx)
  const bottom = c + (d - c) * s(fx)
  return (top + (bottom - top) * s(fy)) * 2 - 1
}

// Two octaves: a broad wander and a finer ruffle.
function fbm(x: number, y: number, seed: number): number {
  return noise(x / 140, y / 140, seed) * 0.7 + noise(x / 45, y / 45, seed + 17) * 0.3
}

// ----------------------------------------------------------------------------------------
// The cells
// ----------------------------------------------------------------------------------------

interface Cell {
  p: Point
  poly: Point[]
  // For each edge of poly (from vertex k to k+1), the neighbouring cell's index, or -1 at the frame.
  next: number[]
}

const EPS = 1e-6

function clip(poly: Point[], next: number[], s: Point, o: Point, j: number): { poly: Point[]; next: number[] } {
  const nx = o[0] - s[0]
  const ny = o[1] - s[1]
  const mx = (s[0] + o[0]) / 2
  const my = (s[1] + o[1]) / 2
  const side = (q: Point) => (q[0] - mx) * nx + (q[1] - my) * ny
  const outP: Point[] = []
  const outN: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const da = side(a)
    const db = side(b)
    const ain = da <= EPS
    const bin = db <= EPS
    if (ain) {
      outP.push(a)
      outN.push(next[i]!)
    }
    if (ain !== bin) {
      const t = da / (da - db)
      outP.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      // Entering the kept side the new vertex continues the old edge; leaving it, it starts the bisector.
      outN.push(ain ? j : next[i]!)
    }
  }
  return { poly: outP, next: outN }
}

function cells(def: WorldMapDef): Cell[] {
  const spacing = def.spacing ?? 16
  const seed = def.seed ?? 7
  const cols = Math.ceil(def.width / spacing) + 1
  const rows = Math.ceil(def.height / spacing) + 1
  const points: Point[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Shaken a long way off the grid, so no line of cells runs straight.
      const jx = (hash(c, r, seed + 1) - 0.5) * spacing * 1.1
      const jy = (hash(c, r, seed + 2) - 0.5) * spacing * 1.1
      points.push([Math.min(def.width, Math.max(0, c * spacing + jx)), Math.min(def.height, Math.max(0, r * spacing + jy))])
    }
  }
  const out: Cell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const p = points[i]!
      const half = spacing * 2
      let poly: Point[] = [
        [Math.max(0, p[0] - half), Math.max(0, p[1] - half)],
        [Math.min(def.width, p[0] + half), Math.max(0, p[1] - half)],
        [Math.min(def.width, p[0] + half), Math.min(def.height, p[1] + half)],
        [Math.max(0, p[0] - half), Math.min(def.height, p[1] + half)],
      ]
      let next = [-1, -1, -1, -1]
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (!dr && !dc) continue
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue
          const j = rr * cols + cc
          const clipped = clip(poly, next, p, points[j]!, j)
          poly = clipped.poly
          next = clipped.next
        }
      }
      out.push({ p, poly, next })
    }
  }
  return out
}

// ----------------------------------------------------------------------------------------
// Who owns each cell, and the map drawn from that
// ----------------------------------------------------------------------------------------

const key = (p: Point) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`
const fmt = (n: number) => Math.round(n * 10) / 10

// Joins short segments end to end into as few lines as it can.
function chain(segments: [Point, Point][]): Point[][] {
  const ends = new Map<string, number[]>()
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = key(p)
      ends.set(k, [...(ends.get(k) ?? []), i])
    }
  })
  const used = new Set<number>()
  const lines: Point[][] = []
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue
    used.add(i)
    const line: Point[] = [segments[i]![0], segments[i]![1]]
    for (const forward of [true, false]) {
      for (;;) {
        const tip = forward ? line[line.length - 1]! : line[0]!
        const j = (ends.get(key(tip)) ?? []).find((x) => !used.has(x))
        if (j === undefined) break
        used.add(j)
        const [a, b] = segments[j]!
        const other = key(a) === key(tip) ? b : a
        if (forward) line.push(other)
        else line.unshift(other)
      }
    }
    lines.push(line)
  }
  return lines
}

const lineD = (lines: Point[][]) => lines.map((l) => `M${l.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join('L')}`).join('')

function draw(def: WorldMapDef): MapData {
  const seed = def.seed ?? 7
  const warp = def.warp ?? 42
  const margin = def.margin ?? 22
  const sites = [
    ...Object.entries(def.sites).map(([id, p]) => ({ id, p, sea: false })),
    ...def.sea.map((p, i) => ({ id: `sea-${i}`, p, sea: true })),
  ]
  const grid = cells(def)
  // A cell belongs to whichever site is nearest once its point is warped by the noise: this is
  // what makes coasts and borders wander. A rim round the frame is always sea.
  const nations = sites.filter((s) => !s.sea)
  const owner = grid.map((c) => {
    const [x, y] = c.p
    if (x < margin || y < margin || x > def.width - margin || y > def.height - margin) return { id: 'sea-rim', sea: true }
    const q: Point = [x + fbm(x, y, seed) * warp, y + fbm(x + 913, y - 377, seed) * warp]
    let best = sites[0]!
    let bestD = Infinity
    for (const s of sites) {
      const d = (s.p[0] - q[0]) ** 2 + (s.p[1] - q[1]) ** 2
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    // The shape of the continent: broad noise, falling away towards the frame, cuts bays and
    // capes into the coast and leaves the odd island. Land within reach of a capital stays land.
    if (!best.sea) {
      // Only the outer coast is carved: the interior of the continent stays one piece of land.
      const edge = Math.min(x, y, def.width - x, def.height - y)
      if (edge < 150) {
        const shape = noise(x / 160, y / 160, seed + 5) * 0.65 + noise(x / 60, y / 60, seed + 6) * 0.35 + (edge / 150) * 1.1 - 0.55
        const home = Math.min(...nations.map((s) => Math.hypot(s.p[0] - x, s.p[1] - y)))
        if (shape < 0 && home > 45) return { id: 'sea-shape', sea: true }
      }
    }
    return { id: best.id, sea: best.sea }
  })

  const polyArea = (poly: Point[]) => Math.abs(poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length]!
    return s + p[0] * q[1] - q[0] * p[1]
  }, 0)) / 2

  const byRegion = new Map<string, { sea: boolean; parts: string[]; cells: number[]; area: number }>()
  grid.forEach((c, i) => {
    const o = owner[i]!
    const id = o.sea ? 'sea' : o.id
    const r = byRegion.get(id) ?? { sea: o.sea, parts: [], cells: [], area: 0 }
    r.parts.push(`M${c.poly.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join('L')}Z`)
    r.cells.push(i)
    r.area += polyArea(c.poly)
    byRegion.set(id, r)
  })

  // The lines: where a cell's owner differs from its neighbour's. Sea against land is the coast.
  const pairSegs = new Map<string, [Point, Point][]>()
  const coastSegs: [Point, Point][] = []
  const touch = new Map<string, number>()
  grid.forEach((c, i) => {
    const a = owner[i]!
    c.poly.forEach((p, k) => {
      const j = c.next[k]!
      if (j < 0 || j < i) return
      const b = owner[j]!
      const aid = a.sea ? 'sea' : a.id
      const bid = b.sea ? 'sea' : b.id
      if (aid === bid) return
      const q = c.poly[(k + 1) % c.poly.length]!
      if (a.sea || b.sea) {
        coastSegs.push([p, q])
        return
      }
      const pair = [aid, bid].sort().join('|')
      pairSegs.set(pair, [...(pairSegs.get(pair) ?? []), [p, q]])
      touch.set(pair, (touch.get(pair) ?? 0) + Math.hypot(q[0] - p[0], q[1] - p[1]))
    })
  })

  const neighbours: Record<string, string[]> = {}
  const borders: MapData['borders'] = []
  for (const [pair, segs] of pairSegs) {
    const length = touch.get(pair) ?? 0
    // A few cells' worth of shared line is a border; a corner or two is not.
    if (length < 12) continue
    const [a, b] = pair.split('|') as [string, string]
    neighbours[a] = [...(neighbours[a] ?? []), b]
    neighbours[b] = [...(neighbours[b] ?? []), a]
    const mid = segs[Math.floor(segs.length / 2)]!
    borders.push({ between: [a, b], d: lineD(chain(segs)), length, middle: [(mid[0][0] + mid[1][0]) / 2, (mid[0][1] + mid[1][1]) / 2] })
  }
  for (const id of Object.keys(neighbours)) neighbours[id]!.sort()

  const regions: MapRegion[] = []
  const capitals: Record<string, Point> = {}
  for (const [id, r] of byRegion) {
    // The label and the capital sit at the cell most surrounded by its own country.
    const inner = r.cells
      .map((i) => {
        const c = grid[i]!
        const own = c.next.filter((j) => j >= 0 && (owner[j]!.sea ? 'sea' : owner[j]!.id) === id).length
        return { i, own }
      })
    const mean: Point = [r.cells.reduce((s, i) => s + grid[i]!.p[0], 0) / r.cells.length, r.cells.reduce((s, i) => s + grid[i]!.p[1], 0) / r.cells.length]
    const centre = inner
      .filter((x) => x.own === grid[x.i]!.next.filter((j) => j >= 0).length)
      .map((x) => grid[x.i]!.p)
      .sort((a, b) => (a[0] - mean[0]) ** 2 + (a[1] - mean[1]) ** 2 - ((b[0] - mean[0]) ** 2 + (b[1] - mean[1]) ** 2))[0] ?? mean
    regions.push({ id, sea: r.sea, d: r.parts.join(''), centre, area: r.area })
    if (!r.sea) {
      const site = def.sites[id]!
      const cap = r.cells.map((i) => grid[i]!.p).sort((a, b) => (a[0] - site[0]) ** 2 + (a[1] - site[1]) ** 2 - ((b[0] - site[0]) ** 2 + (b[1] - site[1]) ** 2))[0]!
      capitals[id] = cap
    }
  }

  // Mountains run in ranges: along the ridge lines of the noise, away from the coast.
  const mountains: Point[] = []
  grid.forEach((c, i) => {
    if (owner[i]!.sea || i % 2) return
    const [x, y] = c.p
    const ridge = 1 - Math.abs(noise(x / 150, y / 150, seed + 99))
    const high = noise(x / 300, y / 300, seed + 101)
    const coastal = c.next.some((j) => j >= 0 && owner[j]!.sea)
    if (ridge > 0.9 && high > 0.05 && !coastal) mountains.push([fmt(x), fmt(y)])
  })

  return { width: def.width, height: def.height, regions, neighbours, borders, coast: lineD(chain(coastSegs)), mountains, capitals }
}

const drawn = new WeakMap<WorldMapDef, MapData>()

// The pack's map, drawn once per pack.
export function worldMap(content: Content): MapData | null {
  const def = content.world.map
  if (!def) return null
  let d = drawn.get(def)
  if (!d) {
    d = draw(def)
    drawn.set(def, d)
  }
  return d
}

// For the fitting script: a map drawn from points not yet in a pack.
export function drawMap(def: WorldMapDef): MapData {
  return draw(def)
}

// Where the map's borders differ from the rules': each pair of nations that touch on the map
// but do not border, or border but do not touch. Empty when the map is true to the rules.
export function mapProblems(content: Content): string[] {
  const m = content.world.map
  if (!m) return []
  const problems: string[] = []
  const ids = [HOME, ...content.neighbours.map((n) => n.id)]
  for (const id of ids) if (!m.sites[id]) problems.push(`${id} has no place on the map`)
  for (const id of Object.keys(m.sites)) if (!ids.includes(id)) problems.push(`the map places ${id}, which is not a nation`)
  if (problems.length) return problems
  const map = worldMap(content)!
  const borders = (id: string): string[] =>
    id === HOME ? content.neighbours.filter((n) => n.near).map((n) => n.id) : [...(content.neighbours.find((n) => n.id === id)?.borders ?? []), ...(content.neighbours.find((n) => n.id === id)?.near ? [HOME] : [])]
  for (const a of ids) {
    if (!map.regions.some((r) => r.id === a)) {
      problems.push(`${a} has no land on the map`)
      continue
    }
    const touching = map.neighbours[a] ?? []
    for (const b of ids) {
      if (a >= b) continue
      const should = borders(a).includes(b)
      const does = touching.includes(b)
      if (should && !does) problems.push(`${a} and ${b} border each other but do not touch on the map`)
      if (!should && does) problems.push(`${a} and ${b} touch on the map but do not border each other`)
    }
  }
  return problems
}
