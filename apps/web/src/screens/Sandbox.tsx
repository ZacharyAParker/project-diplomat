import { INDICATORS, INDICATOR_INFO, standingWith, type Adjustment } from '@diplomat/engine'
import { useMemo, useState } from 'react'
import { useGame, type Current } from '../store/game.tsx'
import { Button, Notice, Screen, Sheet, useAnnounce } from '../ui/index.ts'

interface Row {
  key: string
  label: string
  value: number
  min: number
  max: number
  make(to: number): Adjustment
}

function NumberRow({ row, draft, onChange }: { row: Row; draft: string; onChange(value: string): void }) {
  const id = `sandbox-${row.key}`
  return (
    <li className="sandbox__row">
      <label htmlFor={id}>{row.label}</label>
      <input
        id={id}
        className="field__input sandbox__number"
        type="number"
        inputMode="numeric"
        min={row.min}
        max={row.max}
        value={draft}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="small soft figures">now {Math.round(row.value)}</span>
    </li>
  )
}

// The sandbox: every lever the rules keep out of reach. Skipping days is ordinary play;
// everything else is written into the record and marks the nation for good.
export function Sandbox({ current }: { current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const { content } = game
  const { state } = current
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, string>>({})
  const [dilemma, setDilemma] = useState(content.dilemmas[0]?.id ?? '')
  const [crisis, setCrisis] = useState(content.situations[0]?.id ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const rows = useMemo<{ title: string; rows: Row[] }[]>(
    () => [
      {
        title: 'The country',
        rows: INDICATORS.map((id) => ({
          key: `indicator:${id}`,
          label: INDICATOR_INFO[id].name,
          value: state.indicators[id],
          min: 0,
          max: 100,
          make: (to) => ({ indicator: id, to }),
        })),
      },
      {
        title: 'Factions',
        rows: content.factions.map((f) => ({
          key: `faction:${f.id}`,
          label: f.name,
          value: state.factions[f.id]?.approval ?? 50,
          min: 0,
          max: 100,
          make: (to) => ({ faction: f.id, to }),
        })),
      },
      {
        title: 'Relations',
        rows: content.neighbours.map((n) => ({
          key: `neighbour:${n.id}`,
          label: n.name,
          value: standingWith(state, content, n.id),
          min: -100,
          max: 100,
          make: (to) => ({ neighbour: n.id, to }),
        })),
      },
    ],
    [state, content],
  )

  function run(what: string, act: () => void) {
    try {
      act()
      setProblem(null)
      announce(what)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'the game refused')
    }
  }

  function applyFigures() {
    const changes: Adjustment[] = []
    for (const group of rows) {
      for (const row of group.rows) {
        const raw = drafts[row.key]
        if (raw === undefined || raw.trim() === '') continue
        const to = Number(raw)
        if (!Number.isFinite(to)) return setProblem(`${row.label} needs a number.`)
        changes.push(row.make(Math.min(row.max, Math.max(row.min, to))))
      }
    }
    if (changes.length === 0) return setProblem('Nothing has been changed yet.')
    run(`${changes.length} figures changed.`, () => game.adjust(changes))
    setDrafts({})
  }

  function applyPolicies() {
    const changes: Adjustment[] = []
    for (const [id, raw] of Object.entries(policyDrafts)) {
      const policy = content.policies.find((p) => p.id === id)
      if (!policy) continue
      if (typeof policy.default === 'boolean') changes.push({ policy: id, to: raw === 'on' })
      else if (Number.isFinite(Number(raw))) changes.push({ policy: id, to: Number(raw) })
    }
    if (changes.length === 0) return setProblem('No law has been changed yet.')
    run(`${changes.length} laws changed.`, () => game.adjust(changes))
    setPolicyDrafts({})
  }

  const sorted = useMemo(
    () => [...content.dilemmas].sort((a, b) => a.title.localeCompare(b.title)),
    [content.dilemmas],
  )

  return (
    <Screen title="Sandbox" kicker={`${state.identity.name}, day ${state.day}`} className="sandbox">
      <Notice title={state.sandbox ? 'This nation is sandboxed' : 'Before you touch anything'}>
        <p>
          {state.sandbox
            ? `${state.identity.name} has been changed by hand. It says so on every page and in the record, and always will.`
            : `Skipping days is ordinary play. Anything else here is written into the record and marks ${state.identity.name} as sandboxed, for good.`}
        </p>
      </Notice>
      {problem && (
        <Notice tone="problem" title="Not done">
          <p>{problem}</p>
        </Notice>
      )}

      <Sheet title="Time">
        <p className="soft small">Each skipped day is ended with nothing decided, exactly as if you had walked away.</p>
        <div className="row">
          <Button onClick={() => run('One day skipped.', () => game.skipDays(1))}>Skip a day</Button>
          <Button onClick={() => run('A week skipped.', () => game.skipDays(7))}>Skip a week</Button>
          <Button
            onClick={() =>
              run('Skipped past the election.', () => game.skipDays(current.electionIn + 1))
            }
          >
            Skip past the election ({current.electionIn + 1} days)
          </Button>
        </div>
      </Sheet>

      <Sheet title="Figures">
        <p className="soft small">Leave a box empty to leave that figure alone.</p>
        <div className="sandbox__groups">
          {rows.map((group) => (
            <fieldset key={group.title} className="sandbox__group">
              <legend className="label">{group.title}</legend>
              <ul>
                {group.rows.map((row) => (
                  <NumberRow
                    key={row.key}
                    row={row}
                    draft={drafts[row.key] ?? ''}
                    onChange={(value) => setDrafts({ ...drafts, [row.key]: value })}
                  />
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
        <Button look="primary" onClick={applyFigures}>
          Apply the figures
        </Button>
      </Sheet>

      <Sheet title="Laws">
        <ul className="sandbox__laws">
          {content.policies.map((policy) => {
            const now = state.policies[policy.id]
            const id = `law-${policy.id}`
            return (
              <li key={policy.id} className="sandbox__row">
                <label htmlFor={id}>{policy.name}</label>
                {typeof policy.default === 'boolean' ? (
                  <select
                    id={id}
                    className="field__input"
                    value={policyDrafts[policy.id] ?? (now === true ? 'on' : 'off')}
                    onChange={(event) => setPolicyDrafts({ ...policyDrafts, [policy.id]: event.target.value })}
                  >
                    <option value="on">In force</option>
                    <option value="off">Not in force</option>
                  </select>
                ) : (
                  <input
                    id={id}
                    className="field__input sandbox__number"
                    type="number"
                    value={policyDrafts[policy.id] ?? String(now)}
                    onChange={(event) => setPolicyDrafts({ ...policyDrafts, [policy.id]: event.target.value })}
                  />
                )}
              </li>
            )
          })}
        </ul>
        <Button look="primary" onClick={applyPolicies}>
          Apply the laws
        </Button>
      </Sheet>

      <Sheet title="Call up an issue">
        <p className="soft small">Puts it on today's desk, whether or not it would ever come up on its own.</p>
        <div className="row">
          <label className="visually-hidden" htmlFor="sandbox-issue">
            Issue
          </label>
          <select
            id="sandbox-issue"
            className="field__input"
            value={dilemma}
            onChange={(event) => setDilemma(event.target.value)}
          >
            {sorted.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.kind})
              </option>
            ))}
          </select>
          <Button onClick={() => run('Issue put on the desk.', () => game.callUp(dilemma))}>Call it up</Button>
        </div>
      </Sheet>

      <Sheet title="Start a crisis">
        <p className="soft small">Starts it now, at the first stage, in place of any crisis already running.</p>
        <div className="row">
          <label className="visually-hidden" htmlFor="sandbox-crisis">
            Crisis
          </label>
          <select
            id="sandbox-crisis"
            className="field__input"
            value={crisis}
            onChange={(event) => setCrisis(event.target.value)}
          >
            {content.situations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <Button onClick={() => run('Crisis started.', () => game.startCrisis(crisis))}>Start it</Button>
        </div>
      </Sheet>
    </Screen>
  )
}
