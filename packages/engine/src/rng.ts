export type Rng = () => number

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32. Keyed by seed, day and a purpose string so that asking for
// today's agenda twice gives the same answer without storing rng state.
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

export function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0)
  let roll = rng() * total
  for (const item of items) {
    roll -= weight(item)
    if (roll < 0) return item
  }
  return pick(rng, items)
}
