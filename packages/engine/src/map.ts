// The map: a Voronoi diagram of the pack's sites, each nation the land nearer its own point
// than any other, with sea sites ringing the coast and keeping apart nations that do not
// border each other. Pure geometry with no dependencies, so the validator can check that the
// borders drawn are the borders the rules use, and the web page can draw them.

import { HOME, type Content } from './types.ts'

export type Point = [number, number]

export interface MapCell {
  id: string
  sea: boolean
  points: Point[]
  // The sites this cell shares an edge with, by id. Sea sites are named sea-0, sea-1 and so on.
  neighbours: string[]
  // Each shared edge, with whom: for drawing borders and fronts.
  edges: { with: string; a: Point; b: Point }[]
  // The middle of the cell, for its label.
  centre: Point
}

interface Vertex {
  p: Point
  // The site whose bisector the edge from this vertex to the next lies on; '' for the frame.
  tag: string
}

const EPS = 1e-6

// One cell: the frame, cut by the half-plane nearer `site` than each other site in turn.
function cellOf(site: { id: string; p: Point }, others: { id: string; p: Point }[], width: number, height: number): Vertex[] {
  let poly: Vertex[] = [
    { p: [0, 0], tag: '' },
    { p: [width, 0], tag: '' },
    { p: [width, height], tag: '' },
    { p: [0, height], tag: '' },
  ]
  const [sx, sy] = site.p
  for (const o of others) {
    const [ox, oy] = o.p
    // Points q with (q - mid) . (o - s) <= 0 are nearer s.
    const nx = ox - sx
    const ny = oy - sy
    const mx = (sx + ox) / 2
    const my = (sy + oy) / 2
    const side = (q: Point) => (q[0] - mx) * nx + (q[1] - my) * ny
    const out: Vertex[] = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!
      const b = poly[(i + 1) % poly.length]!
      const da = side(a.p)
      const db = side(b.p)
      const ain = da <= EPS
      const bin = db <= EPS
      if (ain) out.push(a)
      if (ain !== bin) {
        const t = da / (da - db)
        const q: Point = [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t]
        // Entering the kept side the new vertex starts the old edge's remainder; leaving it,
        // the new vertex starts the edge along this bisector.
        out.push({ p: q, tag: ain ? o.id : a.tag })
      }
    }
    poly = out
    if (poly.length < 3) break
  }
  return poly
}

function centreOf(points: Point[]): Point {
  // The area-weighted centroid of the polygon.
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]!
    const [x1, y1] = points[(i + 1) % points.length]!
    const cross = x0 * y1 - x1 * y0
    a += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  if (Math.abs(a) < EPS) return points[0] ?? [0, 0]
  return [cx / (3 * a), cy / (3 * a)]
}

export function voronoi(sites: { id: string; p: Point; sea?: boolean }[], width: number, height: number): MapCell[] {
  return sites.map((site) => {
    const poly = cellOf(site, sites.filter((o) => o !== site), width, height)
    const neighbours = new Set<string>()
    const edges: MapCell['edges'] = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!
      const b = poly[(i + 1) % poly.length]!
      const length = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1])
      // A shared corner is not a border: an edge has to have some length to count.
      if (a.tag && length > 2) {
        neighbours.add(a.tag)
        edges.push({ with: a.tag, a: a.p, b: b.p })
      }
    }
    const points = poly.map((v) => [Math.round(v.p[0] * 10) / 10, Math.round(v.p[1] * 10) / 10] as Point)
    return { id: site.id, sea: Boolean(site.sea), points, neighbours: [...neighbours].sort(), edges, centre: centreOf(points) }
  })
}

// The pack's map as cells: every nation, the player's (HOME) and the sea.
export function worldMap(content: Content): MapCell[] {
  const m = content.world.map
  if (!m) return []
  const sites = [
    ...Object.entries(m.sites).map(([id, p]) => ({ id, p })),
    ...m.sea.map((p, i) => ({ id: `sea-${i}`, p, sea: true })),
  ]
  return voronoi(sites, m.width, m.height)
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
  const cells = new Map(worldMap(content).map((c) => [c.id, c]))
  const borders = (id: string): string[] =>
    id === HOME ? content.neighbours.filter((n) => n.near).map((n) => n.id) : [...(content.neighbours.find((n) => n.id === id)?.borders ?? []), ...(content.neighbours.find((n) => n.id === id)?.near ? [HOME] : [])]
  for (const a of ids) {
    const touching = (cells.get(a)?.neighbours ?? []).filter((x) => !x.startsWith('sea-'))
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
