// Keeps the government's own record of itself in step with the engine. The engine replaces
// ministers who resign and whole cabinets when a government falls or loses, and moves the
// factions' approval every day; the institutions were drawn from all that at founding and do
// not see it happen. After each night the server brings them up to date here.

import type { GameState, TimelineEntry } from '@diplomat/engine'
import type { Institutions } from './types.ts'
import { apportion } from './util.ts'

export interface Renewal {
  institutions: Institutions
  // In words, for the record: "Ilse Rautio takes the Ministry of Health from Bram Novak."
  changes: string[]
}

// Each ministry is held by whoever the engine's cabinet says holds the portfolio. After an
// election or a fall, a legislature of parties is reseated by the factions each party
// carries, weighed as they were at founding: clout, and approval as it now stands.
export function renewInstitutions(input: Institutions, state: GameState, night: readonly TimelineEntry[]): Renewal {
  const institutions = structuredClone(input)
  const changes: string[] = []

  for (const body of institutions.bodies) {
    if (body.kind !== 'ministry' || !body.portfolio) continue
    const holder = state.cabinet[body.portfolio]?.name
    const member = body.members[0]
    if (!holder || !member || member.name === holder) continue
    changes.push(`${holder} takes ${body.name.replace(/^The /, 'the ')} from ${member.name}.`)
    body.members[0] = { ...member, name: holder }
  }

  const polled = night.some((e) => e.kind === 'election' || e.kind === 'government')
  if (polled) {
    for (const body of institutions.bodies) {
      if (body.kind !== 'legislature' || body.parties.length < 2) continue
      const weights = body.parties.map((p) =>
        p.factions.reduce((sum, id) => {
          const f = state.factions[id]
          return f ? sum + f.clout * (0.5 + f.approval / 100) : sum
        }, 0),
      )
      // A party that carries no faction the engine knows keeps its seats out of the count.
      if (weights.every((w) => w === 0)) continue
      const seats = apportion(body.size, weights, 1)
      const moved = body.parties.filter((p, i) => p.seats !== seats[i])
      if (moved.length === 0) continue
      body.parties = body.parties.map((p, i) => ({ ...p, seats: seats[i]! })).sort((a, b) => b.seats - a.seats)
      changes.push(
        `${body.name} is reseated: ` +
          body.parties.map((p) => `${p.name} ${p.seats}`).join(', ') +
          '.',
      )
    }
  }
  return { institutions, changes }
}
