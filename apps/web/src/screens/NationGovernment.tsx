import type { CensusFigure, Factbook, Mode } from '@diplomat/government'
import { useId, useState, type FormEvent } from 'react'
import { MODES, formName } from '../logic/forms.ts'
import { useGame, type Current } from '../store/game.tsx'
import { useAction } from '../store/useAction.ts'
import { Button, ChoiceList, LinkTo, Markdown, Notice, Segmented, Sheet, TextField, useAnnounce } from '../ui/index.ts'

// The parts of the nation page that come from the government above the engine: the census
// the server works out, the factbooks, and the form of government with the mode switch.

export function figureText(figure: CensusFigure): string {
  const value = Number.isInteger(figure.value)
    ? figure.value.toLocaleString('en-GB')
    : figure.value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
  if (!figure.unit) return value
  if (figure.unit === '%') return `${value}%`
  return `${value} ${figure.unit}`
}

export function Census({ figures }: { figures: readonly CensusFigure[] }) {
  return (
    <Sheet title="The census">
      {figures.length === 0 ? (
        <p className="soft">The census office has nothing to report. The server sent no figures.</p>
      ) : (
        <>
          <p className="small soft">Worked out each day from how the country stands. A rating is how it compares, in words.</p>
          <dl className="census">
            {figures.map((figure) => (
              <div key={figure.id} className="census__figure">
                <dt>{figure.name}</dt>
                <dd>
                  <span className="census__value">{figureText(figure)}</span>
                  {figure.rating && <span className="census__rating">{figure.rating}</span>}
                  <span className="small soft">{figure.description}</span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Sheet>
  )
}

const CATEGORIES: readonly Factbook['category'][] = [
  'overview',
  'history',
  'geography',
  'culture',
  'economy',
  'law',
  'government',
  'other',
]

const categoryName = (category: Factbook['category']) => category.charAt(0).toUpperCase() + category.slice(1)

interface Editing {
  id: string | null
  title: string
  category: Factbook['category']
  body: string
}

function FactbookEditor({ editing, onDone }: { editing: Editing; onDone(): void }) {
  const game = useGame()
  const announce = useAnnounce()
  const action = useAction()
  const [draft, setDraft] = useState(editing)
  const [preview, setPreview] = useState(false)
  const [tried, setTried] = useState(false)
  const bodyId = useId()
  const categoryId = useId()
  const titleProblem = draft.title.trim() ? null : 'An entry needs a title.'

  async function save(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (titleProblem) return
    const entry = { title: draft.title.trim(), category: draft.category, body: draft.body }
    const done = await action.run('save', async () => {
      if (draft.id) await game.editFactbook(draft.id, entry)
      else await game.writeFactbook(entry)
      return true
    })
    if (!done) return
    announce('The factbook entry is saved.')
    onDone()
  }

  async function drafted() {
    const result = await action.run('draft', () =>
      game.draftFactbook({ title: draft.title.trim(), category: draft.category, notes: draft.body }),
    )
    if (result) {
      setDraft({ ...draft, title: result.title, body: result.body })
      announce('A draft is in the box. Nothing is saved until you save it.')
    }
  }

  return (
    <form className="stack factbook__editor" onSubmit={(event) => void save(event)} noValidate>
      <TextField
        label="Title"
        value={draft.title}
        onChange={(title) => setDraft({ ...draft, title })}
        maxLength={120}
        error={tried ? titleProblem : null}
      />
      <div className="field">
        <label className="field__label label" htmlFor={categoryId}>
          Kind of entry
        </label>
        <select
          id={categoryId}
          className="field__input"
          value={draft.category}
          onChange={(event) => setDraft({ ...draft, category: event.target.value as Factbook['category'] })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryName(c)}
            </option>
          ))}
        </select>
      </div>
      <Segmented
        legend="The text"
        options={[
          { value: 'write', label: 'Write' },
          { value: 'preview', label: 'Preview' },
        ]}
        value={preview ? 'preview' : 'write'}
        onChange={(value) => setPreview(value === 'preview')}
      />
      {preview ? (
        <div className="factbook__preview">
          {draft.body.trim() ? <Markdown text={draft.body} nation={game.current?.id} shift={2} /> : <p className="soft">Nothing written yet.</p>}
        </div>
      ) : (
        <div className="field">
          <label className="field__label label" htmlFor={bodyId}>
            The entry, in Markdown
          </label>
          <textarea
            id={bodyId}
            className="field__input field__area"
            rows={12}
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          />
          <p className="field__hint small soft">
            Headings with #, lists with -, **bold** and *italics*. For Draft with AI, put your notes here first.
          </p>
        </div>
      )}
      {action.error && (
        <Notice tone="problem" title="Not done">
          <p>{action.error}</p>
        </Notice>
      )}
      <div className="row">
        <Button look="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => void drafted()} disabled={action.busy !== null} aria-busy={action.busy === 'draft'}>
          {action.busy === 'draft' ? 'Drafting' : 'Draft with AI'}
        </Button>
        <Button type="submit" look="primary" disabled={action.busy !== null} aria-busy={action.busy === 'save'}>
          Save the entry
        </Button>
      </div>
    </form>
  )
}

export function Factbooks({ current }: { current: Current }) {
  const factbooks = current.government?.factbooks ?? []
  const [editing, setEditing] = useState<Editing | null>(null)
  const [reading, setReading] = useState<string | null>(null)

  return (
    <Sheet title="Factbooks">
      {editing ? (
        <FactbookEditor key={editing.id ?? 'new'} editing={editing} onDone={() => setEditing(null)} />
      ) : (
        <div className="stack">
          {factbooks.length === 0 ? (
            <p className="soft">The nation has not yet written anything about itself.</p>
          ) : (
            <ul className="plain-list factbooks">
              {factbooks.map((entry) => (
                <li key={entry.id}>
                  <h3>{entry.title}</h3>
                  <p className="label soft">
                    {categoryName(entry.category)}, day {entry.updatedDay}
                    {entry.author === 'ai' ? ', drafted by the AI' : ''}
                  </p>
                  {reading === entry.id && <Markdown text={entry.body} nation={current.id} shift={3} />}
                  <div className="row">
                    <Button size="small" onClick={() => setReading(reading === entry.id ? null : entry.id)} aria-expanded={reading === entry.id}>
                      {reading === entry.id ? 'Close it' : 'Read it'}
                    </Button>
                    <Button
                      size="small"
                      look="quiet"
                      onClick={() => setEditing({ id: entry.id, title: entry.title, category: entry.category, body: entry.body })}
                      aria-label={`Edit ${entry.title}`}
                    >
                      Edit
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Button look="primary" onClick={() => setEditing({ id: null, title: '', category: 'overview', body: '' })}>
              Write an entry
            </Button>
          </p>
        </div>
      )}
    </Sheet>
  )
}

export function FormAndMode({ current }: { current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const action = useAction()
  const government = current.government
  const [choice, setChoice] = useState<Mode>(current.mode)
  if (!government) return null
  const { constitution, founder } = government.institutions
  const executive = constitution.rules.executive

  async function switchTo(mode: Mode) {
    setChoice(mode)
    const done = await action.run('mode', async () => {
      await game.setMode(mode)
      return true
    })
    if (done) announce(mode === 'found' ? 'The executive now decides on its own.' : 'You hold the executive office again.')
    else setChoice(current.mode)
  }

  return (
    <Sheet title="Its government">
      <dl className="facts">
        <div>
          <dt>Form</dt>
          <dd>{constitution.formName || formName(constitution.form)}</dd>
        </div>
        <div>
          <dt>The state</dt>
          <dd>{constitution.stateName}</dd>
        </div>
        <div>
          <dt>Executive</dt>
          <dd>
            {executive.title}
            {current.mode === 'found' && executive.holder ? `, ${executive.holder}` : ', you'}
          </dd>
        </div>
        <div>
          <dt>Above it</dt>
          <dd>
            {founder.name}, {founder.title}
          </dd>
        </div>
      </dl>
      <ChoiceList
        legend="Who decides the petitions"
        options={MODES.map((mode) => ({ value: mode.id, label: mode.name, detail: mode.line }))}
        value={choice}
        onChange={(mode) => void switchTo(mode)}
      />
      {action.busy && <p className="small soft">Telling the server.</p>}
      {action.error && (
        <Notice tone="problem" title="The mode was not changed">
          <p>{action.error}</p>
        </Notice>
      )}
      <p>
        <LinkTo to={{ name: 'gov', id: current.id, page: 'today' }} size="small">
          The government’s website
        </LinkTo>
      </p>
    </Sheet>
  )
}
