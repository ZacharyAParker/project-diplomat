import { newNation, render } from '@diplomat/engine'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { FormId, Mode } from '@diplomat/government'
import { DEFAULT_FLAG, type FlagSpec } from '../logic/flags.ts'
import { DEFAULT_FOUNDER, FORMS, MODES } from '../logic/forms.ts'
import {
  EMPTY_TEXT,
  FIELDS,
  buildIdentity,
  checkField,
  checkIdentity,
  identityIsValid,
  type IdentityField,
  type IdentityText,
} from '../logic/identity.ts'
import type { FoundStep } from '../logic/router.ts'
import type { Rng } from '../logic/rng.ts'
import { useGame } from '../store/game.tsx'
import { go } from '../store/route.ts'
import { useAction } from '../store/useAction.ts'
import {
  Button,
  ChoiceList,
  Flag,
  FlagEditor,
  IdentityFields,
  LinkTo,
  Notice,
  Screen,
  Steps,
  TextField,
  useAnnounce,
} from '../ui/index.ts'

// Everything the player has entered so far. It lives above the three steps, so going
// back, or wandering off to the home page and returning, loses nothing.
export interface Draft {
  text: IdentityText
  flag: FlagSpec
  answers: Record<string, string>
  question: number
  form: Exclude<FormId, 'custom'>
  mode: Mode
  founder: { name: string; title: string }
}

export const EMPTY_DRAFT: Draft = {
  text: EMPTY_TEXT,
  flag: DEFAULT_FLAG,
  answers: {},
  question: 0,
  form: 'commonwealth',
  mode: 'govern',
  founder: DEFAULT_FOUNDER,
}

export interface FoundingProps {
  step: FoundStep
  draft: Draft
  onDraft(draft: Draft): void
  rng?: Rng
}

const STEP_NAMES = ['Name', 'Flag', 'Character', 'Government', 'Mode', 'Founder'] as const
const STEP_INDEX: Record<FoundStep, number> = { identity: 0, flag: 1, questions: 2, form: 3, mode: 4, founder: 5 }

export function Founding({ step, draft, onDraft, rng }: FoundingProps) {
  const ready = identityIsValid(draft.text)

  // The later steps need a name to talk about. Arriving at one by its address without
  // having filled in the first sends the player back there.
  useEffect(() => {
    if (step !== 'identity' && !ready) go({ name: 'found', step: 'identity' }, 'replace')
  }, [step, ready])

  if (step !== 'identity' && !ready) return null

  const progress = <Steps label="Founding, step by step" steps={STEP_NAMES} current={STEP_INDEX[step]} />
  if (step === 'identity')
    return <IdentityStep draft={draft} onDraft={onDraft} progress={progress} rng={rng} />
  if (step === 'flag') return <FlagStep draft={draft} onDraft={onDraft} progress={progress} rng={rng} />
  if (step === 'form') return <FormStep draft={draft} onDraft={onDraft} progress={progress} />
  if (step === 'mode') return <ModeStep draft={draft} onDraft={onDraft} progress={progress} />
  if (step === 'founder') return <FounderStep draft={draft} onDraft={onDraft} progress={progress} />
  return <QuestionStep draft={draft} onDraft={onDraft} progress={progress} />
}

interface StepProps {
  draft: Draft
  onDraft(draft: Draft): void
  progress: ReactNode
  rng?: Rng
}

function IdentityStep({ draft, onDraft, progress, rng }: StepProps) {
  const [tried, setTried] = useState(0)
  const form = useRef<HTMLFormElement>(null)
  const announce = useAnnounce()

  // Before the first attempt only an over-long entry is flagged, since a form that is
  // red before anything has been typed helps nobody.
  const all = checkIdentity(draft.text)
  const errors: Partial<Record<IdentityField, string>> = {}
  for (const { id, max } of FIELDS) {
    const tooLong = [...draft.text[id].trim()].length > max
    const problem = tried > 0 || tooLong ? checkField(id, draft.text[id]) : null
    if (problem) errors[id] = problem
  }

  useEffect(() => {
    if (tried > 0) form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
  }, [tried])

  function submit(event: FormEvent) {
    event.preventDefault()
    const count = Object.keys(all).length
    if (count === 0) return go({ name: 'found', step: 'flag' })
    setTried((n) => n + 1)
    announce(count === 1 ? 'One line needs another look.' : `${count} lines need another look.`)
  }

  return (
    <Screen
      title="Name the nation"
      kicker="Founding"
      intro={
        <p>
          Call it what you like. It will be in the papers every morning, so pick something you can live with.
        </p>
      }
      className="founding"
    >
      {progress}
      <form ref={form} className="stack measure" onSubmit={submit} noValidate>
        <IdentityFields
          value={draft.text}
          onChange={(text) => onDraft({ ...draft, text })}
          errors={errors}
          rng={rng}
        />
        <div className="founding__actions">
          <LinkTo to={{ name: 'home' }} look="quiet">
            Back
          </LinkTo>
          <Button type="submit" look="primary">
            Next: the flag
          </Button>
        </div>
      </form>
    </Screen>
  )
}

function FlagStep({ draft, onDraft, progress, rng }: StepProps) {
  return (
    <Screen
      title="Give it a flag"
      kicker="Founding"
      intro={<p>Something to hang outside the ministries of {draft.text.name.trim()}.</p>}
      className="founding"
    >
      {progress}
      <div className="stack">
        <FlagEditor value={draft.flag} onChange={(flag) => onDraft({ ...draft, flag })} rng={rng} />
        <div className="founding__actions">
          <LinkTo to={{ name: 'found', step: 'identity' }} look="quiet">
            Back
          </LinkTo>
          <LinkTo to={{ name: 'found', step: 'questions' }} look="primary">
            Next: its character
          </LinkTo>
        </div>
      </div>
    </Screen>
  )
}

function QuestionStep({ draft, onDraft, progress }: StepProps) {
  const game = useGame()
  const { questions } = game.content.founding
  const [missing, setMissing] = useState(false)
  const prompt = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  const identity = useMemo(() => buildIdentity(draft.text, draft.flag), [draft.text, draft.flag])
  // A throwaway nation, so the engine can fill in the name where a question mentions it.
  const preview = useMemo(() => newNation(game.content, identity, 0), [game.content, identity])

  const at = Math.min(draft.question, Math.max(0, questions.length - 1))
  const question = questions[at]
  const last = at >= questions.length - 1
  const answer = question ? (draft.answers[question.id] ?? null) : null

  useEffect(() => {
    if (moved.current) prompt.current?.focus()
  }, [at])

  function turnTo(index: number) {
    moved.current = true
    setMissing(false)
    onDraft({ ...draft, question: index })
  }

  function next() {
    if (question && answer === null) return setMissing(true)
    if (last) go({ name: 'found', step: 'form' })
    else turnTo(at + 1)
  }

  return (
    <Screen
      title="Its character"
      kicker="Founding"
      intro={<p>No wrong answers and no score. Answer as the country, not as yourself.</p>}
      className="founding"
    >
      {progress}
      <div className="stack measure">
        {question ? (
          <>
            <p className="label soft">
              Question {at + 1} of {questions.length}
            </p>
            <ChoiceList
              legend={
                <h2 ref={prompt} tabIndex={-1} className="founding__prompt">
                  {render(question.prompt, preview, game.content)}
                </h2>
              }
              options={question.answers.map((a) => ({
                value: a.id,
                label: render(a.label, preview, game.content),
              }))}
              value={answer}
              onChange={(value) => {
                setMissing(false)
                onDraft({ ...draft, answers: { ...draft.answers, [question.id]: value } })
              }}
            />
            {missing && (
              <p className="field__error small" role="alert">
                Pick an answer first. Any of them will do.
              </p>
            )}
          </>
        ) : (
          <p>This pack asks nothing of a new nation. It starts as every nation does.</p>
        )}

        <div className="founding__summary">
          <Flag flag={draft.flag} width="2.5rem" />
          <span className="small soft">
            {identity.name}, capital {identity.capital}
          </span>
        </div>

        <div className="founding__actions">
          {at === 0 ? (
            <LinkTo to={{ name: 'found', step: 'flag' }} look="quiet">
              Back
            </LinkTo>
          ) : (
            <Button look="quiet" onClick={() => turnTo(at - 1)}>
              Back
            </Button>
          )}
          <Button look="primary" onClick={next}>
            {last ? 'Next: the government' : 'Next question'}
          </Button>
        </div>
      </div>
    </Screen>
  )
}

function FormStep({ draft, onDraft, progress }: StepProps) {
  const name = draft.text.name.trim()
  return (
    <Screen
      title="Its government"
      kicker="Founding"
      intro={<p>Who argues, who may say no, and who decides. It can be changed later, though not easily.</p>}
      className="founding"
    >
      {progress}
      <div className="stack measure">
        <ChoiceList
          legend={`The form of government of ${name}`}
          legendHidden
          options={FORMS.map((form) => ({ value: form.id, label: form.name, detail: form.line }))}
          value={draft.form}
          onChange={(form) => onDraft({ ...draft, form })}
        />
        <div className="founding__actions">
          <LinkTo to={{ name: 'found', step: 'questions' }} look="quiet">
            Back
          </LinkTo>
          <LinkTo to={{ name: 'found', step: 'mode' }} look="primary">
            Next: your part in it
          </LinkTo>
        </div>
      </div>
    </Screen>
  )
}

function ModeStep({ draft, onDraft, progress }: StepProps) {
  const executive = FORMS.find((f) => f.id === draft.form)?.executive ?? 'The executive'
  return (
    <Screen
      title="Your part in it"
      kicker="Founding"
      intro={
        <p>
          You are the Founder either way, above every branch. The question is whether you also hold the office of{' '}
          {executive.replace(/^The /, 'the ')}.
        </p>
      }
      className="founding"
    >
      {progress}
      <div className="stack measure">
        <ChoiceList
          legend="How you play"
          legendHidden
          options={MODES.map((mode) => ({ value: mode.id, label: mode.name, detail: mode.line }))}
          value={draft.mode}
          onChange={(mode) => onDraft({ ...draft, mode })}
        />
        <p className="small soft">You can switch between the two at any time, on the nation page.</p>
        <div className="founding__actions">
          <LinkTo to={{ name: 'found', step: 'form' }} look="quiet">
            Back
          </LinkTo>
          <LinkTo to={{ name: 'found', step: 'founder' }} look="primary">
            Next: the Founder
          </LinkTo>
        </div>
      </div>
    </Screen>
  )
}

const FOUNDER_MAX = 40

function lineProblem(text: string, empty: string): string | null {
  if (!text) return empty
  return [...text].length > FOUNDER_MAX ? `Keep it to ${FOUNDER_MAX} characters.` : null
}

function FounderStep({ draft, onDraft, progress }: StepProps) {
  const game = useGame()
  const announce = useAnnounce()
  const action = useAction()
  const [tried, setTried] = useState(false)
  const identity = useMemo(() => buildIdentity(draft.text, draft.flag), [draft.text, draft.flag])
  const name = draft.founder.name.trim()
  const title = draft.founder.title.trim()
  const nameProblem = lineProblem(name, 'The Founder needs a name, even if it is only "the Founder".')
  const titleProblem = lineProblem(title, 'A title, please. "Founder" will do.')

  async function found(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (nameProblem || titleProblem) return
    const id = await action.run('found', () =>
      game.found({ identity, answers: draft.answers, form: draft.form, mode: draft.mode, founder: { name, title } }),
    )
    if (id === undefined) return
    onDraft(EMPTY_DRAFT)
    announce(`${identity.name} is founded.`)
    go({ name: 'nation', id, page: 'morning' }, 'replace')
  }

  return (
    <Screen
      title="The Founder"
      kicker="Founding"
      intro={<p>That is you. The bodies will address you by this, and so will the letters.</p>}
      className="founding"
    >
      {progress}
      <form className="stack measure" onSubmit={(event) => void found(event)} noValidate>
        <TextField
          label="The Founder's name"
          value={draft.founder.name}
          maxLength={FOUNDER_MAX + 10}
          onChange={(value) => onDraft({ ...draft, founder: { ...draft.founder, name: value } })}
          hint='Leave it as "the Founder" to stay anonymous.'
          error={tried ? nameProblem : null}
        />
        <TextField
          label="Title"
          value={draft.founder.title}
          maxLength={FOUNDER_MAX + 10}
          onChange={(value) => onDraft({ ...draft, founder: { ...draft.founder, title: value } })}
          error={tried ? titleProblem : null}
        />
        <div className="founding__summary">
          <Flag flag={draft.flag} width="2.5rem" />
          <span className="small soft">
            {identity.name}, capital {identity.capital}
          </span>
        </div>
        {action.error && (
          <Notice tone="problem" title="Not founded">
            <p>{action.error}</p>
          </Notice>
        )}
        <div className="founding__actions">
          <LinkTo to={{ name: 'found', step: 'mode' }} look="quiet">
            Back
          </LinkTo>
          <Button type="submit" look="accent" disabled={action.busy !== null} aria-busy={action.busy !== null}>
            {action.busy ? `Founding ${identity.name}` : `Found ${identity.name}`}
          </Button>
        </div>
      </form>
    </Screen>
  )
}
