// A nation's own world: the nations and the map generated for it (generate.ts), or the pack's
// own continent for a nation that has none. Everything that reads the other nations goes
// through here, so a generated world and the classic one are played the same way.

import type { Content, NationState, NeighbourDef, WorldMapDef } from './types.ts'

const cache = new WeakMap<object, Content>()

export function nationDefs(state: NationState, content: Content): NeighbourDef[] {
  return state.generated?.nations ?? content.neighbours
}

export function mapDef(state: NationState, content: Content): WorldMapDef | undefined {
  return state.generated?.map ?? content.world.map
}

// The pack with this nation's world in place of the pack's: the same object every time for the
// same generated world, so anything memoised on it stays memoised.
export function ownContent(state: NationState, content: Content): Content {
  const g = state.generated
  if (!g) return content
  let c = cache.get(g)
  if (!c || c.dilemmas !== content.dilemmas) {
    c = { ...content, neighbours: g.nations, world: { ...content.world, map: g.map, borderlands: g.borderlands } }
    cache.set(g, c)
  }
  return c
}
