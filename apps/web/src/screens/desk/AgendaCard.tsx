import type { Content } from '@diplomat/engine'
import { useMemo, useState } from 'react'
import { forecastView, type Card, type ForecastView, type OptionView } from '../../logic/desk.ts'
import type { Current } from '../../store/game.tsx'
import { Button, ChangeList, Meter, Tag, TextField } from '../../ui/index.ts'

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

interface OptionProps {
  number: number
  option: OptionView
  view: ForecastView
  content: Content
  onAccept(text?: string): void
}

// One numbered position in the debate: who argues it, what it would do, and the button
// that makes it law.
function Position({ number, option, view, content, onAccept }: OptionProps) {
  const [text, setText] = useState('')
  const [missing, setMissing] = useState(false)
  const written = text.trim()

  function accept() {
    if (!option.custom) return onAccept()
    if (!written) return setMissing(true)
    onAccept(written)
  }

  return (
    <li className="debate__option">
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
      <p className="debate__accept">
        <Button look="accent" onClick={accept} aria-label={`Accept position ${number}: ${option.name}`}>
          Accept
        </Button>
      </p>
    </li>
  )
}

export interface AgendaCardProps {
  card: Card
  current: Current
  content: Content
  // Called with the accepted option, what was forecast for it, and any name the player wrote.
  onDecide(optionId: string, view: ForecastView, text?: string): void
  onLeave(): void
}

// One issue, set out the way the genre always has: the issue, then the debate, then a
// button under each position.
export function AgendaCard({ card, current, content, onDecide, onLeave }: AgendaCardProps) {
  const views = useMemo(() => {
    const forecast = (optionId: string) =>
      card.dilemmaId === null
        ? current.forecastSituation(optionId)
        : current.forecastDecision(card.dilemmaId, optionId)
    return new Map(card.options.map((option) => [option.id, forecastView(forecast(option.id), content)]))
  }, [card, current, content])

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
              onAccept={(text) => onDecide(option.id, views.get(option.id)!, text)}
            />
          ))}
        </ol>
      )}

      <p className="issue__dismiss">
        <Button look="quiet" size="small" onClick={onLeave} aria-label={`Dismiss issue: ${card.title}`}>
          Dismiss issue
        </Button>
      </p>
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
