// A world cheat read from a request: the Director's cheat_world tool and the sandbox's
// { world } both send one. Exactly one of war, peace, relation, annex, free, pact or unpact.

import type { WorldCheat } from '@diplomat/engine'
import { HttpError } from './http.ts'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function idOf(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^[a-z][a-z0-9_-]{0,60}$/.test(v)) throw new HttpError(400, `${what} must be a nation or war id.`)
  return v
}

function numberOf(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, `${what} must be a number.`)
  return v
}

export function readWorldCheat(args: Record<string, unknown>): WorldCheat {
  const kinds = ['war', 'peace', 'relation', 'annex', 'free', 'pact', 'unpact'].filter((k) => args[k] !== undefined)
  if (kinds.length !== 1) throw new HttpError(400, 'Give exactly one of war, peace, relation, annex, free, pact or unpact.')
  const kind = kinds[0]!
  const v = args[kind]
  const o = (what: string) => {
    if (!isObject(v)) throw new HttpError(400, `${kind} must be an object: ${what}.`)
    return v
  }
  const id = (x: unknown, what: string) => idOf(x, what)
  switch (kind) {
    case 'war': {
      const a = o('{ attacker, defender }')
      return { war: { attacker: id(a['attacker'], 'war.attacker'), defender: id(a['defender'], 'war.defender') } }
    }
    case 'peace': {
      const a = o('{ war, outcome: attackers | defenders | ceasefire, total? }')
      const outcome = a['outcome']
      if (outcome !== 'attackers' && outcome !== 'defenders' && outcome !== 'ceasefire') throw new HttpError(400, 'peace.outcome must be attackers, defenders or ceasefire.')
      return { peace: { war: id(a['war'], 'peace.war'), outcome, ...(typeof a['total'] === 'boolean' ? { total: a['total'] } : {}) } }
    }
    case 'relation': {
      const a = o('{ a, b, to }')
      return { relation: { a: id(a['a'], 'relation.a'), b: id(a['b'], 'relation.b'), to: numberOf(a['to'], 'relation.to') } }
    }
    case 'annex': {
      const a = o('{ target, ruler }')
      return { annex: { target: id(a['target'], 'annex.target'), ruler: id(a['ruler'], 'annex.ruler') } }
    }
    case 'free':
      return { free: id(v, 'free') }
    default: {
      const a = o('{ a, b }')
      const pair = { a: id(a['a'], `${kind}.a`), b: id(a['b'], `${kind}.b`) }
      return kind === 'pact' ? { pact: pair } : { unpact: pair }
    }
  }
}
