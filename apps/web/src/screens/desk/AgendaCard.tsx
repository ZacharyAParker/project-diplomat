import type { Content } from '@diplomat/engine'
import { useId, useMemo, useState } from 'react'
import { forecastView, type Card, type ForecastView, type OptionView } from '../../logic/desk.ts'
import type { Current } from '../../store/game.tsx'
import { Button, ChangeList, Meter, Sheet, Tag } from '../../ui/index.ts'

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
  option: OptionView
  view: ForecastView
  content: Content
  group: string
  chosen: boolean
  onChoose(): void
}

function OptionBlock({ option, view, content, group, chosen, onChoose }: OptionProps) {
  const forecast = useId()
  return (
    <div className={chosen ? 'option option--chosen' : 'option'}>
      <label className="option__pick">
        <input
          type="radio"
          name={group}
          className="choices__radio"
          checked={chosen}
          onChange={onChoose}
          aria-describedby={forecast}
        />
        <span className="option__text">
          <span className="option__who">
            <span className="option__name">{option.name}</span>
            <span className="visually-hidden">, </span>
            <span className="option__role label soft">{option.role}</span>
          </span>
          <span className="visually-hidden">: </span>
          <span className="option__speech">{option.speech}</span>
        </span>
      </label>
      <div id={forecast} className="option__forecast">
        <p className="label soft">What it will do</p>
        {view.nothing ? (
          <p className="soft">Nothing that anyone can measure.</p>
        ) : (
          <>
            <ChangeList changes={view.changes} content={content} reason="folded" />
            <ForecastNotes view={view} />
          </>
        )}
      </div>
    </div>
  )
}

export interface AgendaCardProps {
  card: Card
  current: Current
  content: Content
  // Called with the chosen option and what was forecast for it, once it is confirmed.
  onDecide(optionId: string, view: ForecastView): void
  onLeave(): void
}

// One paper from the box. Choosing is two steps on purpose: pick a voice, then confirm.
export function AgendaCard({ card, current, content, onDecide, onLeave }: AgendaCardProps) {
  const group = useId()
  const [chosen, setChosen] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  const views = useMemo(() => {
    const forecast = (optionId: string) =>
      card.dilemmaId === null
        ? current.forecastSituation(optionId)
        : current.forecastDecision(card.dilemmaId, optionId)
    return new Map(card.options.map((option) => [option.id, forecastView(forecast(option.id), content)]))
  }, [card, current, content])

  // An option can stop being available when another paper is decided first.
  const picked = card.options.find((option) => option.id === chosen) ?? null

  function confirm() {
    const view = picked && views.get(picked.id)
    if (!picked || !view) return setMissing(true)
    onDecide(picked.id, view)
  }

  return (
    <Sheet as="article" look="paper" level={3} kicker={card.kicker} title={card.title} className="card">
      <p className="card__brief">{card.description}</p>
      {card.gauge && (
        <Meter
          label={card.gauge.label}
          value={card.gauge.value}
          hint="Where it stands this morning. What you decide here moves it."
        />
      )}

      {card.options.length === 0 ? (
        <p className="soft">Nobody has anything to propose. This one passes on its own tonight.</p>
      ) : (
        <fieldset className="card__options">
          <legend className="label soft">Who do you back?</legend>
          {card.options.map((option) => (
            <OptionBlock
              key={option.id}
              option={option}
              view={views.get(option.id)!}
              content={content}
              group={group}
              chosen={picked?.id === option.id}
              onChoose={() => {
                setChosen(option.id)
                setMissing(false)
              }}
            />
          ))}
        </fieldset>
      )}

      {missing && (
        <p className="field__error small" role="alert">
          Nobody is picked yet. Back one of them, or leave it on the desk.
        </p>
      )}
      <div className="card__actions">
        {card.options.length > 0 && (
          <Button look="primary" onClick={confirm}>
            {picked ? `Confirm: back ${picked.name}` : 'Confirm'}
          </Button>
        )}
        <Button look="quiet" onClick={onLeave} aria-label={`Leave it on the desk: ${card.title}`}>
          Leave it on the desk
        </Button>
      </div>
    </Sheet>
  )
}

export interface LeftCardProps {
  card: Card
  onReturn(): void
}

// A paper the player has pushed to one side. It stays where it was, a line high.
export function LeftCard({ card, onReturn }: LeftCardProps) {
  return (
    <Sheet
      as="article"
      look="paper"
      level={3}
      kicker="Left on the desk"
      title={card.title}
      className="card card--left"
    >
      <p className="soft">
        {card.kind === 'situation'
          ? 'Undecided. The crisis moves on tonight without a word from you.'
          : 'Undecided. It goes back tonight, and may not come round again.'}
      </p>
      <div className="card__actions">
        <Button size="small" onClick={onReturn} aria-label={`Pick it back up: ${card.title}`}>
          Pick it back up
        </Button>
      </div>
    </Sheet>
  )
}
