import { pick, type Rng } from './rng.ts'

export interface FlagSpec {
  layout: string
  colours: string[]
}

export interface Tincture {
  id: string
  name: string
  hex: string
  // The old rule of heraldry: a metal next to a colour always reads, two of a kind may not.
  metal: boolean
}

export const PALETTE: readonly Tincture[] = [
  { id: 'argent', name: 'White', hex: '#f2efe6', metal: true },
  { id: 'or', name: 'Gold', hex: '#d9a521', metal: true },
  { id: 'gules', name: 'Red', hex: '#a61b29', metal: false },
  { id: 'murrey', name: 'Maroon', hex: '#6b1f3a', metal: false },
  { id: 'tenne', name: 'Orange', hex: '#c2611f', metal: false },
  { id: 'vert', name: 'Green', hex: '#1e6b4a', metal: false },
  { id: 'celeste', name: 'Sky blue', hex: '#6c9bc4', metal: false },
  { id: 'azure', name: 'Blue', hex: '#1d4e89', metal: false },
  { id: 'navy', name: 'Navy', hex: '#152a4f', metal: false },
  { id: 'purpure', name: 'Purple', hex: '#5a2d6b', metal: false },
  { id: 'sable', name: 'Black', hex: '#1a1a1d', metal: false },
]

export const FLAG_WIDTH = 60
export const FLAG_HEIGHT = 40

export type Shape =
  | { type: 'rect'; x: number; y: number; w: number; h: number; fill: number }
  | { type: 'polygon'; points: string; fill: number }
  | { type: 'circle'; cx: number; cy: number; r: number; fill: number }

export interface Layout {
  id: string
  name: string
  // One label per colour the layout uses, in the order the colours are stored.
  parts: string[]
  shapes: Shape[]
}

const W = FLAG_WIDTH
const H = FLAG_HEIGHT
const rect = (x: number, y: number, w: number, h: number, fill: number): Shape => ({
  type: 'rect',
  x,
  y,
  w,
  h,
  fill,
})
const polygon = (points: string, fill: number): Shape => ({ type: 'polygon', points, fill })
const field = rect(0, 0, W, H, 0)

export const LAYOUTS: readonly Layout[] = [
  {
    id: 'bands',
    name: 'Three bands',
    parts: ['Top', 'Middle', 'Bottom'],
    shapes: [rect(0, 0, W, H / 3, 0), rect(0, H / 3, W, H / 3, 1), rect(0, (2 * H) / 3, W, H / 3, 2)],
  },
  {
    id: 'bicolour',
    name: 'Two bands',
    parts: ['Top', 'Bottom'],
    shapes: [rect(0, 0, W, H / 2, 0), rect(0, H / 2, W, H / 2, 1)],
  },
  {
    id: 'pales',
    name: 'Tricolour',
    parts: ['Hoist', 'Centre', 'Fly'],
    shapes: [rect(0, 0, W / 3, H, 0), rect(W / 3, 0, W / 3, H, 1), rect((2 * W) / 3, 0, W / 3, H, 2)],
  },
  {
    id: 'stripe',
    name: 'Broad stripe',
    parts: ['Field', 'Stripe'],
    shapes: [field, rect(0, H / 4, W, H / 2, 1)],
  },
  {
    id: 'cross',
    name: 'Cross',
    parts: ['Field', 'Cross'],
    shapes: [field, rect(17, 0, 8, H, 1), rect(0, 16, W, 8, 1)],
  },
  { id: 'canton', name: 'Canton', parts: ['Field', 'Canton'], shapes: [field, rect(0, 0, 26, 20, 1)] },
  {
    id: 'disc',
    name: 'Disc',
    parts: ['Field', 'Disc'],
    shapes: [field, { type: 'circle', cx: 30, cy: 20, r: 11, fill: 1 }],
  },
  {
    id: 'border',
    name: 'Border',
    parts: ['Field', 'Border'],
    shapes: [rect(0, 0, W, H, 1), rect(6, 6, W - 12, H - 12, 0)],
  },
  {
    id: 'chevron',
    name: 'Chevron',
    parts: ['Top', 'Chevron', 'Bottom'],
    shapes: [rect(0, 0, W, H / 2, 0), rect(0, H / 2, W, H / 2, 2), polygon('0,0 27,20 0,40', 1)],
  },
  {
    id: 'quartered',
    name: 'Quartered',
    parts: ['First and fourth', 'Second and third'],
    shapes: [field, rect(W / 2, 0, W / 2, H / 2, 1), rect(0, H / 2, W / 2, H / 2, 1)],
  },
  {
    id: 'saltire',
    name: 'Saltire',
    parts: ['Field', 'Saltire'],
    shapes: [field, polygon('0,0 7,0 60,35 60,40 53,40 0,5', 1), polygon('60,0 53,0 0,35 0,40 7,40 60,5', 1)],
  },
  {
    id: 'bend',
    name: 'Diagonal',
    parts: ['Upper', 'Lower'],
    shapes: [polygon('0,0 60,0 0,40', 0), polygon('60,0 60,40 0,40', 1)],
  },
]

const PLAIN: Layout = { id: 'plain', name: 'Plain field', parts: ['Field'], shapes: [field] }
const UNKNOWN_COLOUR = '#8a8a86'

export const DEFAULT_FLAG: FlagSpec = { layout: 'bands', colours: ['#1d4e89', '#f2efe6', '#a61b29'] }

// A flag comes out of a save file, which may have been edited by hand or written by a
// later version, so nothing in it is trusted: an unknown layout is a plain field, and
// anything that is not a six-digit hex colour is grey.
export function layoutFor(id: string): Layout {
  return LAYOUTS.find((l) => l.id === id) ?? PLAIN
}

export function safeColour(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : UNKNOWN_COLOUR
}

export function flagShapes(flag: FlagSpec): { shape: Shape; colour: string }[] {
  return layoutFor(flag.layout).shapes.map((shape) => ({
    shape,
    colour: safeColour(flag.colours[shape.fill]),
  }))
}

export function colourName(hex: string): string {
  return PALETTE.find((t) => t.hex === safeColour(hex))?.name ?? 'Grey'
}

export function describeFlag(flag: FlagSpec): string {
  const layout = layoutFor(flag.layout)
  const colours = layout.parts.map((_, i) => colourName(flag.colours[i] ?? '').toLowerCase())
  return `${layout.name}: ${colours.join(', ')}`
}

// Keeps what was already picked when the layout changes, and fills any new slot with a
// colour that is not on the flag yet.
export function fitColours(layoutId: string, colours: readonly string[]): string[] {
  const wanted = layoutFor(layoutId).parts.length
  const kept = colours.slice(0, wanted).map(safeColour)
  for (const tincture of PALETTE) {
    if (kept.length >= wanted) break
    if (!kept.includes(tincture.hex)) kept.push(tincture.hex)
  }
  return kept
}

export function withLayout(flag: FlagSpec, layoutId: string): FlagSpec {
  return { layout: layoutId, colours: fitColours(layoutId, flag.colours) }
}

export function withColour(flag: FlagSpec, slot: number, hex: string): FlagSpec {
  const colours = fitColours(flag.layout, flag.colours)
  if (slot >= 0 && slot < colours.length) colours[slot] = safeColour(hex)
  return { layout: flag.layout, colours }
}

// Alternates metal and colour from slot to slot, so a random flag never puts navy on black.
export function randomFlag(rng: Rng): FlagSpec {
  const layout = pick(rng, LAYOUTS)
  const metalFirst = rng() < 0.35
  const colours: string[] = []
  layout.parts.forEach((_, i) => {
    const wantMetal = (i % 2 === 0) === metalFirst
    const pool = PALETTE.filter((t) => t.metal === wantMetal)
    const fresh = pool.filter((t) => !colours.includes(t.hex))
    colours.push(pick(rng, fresh.length ? fresh : pool).hex)
  })
  return { layout: layout.id, colours }
}
