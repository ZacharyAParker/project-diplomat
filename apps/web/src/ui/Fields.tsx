import { useId, useRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Button, type ButtonProps } from './Button.tsx'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string
  value: string
  onChange(value: string): void
  hint?: string
  error?: string | null
  // A small control at the end of the input, such as "Suggest".
  action?: ReactNode
}

export function TextField({ label, value, onChange, hint, error, action, ...input }: TextFieldProps) {
  const id = useId()
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label className="field__label label" htmlFor={id}>
        {label}
      </label>
      <div className="field__row">
        <input
          id={id}
          className="field__input"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          autoComplete="off"
          spellCheck={false}
          {...input}
        />
        {action}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="field__hint small soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error small">
          {error}
        </p>
      )}
    </div>
  )
}

export interface Choice<T extends string = string> {
  value: T
  label: ReactNode
  detail?: ReactNode
}

export interface SegmentedProps<T extends string> {
  legend: string
  // Hides the legend from sight when the surrounding text already says what this is.
  legendHidden?: boolean
  options: readonly Choice<T>[]
  value: T
  onChange(value: T): void
}

// A handful of short, exclusive options in a row. Real radio buttons underneath, so the
// arrow keys work and a screen reader says "2 of 3".
export function Segmented<T extends string>({
  legend,
  legendHidden,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  const name = useId()
  return (
    <fieldset className="segmented">
      <legend className={legendHidden ? 'visually-hidden' : 'label'}>{legend}</legend>
      <div className="segmented__options">
        {options.map((option) => (
          <label key={option.value} className="segmented__option">
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export interface ChoiceListProps<T extends string> {
  legend: ReactNode
  legendHidden?: boolean
  options: readonly Choice<T>[]
  value: T | null
  onChange(value: T): void
}

// Longer exclusive options, one per row, each a full-width target. Used wherever the
// player picks one answer out of a few: founding questions here, options on the desk.
export function ChoiceList<T extends string>({
  legend,
  legendHidden,
  options,
  value,
  onChange,
}: ChoiceListProps<T>) {
  const name = useId()
  return (
    <fieldset className="choices">
      <legend className={legendHidden ? 'visually-hidden' : 'choices__legend'}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="choices__option">
          <input
            type="radio"
            name={name}
            className="choices__radio"
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span className="choices__text">
            <span className="choices__label">{option.label}</span>
            {option.detail && <span className="choices__detail small soft">{option.detail}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export interface FileButtonProps extends Omit<ButtonProps, 'onClick'> {
  accept?: string
  // Called with the file's text. Reading problems arrive as an Error.
  onText(text: string | Error, filename: string): void
}

// A button that opens the file picker and reads what was picked as text.
export function FileButton({
  accept = 'application/json,.json',
  onText,
  children,
  ...button
}: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null)

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    file.text().then(
      (text) => onText(text, file.name),
      () => onText(new Error('The file could not be read.'), file.name),
    )
  }

  return (
    <>
      <input ref={input} type="file" accept={accept} hidden onChange={picked} data-testid="file-input" />
      <Button {...button} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  )
}
