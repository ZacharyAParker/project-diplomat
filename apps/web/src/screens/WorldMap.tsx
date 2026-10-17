import { HOME, activeWars, allies, nameOf, standingWith, worldMap, type Content, type GameState, type MapCell, type Point } from '@diplomat/engine'
import { useMemo, type KeyboardEvent } from 'react'
import { moodWord } from '../logic/nation.ts'

const path = (points: Point[]) => `M${points.map((p) => p.join(',')).join('L')}Z`

// The map of the world: every nation where it lies, shaded by how it stands with the player,
// with the player's own country in gold, its allies outlined, the fronts of every war in red,
// and annexed nations hatched in their ruler's name. Pick a nation to read about it below.
export function WorldMap({ state, content, onPick }: { state: GameState; content: Content; onPick(id: string): void }) {
  const cells = useMemo(() => worldMap(content), [content])
  const map = content.world.map
  if (!map || !state.world || cells.length === 0) return null
  const w = state.world
  const mine = new Set(allies(state, HOME))
  const land = cells.filter((c) => !c.sea)
  const byId = new Map(land.map((c) => [c.id, c]))

  // Where two sides of a war meet: the edges they share.
  const fronts: { key: string; a: Point; b: Point }[] = []
  for (const war of activeWars(state)) {
    for (const x of war.attackers) {
      for (const e of byId.get(x)?.edges ?? []) {
        if (war.defenders.includes(e.with)) fronts.push({ key: `${war.id}:${x}:${e.with}:${e.a.join()}`, a: e.a, b: e.b })
      }
    }
  }

  const fill = (c: MapCell): string => {
    if (c.id === HOME) return 'var(--map-home)'
    const n = w.nations[c.id]
    if (n && !n.free) return n.ruler === HOME ? 'url(#map-ours)' : 'url(#map-annexed)'
    const s = standingWith(state, content, c.id)
    const share = Math.min(70, Math.round(Math.abs(s) * 0.7))
    return `color-mix(in srgb, ${s >= 0 ? 'var(--map-friend)' : 'var(--map-foe)'} ${share}%, var(--map-land))`
  }
  const label = (c: MapCell): string => {
    if (c.id === HOME) return `${state.identity.name}: your country`
    const n = w.nations[c.id]
    if (n && !n.free) return `${nameOf(state, content, c.id)}: annexed by ${nameOf(state, content, n.ruler ?? '')}`
    const at = activeWars(state).some((war) => war.attackers.includes(c.id) || war.defenders.includes(c.id))
    return `${nameOf(state, content, c.id)}: ${moodWord(standingWith(state, content, c.id)).toLowerCase()}${mine.has(c.id) ? ', in a pact with you' : ''}${at ? ', at war' : ''}`
  }
  const key = (id: string) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPick(id)
    }
  }

  return (
    <figure className="world-map">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} role="group" aria-label={`A map of the world: ${state.identity.name} and twenty other nations`}>
        <defs>
          <pattern id="map-annexed" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="var(--map-land)" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="var(--map-border)" strokeWidth="3" />
          </pattern>
          <pattern id="map-ours" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="var(--map-home)" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="var(--map-border)" strokeWidth="2" />
          </pattern>
        </defs>
        {cells
          .filter((c) => c.sea)
          .map((c) => (
            <path key={c.id} d={path(c.points)} className="world-map__sea" />
          ))}
        {land.map((c) => (
          <g
            key={c.id}
            className="world-map__nation"
            role="button"
            tabIndex={0}
            aria-label={label(c)}
            onClick={() => onPick(c.id)}
            onKeyDown={key(c.id)}
          >
            <title>{label(c)}</title>
            <path d={path(c.points)} style={{ fill: fill(c) }} className={mine.has(c.id) ? 'world-map__land world-map__land--ally' : 'world-map__land'} />
          </g>
        ))}
        {fronts.map((f) => (
          <line key={f.key} x1={f.a[0]} y1={f.a[1]} x2={f.b[0]} y2={f.b[1]} className="world-map__front" />
        ))}
        {/* A mark on each front, so a war shows even where the border is short. */}
        {fronts.map((f) => (
          <circle key={`${f.key}:mark`} cx={(f.a[0] + f.b[0]) / 2} cy={(f.a[1] + f.b[1]) / 2} r="9" className="world-map__battle" />
        ))}
        {land.map((c) => (
          <text key={c.id} x={c.centre[0]} y={c.centre[1]} className={c.id === HOME ? 'world-map__name world-map__name--home' : 'world-map__name'} aria-hidden="true">
            {c.id === HOME ? state.identity.name : nameOf(state, content, c.id)}
          </text>
        ))}
      </svg>
      <figcaption className="world-map__legend small">
        <span>
          <i className="world-map__key world-map__key--friend" /> Warm to you
        </span>
        <span>
          <i className="world-map__key world-map__key--foe" /> Hostile
        </span>
        <span>
          <i className="world-map__key world-map__key--ally" /> In a pact with you
        </span>
        <span>
          <i className="world-map__key world-map__key--front" /> A front
        </span>
        <span>
          <i className="world-map__key world-map__key--annexed" /> Annexed
        </span>
      </figcaption>
    </figure>
  )
}
