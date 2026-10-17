// Where each seat goes in a half-circle chart of a legislature: rows of seats from an inner
// to an outer arc, each row holding seats in proportion to its length, filled party by
// party from the left. Worked out here so the drawing is only circles.

export interface Seat {
  x: number
  y: number
  // Index of the party in the list given.
  party: number
}

export interface Hemicycle {
  width: number
  height: number
  radius: number
  seats: Seat[]
}

export const CHART = { width: 640, height: 340, inner: 112, outer: 296 } as const

export function rowsFor(total: number): number {
  if (total > 400) return 12
  if (total > 200) return 9
  if (total > 100) return 7
  if (total > 50) return 5
  if (total > 12) return 3
  return 1
}

export function hemicycle(seats: readonly number[]): Hemicycle {
  const total = seats.reduce((sum, n) => sum + Math.max(0, Math.floor(n)), 0)
  const { width, height, inner, outer } = CHART
  if (total === 0) return { width, height, radius: 0, seats: [] }
  const rows = Math.min(rowsFor(total), total)
  const cx = width / 2
  const cy = height - 30
  const radii = rows === 1 ? [(inner + outer) / 2] : Array.from({ length: rows }, (_, i) => inner + ((outer - inner) * i) / (rows - 1))
  const sum = radii.reduce((a, b) => a + b, 0)
  const counts = radii.map((r) => Math.floor((total * r) / sum))
  // Whatever rounding left over goes to the outer rows first.
  let k = rows - 1
  while (counts.reduce((a, b) => a + b, 0) < total) {
    counts[k]! += 1
    k = (k - 1 + rows) % rows
  }
  const places: { angle: number; r: number }[] = []
  radii.forEach((r, row) => {
    const n = counts[row]!
    for (let i = 0; i < n; i++) places.push({ angle: Math.PI - (Math.PI * (i + 0.5)) / n, r })
  })
  // Left to right across the chamber, inner row first at each angle.
  places.sort((a, b) => b.angle - a.angle || a.r - b.r)
  const firstRow = Math.max(1, counts[0]!)
  const spacing = rows === 1 ? (Math.PI * radii[0]!) / firstRow : (outer - inner) / (rows - 1)
  const radius = Math.max(1.5, Math.min(12.6, ((Math.PI * inner) / firstRow) * 0.44, spacing * 0.45))

  const out: Seat[] = []
  let at = 0
  seats.forEach((n, party) => {
    for (let i = 0; i < Math.max(0, Math.floor(n)); i++) {
      const place = places[at++]!
      out.push({ x: cx + place.r * Math.cos(place.angle), y: cy - place.r * Math.sin(place.angle), party })
    }
  })
  return { width, height, radius, seats: out }
}
