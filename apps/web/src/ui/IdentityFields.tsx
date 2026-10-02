import { FIELDS, type IdentityField, type IdentityText } from '../logic/identity.ts'
import type { Rng } from '../logic/rng.ts'
import { suggestAll, suggestField } from '../logic/suggest.ts'
import { Button } from './Button.tsx'
import { TextField } from './Fields.tsx'

export interface IdentityFieldsProps {
  value: IdentityText
  onChange(text: IdentityText): void
  // Only the fields listed here show an error, so a blank form is not red before it is touched.
  errors: Partial<Record<IdentityField, string>>
  rng?: Rng
}

const SUGGEST_LABELS: Record<IdentityField, string> = {
  name: 'Suggest a name',
  capital: 'Suggest a capital',
  demonym: 'Suggest what its people are called',
  currency: 'Suggest a currency',
  leaderTitle: 'Suggest a title',
}

// The five things a nation is called by, each with its own suggest button and one
// button that fills the lot. Used at the founding and again in settings.
export function IdentityFields({ value, onChange, errors, rng = Math.random }: IdentityFieldsProps) {
  return (
    <div className="identity-fields stack">
      <div className="row">
        <Button look="secondary" onClick={() => onChange(suggestAll(value, rng))}>
          Suggest everything
        </Button>
        <p className="small soft">Or one at a time, with the buttons beside each line.</p>
      </div>
      {FIELDS.map((field) => (
        <TextField
          key={field.id}
          label={field.label}
          hint={field.hint}
          value={value[field.id]}
          error={errors[field.id] ?? null}
          maxLength={field.max * 2}
          onChange={(text) => onChange({ ...value, [field.id]: text })}
          action={
            <Button
              look="quiet"
              size="small"
              aria-label={SUGGEST_LABELS[field.id]}
              onClick={() => onChange(suggestField(field.id, value, rng))}
            >
              Suggest
            </Button>
          }
        />
      ))}
    </div>
  )
}
