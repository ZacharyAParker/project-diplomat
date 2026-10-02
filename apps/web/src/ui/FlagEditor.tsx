import { useId } from 'react'
import {
  LAYOUTS,
  PALETTE,
  fitColours,
  layoutFor,
  randomFlag,
  withColour,
  withLayout,
  type FlagSpec,
} from '../logic/flags.ts'
import type { Rng } from '../logic/rng.ts'
import { Button } from './Button.tsx'
import { Flag } from './Flag.tsx'

export interface FlagEditorProps {
  value: FlagSpec
  onChange(flag: FlagSpec): void
  // Where the randomise button gets its numbers. Tests pass a fixed one.
  rng?: Rng
}

// Layout, colours, a live preview and a randomise button. Used at the founding and
// again in settings.
export function FlagEditor({ value, onChange, rng = Math.random }: FlagEditorProps) {
  const name = useId()
  const layout = layoutFor(value.layout)
  const colours = fitColours(value.layout, value.colours)

  return (
    <div className="flag-editor">
      <div className="flag-editor__grid">
        <div className="flag-editor__preview">
          <Flag flag={value} label="The flag as it stands" />
          <Button look="secondary" onClick={() => onChange(randomFlag(rng))}>
            Randomise
          </Button>
        </div>

        <div className="flag-editor__controls stack">
          <fieldset className="pattern-picker">
            <legend className="label">Layout</legend>
            <div className="pattern-picker__grid">
              {LAYOUTS.map((option) => (
                <label key={option.id} className="pattern-picker__option">
                  <input
                    type="radio"
                    className="visually-hidden"
                    name={`${name}-layout`}
                    checked={option.id === layout.id}
                    onChange={() => onChange(withLayout(value, option.id))}
                  />
                  <Flag flag={withLayout(value, option.id)} width="100%" />
                  <span className="small">{option.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {layout.parts.map((part, slot) => (
            <fieldset key={part} className="swatches">
              <legend className="label">{part}</legend>
              <div className="swatches__row">
                {PALETTE.map((tincture) => (
                  <label key={tincture.id} className="swatches__option" title={tincture.name}>
                    <input
                      type="radio"
                      className="visually-hidden"
                      name={`${name}-colour-${slot}`}
                      checked={colours[slot] === tincture.hex}
                      onChange={() => onChange(withColour(value, slot, tincture.hex))}
                    />
                    <span className="swatches__chip" style={{ backgroundColor: tincture.hex }} />
                    <span className="visually-hidden">{tincture.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  )
}
