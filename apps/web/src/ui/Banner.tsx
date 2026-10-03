import { useMemo } from 'react'
import { flagShapes, type FlagSpec } from '../logic/flags.ts'

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

// A rolling line of hills, as an SVG path across a 1200 by 160 strip.
function ridge(seed: number, base: number, swing: number, waves: number): string {
  const points: string[] = []
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * 1200
    const phase = (seed % 997) / 997
    const y =
      base +
      Math.sin((i / 24) * Math.PI * waves + phase * 6.28) * swing +
      Math.sin((i / 24) * Math.PI * (waves * 2.3) + phase * 3.1) * swing * 0.35
    points.push(`${x.toFixed(0)},${y.toFixed(1)}`)
  }
  return `M0,160 L${points.join(' L')} L1200,160 Z`
}

export interface BannerProps {
  // Whose banner. The same nation always gets the same landscape.
  id: string
  flag: FlagSpec
}

// The strip across the top of a nation's pages: its own countryside, coloured from its
// flag, at dusk. Decoration only, so it is hidden from assistive technology.
export function Banner({ id, flag }: BannerProps) {
  const art = useMemo(() => {
    const seed = hash(id)
    const colours = [...new Set(flagShapes(flag).map((s) => s.colour))]
    const sky = colours[0] ?? '#6b8fb3'
    const land = colours[1] ?? colours[0] ?? '#3d6b3d'
    const far = colours[2] ?? land
    return {
      sky,
      land,
      far,
      sun: { x: 200 + (seed % 800), y: 40 + (seed % 30) },
      back: ridge(seed, 92, 14, 3),
      middle: ridge(seed >>> 3, 112, 12, 4),
      front: ridge(seed >>> 7, 134, 9, 5),
      gradient: `banner-${seed.toString(36)}`,
    }
  }, [id, flag])

  return (
    <svg className="banner" viewBox="0 0 1200 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={art.gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={art.sky} stopOpacity="0.55" />
          <stop offset="1" stopColor="#f3efe2" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect width="1200" height="160" fill="#f3efe2" />
      <rect width="1200" height="160" fill={`url(#${art.gradient})`} />
      <circle cx={art.sun.x} cy={art.sun.y} r="26" fill="#fff8e6" opacity="0.85" />
      <path d={art.back} fill={art.far} opacity="0.35" />
      <path d={art.middle} fill={art.land} opacity="0.55" />
      <path d={art.front} fill={art.land} opacity="0.85" />
      <rect width="1200" height="160" fill="#000" opacity="0.06" />
    </svg>
  )
}
