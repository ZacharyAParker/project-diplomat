import type { Content } from '@diplomat/engine'
import type { Docket, GovernmentState, Mode } from '@diplomat/government'
import { useId, useMemo, useState } from 'react'
import { DISMISS, courseLabel, courseState, dismissOpen, executiveTitle, type CourseState } from '../../logic/docket.ts'
import { forecastView, type Card, type ForecastView, type OptionView } from '../../logic/desk.ts'
import type { Current } from '../../store/game.tsx'
import type { DecideExtra } from '../../store/gameStore.ts'
import { Button, ChangeList, Meter, Tag, TextField } from '../../ui/index.ts'
import { DocketView } from './Docket.tsx'

// Everything about an option that is not a movement: laws, reputations, promises, and
// the fact (never the content) of consequences still to come.
export function ForecastNotes({ view }: { view: ForecastView }) {
  if (!view.policies.length && !view.warnings.length && !view.later && !view.promise) return null
  return (
    <ul className="notes">
      {view.policies.map((line) => (
        <li key={line} className="notes__policy">
          {line}
        </li>
      ))}
      {view.warnings.map((line) => (
        <li key={line}>
          <Tag tone="bad">Warning</Tag> {line}
        </li>
      ))}
      {view.promise && (
        <li>
          <Tag>Promise</Tag> {view.promise}
        </li>
      )}
      {view.later && <li className="soft">There will be consequences later. Nobody can say what.</li>}
    </ul>
  )
}

interface WritingProps {
  label: string
  hint?: string
  value: string
  onChange(value: string): void
  error?: string | null
}

function Writing({ label, hint, value, onChange, error }: WritingProps) {
  const id = useId()
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label className="field__label label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="field__input field__area"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined}
      />
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

// A Founder's Word, folded away under a course the rules will not let the executive take
// (or under every course, in found mode, where the player is not the executive).
function WordBox({ label, busy, onWord }: { label: string; busy: boolean; onWord(word: string): void }) {
  const [word, setWord] = useState('')
  const [missing, setMissing] = useState(false)
  return (
    <details className="fold word-box">
      <summary>Overrule by the Founder’s Word</summary>
      <div className="fold__body stack">
        <p className="small soft">
          A Word sets the rules aside for this petition. It is recorded word for word, the bodies may answer it, and
          overruling a ruling or a binding vote costs the government some legitimacy.
        </p>
        <Writing
          label="Your Word, as it is to be recorded"
          value={word}
          onChange={(value) => {
            setWord(value)
            setMissing(false)
          }}
          error={missing ? 'Write the Word first. It is entered exactly as written.' : null}
        />
        <p>
          <Button
            look="primary"
            size="small"
            disabled={busy}
            aria-busy={busy}
            aria-label={`Take ${label} by the Founder's Word`}
            onClick={() => (word.trim() ? onWord(word.trim()) : setMissing(true))}
          >
            Take it by Word
          </Button>
        </p>
      </div>
    </details>
  )
}

function RuleNotes({ state }: { state: CourseState }) {
  if (!state.notes.length && !state.barred && !state.must && !state.advisedAgainst) return null
  return (
    <div className="debate__rules">
      {state.barred && <Tag tone="bad">Barred</Tag>}
      {state.advisedAgainst && !state.barred && <Tag>Advised against</Tag>}
      {state.must && <Tag tone="good">Must be taken</Tag>}
      {state.notes.map((note) => (
        <p key={note} className="small">
          {note}
        </p>
      ))}
    </div>
  )
}

interface AcceptProps {
  label: string
  name: string
  state: CourseState
  mode: Mode
  busy: boolean
  setsAside: string | null
  onAccept(extra?: DecideExtra): void
  // Asked before the reasons for a veto are asked for: false stops there.
  ready?(): boolean
}

// The Accept button under a course, as the standing allows it.
function Accept({ label, name, state, mode, busy, setsAside, onAccept, ready = () => true }: AcceptProps) {
  const [asking, setAsking] = useState(false)
  const [reasons, setReasons] = useState('')
  const [missing, setMissing] = useState(false)
  const word = <WordBox label={label} busy={busy} onWord={(text) => onAccept({ word: text })} />

  if (mode === 'found') return <div className="debate__accept">{word}</div>

  if (state.action === 'word-only') {
    return (
      <div className="debate__accept">
        <Button look="accent" disabled aria-label={`Accept ${label}: ${name}`}>
          Accept
        </Button>
        {word}
      </div>
    )
  }

  if (state.action === 'veto' && asking) {
    return (
      <div className="debate__accept debate__veto stack">
        <Writing
          label={`Your reasons for setting aside ${setsAside ?? 'the carried course'}`}
          hint="The rules require them in writing. They go into the record as you write them."
          value={reasons}
          onChange={(value) => {
            setReasons(value)
            setMissing(false)
          }}
          error={missing ? 'Write the reasons first. A veto without them is refused.' : null}
        />
        <div className="row">
          <Button look="quiet" size="small" onClick={() => setAsking(false)}>
            Not this one after all
          </Button>
          <Button
            look="accent"
            disabled={busy}
            aria-busy={busy}
            aria-label={`Accept ${label} with these reasons`}
            onClick={() => (reasons.trim() ? onAccept({ veto: reasons.trim() }) : setMissing(true))}
          >
            Accept, with these reasons
          </Button>
        </div>
      </div>
    )
  }

  return (
    <p className="debate__accept">
      <Button
        look="accent"
        disabled={busy}
        aria-busy={busy}
        aria-label={`Accept ${label}: ${name}`}
        onClick={() => (state.action === 'veto' ? ready() && setAsking(true) : onAccept())}
      >
        Accept
      </Button>
    </p>
  )
}

interface OptionProps {
  number: number
  option: OptionView
  view: ForecastView
  content: Content
  state: CourseState
  mode: Mode
  busy: boolean
  setsAside: string | null
  onAccept(extra: DecideExtra): void
}

// One numbered position in the debate: who argues it, what it would do, what the bodies
// said about it, and the button that makes it law.
function Position({ number, option, view, content, state, mode, busy, setsAside, onAccept }: OptionProps) {
  const [text, setText] = useState('')
  const [missing, setMissing] = useState(false)
  const written = text.trim()

  function accept(extra: DecideExtra = {}) {
    if (!option.custom) return onAccept(extra)
    if (!written) return setMissing(true)
    onAccept({ ...extra, text: written })
  }

  return (
    <li className={state.barred ? 'debate__option debate__option--barred' : 'debate__option'}>
      <p className="debate__speech">
        <span className="debate__number figures" aria-hidden="true">
          {number}.
        </span>{' '}
        <q>{option.speech}</q> says <strong className="debate__who">{option.name}</strong>,{' '}
        <span className="debate__role">{option.role}</span>.
      </p>
      <div className="debate__forecast">
        {view.nothing ? (
          <p className="soft small">Nothing that anyone can measure.</p>
        ) : (
          <>
            <ChangeList changes={view.changes} content={content} reason="folded" />
            <ForecastNotes view={view} />
          </>
        )}
      </div>
      <RuleNotes state={state} />
      {option.custom && (
        <div className="debate__write">
          <TextField
            label={option.custom.label}
            value={text}
            maxLength={option.custom.max}
            onChange={(value) => {
              setText(value)
              setMissing(false)
            }}
            hint={`Your own choice, up to ${option.custom.max} characters.`}
            error={missing ? 'Write a name first, or back one of the others.' : null}
          />
        </div>
      )}
      <Accept
        label={`position ${number}`}
        name={option.name}
        state={state}
        mode={mode}
        busy={busy}
        setsAside={setsAside}
        onAccept={accept}
        ready={() => {
          if (option.custom && !written) setMissing(true)
          return !option.custom || written !== ''
        }}
      />
    </li>
  )
}

export interface AgendaCardProps {
  card: Card
  current: Current
  content: Content
  // The petition's docket, when the bodies have it.
  docket?: Docket | null
  // True while a decision on this card is on its way.
  busy?: boolean
  // Called with the accepted course, what was forecast for it, and anything written with it.
  onDecide(optionId: string, view: ForecastView | null, extra: DecideExtra): void
  onConvene?(): Promise<void>
  onLeave(): void
}

// One issue, set out the way the genre always has: the issue, then the debate, then a
// button under each position. When the issue is a petition before the bodies, what they
// have said sits between the two, and the buttons follow what the rules allow.
export function AgendaCard({ card, current, content, docket, busy = false, onDecide, onConvene, onLeave }: AgendaCardProps) {
  const government: GovernmentState | null = current.government
  const views = useMemo(() => {
    const forecast = (optionId: string) =>
      card.dilemmaId === null
        ? current.forecastSituation(optionId)
        : current.forecastDecision(card.dilemmaId, optionId)
    return new Map(card.options.map((option) => [option.id, forecastView(forecast(option.id), content)]))
  }, [card, current, content])

  const mode: Mode = docket ? current.mode : 'govern'
  const states = new Map(card.options.map((o) => [o.id, courseState(docket, o.id, card.options, government)]))
  const dismissal = docket && dismissOpen(docket.standing) ? courseState(docket, DISMISS, card.options, government) : null
  const setsAside = docket?.standing?.vetoable ? courseLabel(docket.standing.vetoable, card.options) : null

  return (
    <article className={`issue issue--${card.kind}`} aria-labelledby={`issue-${card.key}`}>
      <header className="issue__head">
        <h3 id={`issue-${card.key}`} className="issue__title">
          {card.title}
        </h3>
        {(card.abroad || card.kind === 'situation') && <p className="issue__meta">{card.kicker}</p>}
      </header>

      {card.gauge && (
        <Meter
          label={card.gauge.label}
          value={card.gauge.value}
          hint="Where it stands this morning. What you decide here moves it."
        />
      )}

      <h4 className="issue__section">The issue</h4>
      <p className="issue__text">{card.description}</p>

      {docket && (
        <DocketView
          docket={docket}
          nation={current.id}
          government={government}
          options={card.options}
          onConvene={onConvene}
        />
      )}

      <h4 className="issue__section">The debate</h4>
      {card.options.length === 0 ? (
        <p className="soft">Nobody has anything to propose. This one passes on its own tonight.</p>
      ) : (
        <ol className="debate">
          {card.options.map((option, i) => (
            <Position
              key={option.id}
              number={i + 1}
              option={option}
              view={views.get(option.id)!}
              content={content}
              state={states.get(option.id)!}
              mode={mode}
              busy={busy}
              setsAside={setsAside}
              onAccept={(extra) => onDecide(option.id, views.get(option.id)!, extra)}
            />
          ))}
        </ol>
      )}

      {dismissal && (
        <section className="debate__dismissal" aria-label="Dismissal">
          <p className="debate__speech">
            <strong>Dismissal.</strong> Take none of the courses. Nothing moves, and the petition rests before it can
            come round again.
          </p>
          <RuleNotes state={dismissal} />
          <Accept
            label="dismissal"
            name={executiveTitle(government)}
            state={dismissal}
            mode={mode}
            busy={busy}
            setsAside={setsAside}
            onAccept={(extra) => onDecide(DISMISS, null, extra ?? {})}
          />
        </section>
      )}

      {mode === 'govern' && (
        <p className="issue__dismiss">
          <Button look="quiet" size="small" onClick={onLeave} aria-label={`Dismiss issue: ${card.title}`}>
            {docket ? 'Leave it for today' : 'Dismiss issue'}
          </Button>
        </p>
      )}
    </article>
  )
}

export interface LeftCardProps {
  card: Card
  onReturn(): void
}

// An issue the player has set aside. It keeps its place, a line high.
export function LeftCard({ card, onReturn }: LeftCardProps) {
  return (
    <article className="issue issue--left">
      <header className="issue__head">
        <h3 className="issue__title">{card.title}</h3>
        <p className="issue__meta">Dismissed</p>
      </header>
      <p className="soft small">
        {card.kind === 'situation'
          ? 'The crisis moves on tonight without a word from you.'
          : 'It goes back tonight, and may not come round again.'}
      </p>
      <p className="issue__dismiss">
        <Button size="small" onClick={onReturn} aria-label={`Pick it back up: ${card.title}`}>
          Pick it back up
        </Button>
      </p>
    </article>
  )
}
