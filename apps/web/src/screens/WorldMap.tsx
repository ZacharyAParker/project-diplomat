import { HOME, activeWars, allies, nameOf, standingWith, worldMap, type Content, type GameState, type MapRegion } from '@diplomat/engine'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { moodWord } from '../logic/nation.ts'
import { Segmented } from '../ui/index.ts'

type View = 'atlas' | 'relations'

// The atlas's colours: soft, distinct, and never the same on both sides of a border.
const TINTS = ['var(--atlas-1)', 'var(--atlas-2)', 'var(--atlas-3)', 'var(--atlas-4)', 'var(--atlas-5)', 'var(--atlas-6)']

function colouring(regions: MapRegion[], neighbours: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {}
  // Largest first, each taking the first colour none of its neighbours has.
  for (const r of [...regions].filter((x) => !x.sea && x.id !== HOME).sort((a, b) => b.area - a.area)) {
    const taken = new Set((neighbours[r.id] ?? []).map((n) => out[n]))
    out[r.id] = TINTS.find((t) => !taken.has(t)) ?? TINTS[0]!
  }
  return out
}

// The map of the world, drawn like an atlas: water lines along the coast, the land in soft
// colours, borders dashed, mountains, capitals, a compass and a scale. A second view shades each
// nation by how it stands with the player. Fronts of every war are marked in red; annexed
// nations are hatched. Pick a nation to read about it below.
export function WorldMap({ state, content, onPick }: { state: GameState; content: Content; onPick(id: string): void }) {
  const map = useMemo(() => worldMap(content), [content])
  const [view, setView] = useState<View>('atlas')
  const tints = useMemo(() => (map ? colouring(map.regions, map.neighbours) : {}), [map])
  if (!map || !state.world) return null
  const w = state.world
  const mine = new Set(allies(state, HOME))
  const land = map.regions.filter((r) => !r.sea)
  const name = (id: string) => (id === HOME ? state.identity.name : nameOf(state, content, id))
  const capital = (id: string) => (id === HOME ? state.identity.capital : content.neighbours.find((n) => n.id === id)?.capital)

  const warring = (a: string, b: string) => activeWars(state).some((war) => (war.attackers.includes(a) && war.defenders.includes(b)) || (war.attackers.includes(b) && war.defenders.includes(a)))
  const fronts = map.borders.filter((b) => warring(b.between[0], b.between[1]))

  const fill = (r: MapRegion): string => {
    const n = w.nations[r.id]
    if (n && !n.free) return n.ruler === HOME ? 'url(#map-ours)' : 'url(#map-annexed)'
    if (r.id === HOME) return 'var(--map-home)'
    if (view === 'atlas') return tints[r.id] ?? TINTS[0]!
    const s = standingWith(state, content, r.id)
    const share = Math.min(75, Math.round(Math.abs(s) * 0.75))
    return `color-mix(in srgb, ${s >= 0 ? 'var(--map-friend)' : 'var(--map-foe)'} ${share}%, var(--map-land))`
  }
  const label = (r: MapRegion): string => {
    if (r.id === HOME) return `${state.identity.name}, capital ${state.identity.capital}: your country`
    const n = w.nations[r.id]
    if (n && !n.free) return `${name(r.id)}: annexed by ${name(n.ruler ?? '')}`
    const at = activeWars(state).some((war) => war.attackers.includes(r.id) || war.defenders.includes(r.id))
    return `${name(r.id)}: ${moodWord(standingWith(state, content, r.id)).toLowerCase()}${mine.has(r.id) ? ', in a pact with you' : ''}${at ? ', at war' : ''}`
  }
  const key = (id: string) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPick(id)
    }
  }
  const size = (r: MapRegion) => Math.max(10, Math.min(19, Math.sqrt(r.area) / 9))
  // A country's name sits at its middle, unless its capital is there: then just above the capital.
  const namePlace = (r: MapRegion): [number, number] => {
    const cap = map.capitals[r.id]
    if (cap && Math.hypot(cap[0] - r.centre[0], cap[1] - (r.centre[1] - 10)) < 34) return [cap[0] + 4, cap[1] - 20]
    return [r.centre[0], r.centre[1] - 10]
  }
  const scale = 100
  // Mountains keep clear of the names and capitals, as an engraver would leave them.
  const marks = land.flatMap((r) => [namePlace(r), ...(map.capitals[r.id] ? [map.capitals[r.id]!] : [])])
  const peaks = map.mountains.filter(([x, y]) => marks.every(([mx, my]) => Math.abs(mx - x) > 55 || Math.abs(my - y) > 16))

  return (
    <figure className="world-map">
      <div className="world-map__view">
        <Segmented<View>
          legend="Map"
          legendHidden
          options={[
            { value: 'atlas', label: 'Atlas' },
            { value: 'relations', label: 'How they feel about you' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      <svg viewBox={`0 0 ${map.width} ${map.height}`} role="group" aria-label={`A map of the world: ${state.identity.name} and twenty other nations`}>
        <defs>
          <linearGradient id="map-deep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--map-sea)" />
            <stop offset="1" stopColor="var(--map-deep)" />
          </linearGradient>
          <filter id="map-paper" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0.07" />
            </feComponentTransfer>
          </filter>
          <pattern id="map-annexed" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="9" height="9" fill="var(--map-land)" />
            <line x1="0" y1="0" x2="0" y2="9" stroke="var(--map-border)" strokeWidth="2.5" />
          </pattern>
          <pattern id="map-ours" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="9" height="9" fill="var(--map-home)" />
            <line x1="0" y1="0" x2="0" y2="9" stroke="var(--map-border)" strokeWidth="1.5" />
          </pattern>
        </defs>

        <rect width={map.width} height={map.height} fill="url(#map-deep)" />
        {/* Water lines: the rings of shallower water an engraver draws along a coast. */}
        {[34, 26, 18, 10].map((width, i) => (
          <path key={width} d={map.coast} className={i % 2 ? 'world-map__ring world-map__ring--sea' : 'world-map__ring'} strokeWidth={width} />
        ))}

        {land.map((r) => (
          <g key={r.id} className="world-map__nation" role="button" tabIndex={0} aria-label={label(r)} onClick={() => onPick(r.id)} onKeyDown={key(r.id)}>
            <title>{label(r)}</title>
            <path d={r.d} style={{ fill: fill(r), stroke: fill(r) }} className="world-map__land" />
          </g>
        ))}
        <rect width={map.width} height={map.height} filter="url(#map-paper)" className="world-map__grain" />

        {map.borders.map((b) => (
          <g key={b.between.join('|')} className="world-map__border">
            <path d={b.d} className="world-map__border-band" />
            <path d={b.d} className="world-map__border-line" />
          </g>
        ))}
        {fronts.map((b) => (
          <path key={`front:${b.between.join('|')}`} d={b.d} className="world-map__front" />
        ))}
        <path d={map.coast} className="world-map__coast" />

        {peaks.map(([x, y], i) => (
          <g key={i} className="world-map__peak" aria-hidden="true">
            <path d={`M${x - 6},${y + 4}L${x},${y - 5}L${x + 6},${y + 4}Z`} className="world-map__peak-light" />
            <path d={`M${x},${y - 5}L${x + 6},${y + 4}L${x + 1},${y + 4}Z`} className="world-map__peak-shade" />
          </g>
        ))}

        {fronts.map((b) => (
          <g key={`battle:${b.between.join('|')}`} className="world-map__battle" transform={`translate(${b.middle[0]},${b.middle[1]})`} aria-hidden="true">
            <circle r="10" />
            <path d="M-5,-5L5,5M5,-5L-5,5" />
          </g>
        ))}

        {land.map((r) => {
          const cap = map.capitals[r.id]
          const city = capital(r.id)
          return cap && city ? (
            <g key={`cap:${r.id}`} className={r.id === HOME ? 'world-map__capital world-map__capital--home' : 'world-map__capital'} aria-hidden="true">
              <circle cx={cap[0]} cy={cap[1]} r={r.id === HOME ? 4.5 : 3.2} />
              <text x={cap[0] + 7} y={cap[1] + 4}>
                {city}
              </text>
            </g>
          ) : null
        })}
        {land.map((r) => (
          <text
            key={`name:${r.id}`}
            x={namePlace(r)[0]}
            y={namePlace(r)[1]}
            className={r.id === HOME ? 'world-map__name world-map__name--home' : 'world-map__name'}
            style={{ fontSize: `${size(r)}px` }}
            aria-hidden="true"
          >
            {name(r.id).toUpperCase()}
            {mine.has(r.id) ? ' ★' : ''}
          </text>
        ))}

        {/* A compass rose in the north-east sea, and a scale in the north-west. */}
        <g className="world-map__compass" transform={`translate(${map.width - 48},52)`} aria-hidden="true">
          <circle r="22" />
          <path d="M0,-30L5,0L0,30L-5,0Z" />
          <path d="M-30,0L0,5L30,0L0,-5Z" className="world-map__compass-cross" />
          <text y="-35">N</text>
        </g>
        <g className="world-map__scale" transform="translate(30,30)" aria-hidden="true">
          <path d={`M0,0H${scale}M0,-5V5M${scale / 2},-4V4M${scale},-5V5`} />
          <rect x="0" y="-2" width={scale / 2} height="4" />
          <text x="0" y="17">0</text>
          <text x={scale} y="17">200 leagues</text>
        </g>
      </svg>
      <figcaption className="world-map__legend small">
        <span>★ In a pact with you</span>
        <span>
          <i className="world-map__key world-map__key--front" /> A front
        </span>
        <span>
          <i className="world-map__key world-map__key--annexed" /> Annexed
        </span>
        {view === 'relations' && (
          <>
            <span>
              <i className="world-map__key world-map__key--friend" /> Warm to you
            </span>
            <span>
              <i className="world-map__key world-map__key--foe" /> Hostile
            </span>
          </>
        )}
      </figcaption>
    </figure>
  )
}
