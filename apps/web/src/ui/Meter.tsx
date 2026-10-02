import type { ReactNode } from 'react'
import type { Size, Tone } from '../logic/changes.ts'

const clamp = (value: number) => Math.min(100, Math.max(0, value))

export interface MeterProps {
  label: string
  // 0 to 100.
  value: number
  // What a screen reader says in place of the bare number, and what is printed beside the label.
  valueText?: string
  hint?: ReactNode
}

// The large gauge, drawn as a ruler with quarter marks. For the one number a card is about.
export function Meter({ label, value, valueText, hint }: MeterProps) {
  const shown = valueText ?? String(Math.round(value))
  return (
    <div className="meter">
      <div className="meter__head">
        <span className="label">{label}</span>
        <span className="meter__value figures" aria-hidden="true">
          {shown}
        </span>
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamp(value))}
        aria-valuetext={shown}
      >
        <div className="meter__fill" style={{ width: `${clamp(value)}%` }} />
        <div className="meter__ticks" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      {hint && <p className="meter__hint small soft">{hint}</p>}
    </div>
  )
}

export interface BarProps {
  label: ReactNode
  // Needed when the label is not plain text.
  name?: string
  value: number
  // Where the value stood before, drawn as a notch on the track.
  was?: number
  // Goes after the number: a change since yesterday, a trend line.
  note?: ReactNode
}

// The compact row for lists of numbers: name, bar, figure. Built from spans, so it can
// sit inside a summary.
export function Bar({ label, name, value, was, note }: BarProps) {
  const text = name ?? (typeof label === 'string' ? label : undefined)
  return (
    <span className="bar">
      <span className="bar__label">{label}</span>
      <span
        className="bar__track"
        role="meter"
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamp(value))}
      >
        <span className="bar__fill" style={{ width: `${clamp(value)}%` }} />
        {was !== undefined && <span className="bar__was" style={{ left: `${clamp(was)}%` }} />}
      </span>
      <span className="bar__value figures" aria-hidden="true">
        {Math.round(value)}
      </span>
      {note && <span className="bar__note">{note}</span>}
    </span>
  )
}

const FILLED: Record<Size, number> = { small: 1, moderate: 2, large: 3 }

// Three blocks for how big a move is. It is always next to the words that say the same
// thing, so it is hidden from screen readers.
export function Pips({ size, tone = 'neutral' }: { size: Size; tone?: Tone }) {
  return (
    <span className={`pips pips--${tone}`} aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= FILLED[size] ? 'pips__on' : 'pips__off'} />
      ))}
    </span>
  )
}
