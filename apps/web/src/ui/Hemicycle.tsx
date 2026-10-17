import type { Party } from '@diplomat/government'
import { useMemo } from 'react'
import { safeHex } from '../logic/docket.ts'
import { CHART, hemicycle } from '../logic/hemicycle.ts'

export interface HemicycleProps {
  name: string
  parties: readonly Party[]
  // A line under the total: "76 carry a question, 101 bind the Steward".
  note?: string
}

// The seat chart: one dot per seat in the party's colour. The colour is never the only
// way to tell: the table beside it names every party with its seats, and the chart's own
// label says the same in words.
export function HemicycleChart({ name, parties, note }: HemicycleProps) {
  const chart = useMemo(() => hemicycle(parties.map((p) => p.seats)), [parties])
  const total = parties.reduce((sum, p) => sum + p.seats, 0)
  const label = `Seat chart of ${name}: ${parties.map((p) => `${p.name} ${p.seats}`).join('; ')}`
  return (
    <svg className="hemicycle" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={label}>
      {parties.map((party, index) => (
        <g key={party.id} fill={safeHex(party.colour)} className="hemicycle__party">
          {chart.seats
            .filter((seat) => seat.party === index)
            .map((seat, i) => (
              <circle key={i} cx={seat.x.toFixed(1)} cy={seat.y.toFixed(1)} r={chart.radius.toFixed(1)} />
            ))}
        </g>
      ))}
      <text className="hemicycle__total" x={CHART.width / 2} y={CHART.height - 52} textAnchor="middle">
        {total}
      </text>
      <text className="hemicycle__sub" x={CHART.width / 2} y={CHART.height - 32} textAnchor="middle">
        seats
      </text>
      {note && (
        <text className="hemicycle__sub" x={CHART.width / 2} y={CHART.height - 10} textAnchor="middle">
          {note}
        </text>
      )}
    </svg>
  )
}
