export type Rng = () => number

// The engine keeps its own generator for the game. This one is only for suggestions and
// the newspaper's name, where nothing has to match a save.
export function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  if (list.length === 0) throw new Error('nothing to pick from')
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!
}

export function pickOther<T>(rng: Rng, list: readonly T[], current: T): T {
  const others = list.filter((item) => item !== current)
  return others.length ? pick(rng, others) : pick(rng, list)
}
