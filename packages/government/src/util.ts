// Small helpers shared by the government modules. The random numbers are the engine's own
// mulberry32, keyed the same way (see packages/engine/src/rng.ts), copied here because the
// engine does not export its rng and a government should not reach into another package.

export type Rng = () => number

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rngFor(seed: number, day: number, purpose: string): Rng {
  let a = (seed ^ Math.imul(day + 1, 0x9e3779b1) ^ hash(purpose)) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)]
  if (item === undefined) throw new Error('pick from empty list')
  return item
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const swap = out[i]!
    out[i] = out[j]!
    out[j] = swap
  }
  return out
}

// A whole number from lo to hi inclusive.
export const between = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))

// Splits total into whole shares proportional to the weights, by largest remainder, so the
// parts always add up exactly. Every weight above zero gets at least `floor` if it can.
export function apportion(total: number, weights: readonly number[], floor = 0): number[] {
  const n = weights.length
  if (n === 0) return []
  const each = total >= floor * n ? floor : 0
  const rest = total - each * n
  const clean = weights.map((w) => (Number.isFinite(w) ? Math.max(0, w) : 0))
  const sum = clean.reduce((a, b) => a + b, 0)
  const exact = clean.map((w) => (sum > 0 ? w / sum : 1 / n) * rest)
  const parts = exact.map(Math.floor)
  let left = rest - parts.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i)
  for (let k = 0; left > 0; k = (k + 1) % n, left--) parts[order[k]!.i]!++
  return parts.map((p) => p + each)
}

// The nation's name inside a template's long name: "The Kingdom of Vesland" gives Vesland.
export function nationOf(stateName: string): string {
  const at = stateName.lastIndexOf(' of ')
  return at < 0 ? stateName : stateName.slice(at + 4)
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// "Option 2", or "dismissal", for running text.
export function courseName(course: string, courses: readonly string[]): string {
  if (course === 'dismiss') return 'dismissal'
  const options = courses.filter((c) => c !== 'dismiss')
  const at = options.indexOf(course)
  return at < 0 ? `the course "${course}"` : `Option ${at + 1}`
}

// The first letter in capitals, for a sentence that starts with a name.
export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
