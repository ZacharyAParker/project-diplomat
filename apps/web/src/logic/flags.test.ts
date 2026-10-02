import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FLAG,
  LAYOUTS,
  PALETTE,
  describeFlag,
  fitColours,
  flagShapes,
  layoutFor,
  randomFlag,
  safeColour,
  withColour,
  withLayout,
} from './flags.ts'
import { seeded } from './rng.ts'

describe('flag layouts', () => {
  it('offers at least eight layouts with unique ids', () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length)
  })

  it('uses every colour slot a layout names, and no others', () => {
    for (const layout of LAYOUTS) {
      const used = new Set(layout.shapes.map((s) => s.fill))
      expect([...used].sort(), layout.id).toEqual(layout.parts.map((_, i) => i))
    }
  })

  it('has a palette of valid, distinct colours with both metals and colours', () => {
    expect(new Set(PALETTE.map((t) => t.hex)).size).toBe(PALETTE.length)
    for (const t of PALETTE) expect(safeColour(t.hex)).toBe(t.hex)
    expect(PALETTE.some((t) => t.metal)).toBe(true)
    expect(PALETTE.some((t) => !t.metal)).toBe(true)
  })
})

describe('untrusted flags', () => {
  it('draws an unknown layout as a plain field', () => {
    expect(layoutFor('hologram').id).toBe('plain')
    expect(flagShapes({ layout: 'hologram', colours: ['#a61b29'] })).toHaveLength(1)
  })

  it('turns anything that is not a hex colour grey', () => {
    for (const bad of ['red', 'url(#x)', '#12', '#gggggg', '', undefined, 7, 'javascript:alert(1)']) {
      expect(safeColour(bad)).toBe('#8a8a86')
    }
    expect(safeColour('#A61B29')).toBe('#a61b29')
  })

  it('still draws when colours are missing', () => {
    const drawn = flagShapes({ layout: 'bands', colours: [] })
    expect(drawn).toHaveLength(3)
    expect(drawn.every((d) => d.colour === '#8a8a86')).toBe(true)
  })
})

describe('editing a flag', () => {
  it('keeps the colours already chosen when the layout changes', () => {
    const cross = withLayout(DEFAULT_FLAG, 'cross')
    expect(cross.colours).toEqual(DEFAULT_FLAG.colours.slice(0, 2))
    const back = withLayout(cross, 'bands')
    expect(back.colours.slice(0, 2)).toEqual(cross.colours)
    expect(back.colours).toHaveLength(3)
    expect(new Set(back.colours).size).toBe(3)
  })

  it('changes one slot and ignores a slot that is not there', () => {
    expect(withColour(DEFAULT_FLAG, 1, '#d9a521').colours[1]).toBe('#d9a521')
    expect(withColour(DEFAULT_FLAG, 9, '#d9a521').colours).toEqual(DEFAULT_FLAG.colours)
  })

  it('fits the number of colours to the layout', () => {
    expect(fitColours('disc', ['#1d4e89', '#f2efe6', '#a61b29'])).toHaveLength(2)
    expect(fitColours('bands', [])).toHaveLength(3)
  })

  it('describes a flag in words', () => {
    expect(describeFlag(DEFAULT_FLAG)).toBe('Three bands: blue, white, red')
  })
})

describe('random flags', () => {
  it('is repeatable for a seed and always valid', () => {
    expect(randomFlag(seeded(3))).toEqual(randomFlag(seeded(3)))
    const rng = seeded(11)
    for (let i = 0; i < 200; i++) {
      const flag = randomFlag(rng)
      const layout = LAYOUTS.find((l) => l.id === flag.layout)!
      expect(layout).toBeDefined()
      expect(flag.colours).toHaveLength(layout.parts.length)
      for (const hex of flag.colours) expect(PALETTE.some((t) => t.hex === hex)).toBe(true)
    }
  })

  it('never puts two metals or two colours in neighbouring slots', () => {
    const rng = seeded(5)
    const metal = (hex: string) => PALETTE.find((t) => t.hex === hex)!.metal
    for (let i = 0; i < 200; i++) {
      const { colours } = randomFlag(rng)
      for (let slot = 1; slot < colours.length; slot++) {
        expect(metal(colours[slot]!)).not.toBe(metal(colours[slot - 1]!))
      }
    }
  })
})
