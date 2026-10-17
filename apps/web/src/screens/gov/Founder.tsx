import type { Letter, Question } from '@diplomat/government'
import { useId, useState, type FormEvent } from 'react'
import { openDockets } from '../../logic/docket.ts'
import { docRoute, isDocId } from '../../logic/router.ts'
import { useGame, type Current } from '../../store/game.tsx'
import { useAction } from '../../store/useAction.ts'
import { Button, Notice, Tag, TextField, TextLink, useAnnounce } from '../../ui/index.ts'
import { Band, GovFrame, nationDate } from './shared.tsx'

const ASKED_BY: Record<Question['kind'], string> = {
  court: 'A court',
  legislature: 'The legislature',
  counsel: 'Counsel',
  press: 'The press',
  ministry: 'A ministry',
  citizen: 'A citizen',
  other: 'Someone',
  review: 'The executive’s office, on review',
}

function Area({ label, value, onChange, error, rows = 4 }: { label: string; value: string; onChange(v: string): void; error?: string | null; rows?: number }) {
  const id = useId()
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label className="field__label label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="field__input field__area"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="field__error small">
          {error}
        </p>
      )}
    </div>
  )
}

function QuestionItem({ question, current }: { question: Question; current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const action = useAction()
  const [answer, setAnswer] = useState('')
  const [missing, setMissing] = useState(false)
  const government = current.government

  async function send(kind: 'answer' | 'none' | 'later') {
    if (kind === 'answer' && !answer.trim()) return setMissing(true)
    const body = kind === 'answer' ? { answer: answer.trim() } : kind === 'none' ? ({ noAnswer: true } as const) : ({ later: true } as const)
    const done = await action.run(kind, async () => {
      await game.answerQuestion(question.id, body)
      return true
    })
    if (done) announce(kind === 'answer' ? `Your answer to ${question.id} is recorded.` : kind === 'none' ? `${question.id} is left unanswered.` : `${question.id} is set aside for later.`)
  }

  return (
    <li className="founder-q" aria-labelledby={`q-${question.id}`}>
      <div className="founder-q__ask">
        <p className="founder-q__who small" id={`q-${question.id}`}>
          <span className="gov-cite">{question.id}</span> {ASKED_BY[question.kind]}: {question.from}, {nationDate(government, question.day)}
          {question.status === 'later' && (
            <>
              {' '}
              <Tag>Set aside for later</Tag>
            </>
          )}
        </p>
        <blockquote className="founder-q__text">
          <p>{question.text}</p>
        </blockquote>
        {question.source && isDocId(question.source) && (
          <TextLink to={docRoute(current.id, question.source)} className="small">
            Where it was asked
          </TextLink>
        )}
      </div>
      <div className="founder-q__answer stack">
        <Area
          label={`Your answer to ${question.id}`}
          value={answer}
          onChange={(value) => {
            setAnswer(value)
            setMissing(false)
          }}
          error={missing ? 'Write an answer first, or choose No answer.' : null}
        />
        <div className="row">
          <Button look="primary" size="small" disabled={action.busy !== null} aria-busy={action.busy === 'answer'} onClick={() => void send('answer')}>
            Answer
          </Button>
          <Button size="small" disabled={action.busy !== null} onClick={() => void send('none')}>
            No answer
          </Button>
          {question.status !== 'later' && (
            <Button size="small" look="quiet" disabled={action.busy !== null} onClick={() => void send('later')}>
              Ask me later
            </Button>
          )}
        </div>
        {action.error && <p className="field__error small">{action.error}</p>}
      </div>
    </li>
  )
}

function LetterItem({ letter, current }: { letter: Letter; current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const action = useAction()
  const [reply, setReply] = useState('')
  const [missing, setMissing] = useState(false)
  const government = current.government
  const dealt = letter.status === 'replied' || letter.status === 'no-reply'

  async function send(name: string, body: Parameters<typeof game.letter>[1], said: string) {
    const done = await action.run(name, async () => {
      await game.letter(letter.id, body)
      return true
    })
    if (done) announce(said)
  }

  return (
    <li className="letter" aria-labelledby={`l-${letter.id}`}>
      <div className="letter__side small">
        <p className="gov-cite">{letter.id}</p>
        <p>
          <Tag tone={letter.status === 'unread' ? 'accent' : letter.status === 'replied' ? 'good' : 'plain'}>
            {letter.status === 'unread' ? 'Unread' : letter.status === 'read' ? 'Read' : letter.status === 'replied' ? 'Replied by you' : 'Read, no reply'}
          </Tag>
          {letter.urgent && (
            <>
              {' '}
              <Tag tone="bad">Urgent</Tag>
            </>
          )}
        </p>
        {letter.place && <p>From {letter.place}</p>}
        <p>{nationDate(government, letter.day)}</p>
      </div>
      <div className="letter__body">
        <h3 id={`l-${letter.id}`}>
          <span className="letter__from">From</span> {letter.from}
        </h3>
        <p className="letter__text">{letter.text}</p>

        {letter.reply && (
          <div className="letter__reply">
            <p className="label">Your reply</p>
            <p>{letter.reply}</p>
          </div>
        )}

        {letter.draft && !dealt && (
          <div className="letter__draft">
            <p className="label">The office’s draft reply. It is not yours unless you adopt it.</p>
            <p>{letter.draft}</p>
          </div>
        )}

        {!dealt && (
          <div className="stack">
            <div className="row">
              {letter.draft && (
                <Button
                  look="primary"
                  size="small"
                  disabled={action.busy !== null}
                  aria-label={`Adopt the draft reply to ${letter.id}`}
                  onClick={() => void send('adopt', { adopt: true }, `The draft reply to ${letter.id} is adopted.`)}
                >
                  Adopt the draft
                </Button>
              )}
              <Button
                size="small"
                disabled={action.busy !== null}
                aria-label={`No reply to ${letter.id}`}
                onClick={() => void send('none', { noReply: true }, `${letter.id} is marked: no reply.`)}
              >
                No reply
              </Button>
              {letter.status === 'unread' && (
                <Button
                  size="small"
                  look="quiet"
                  disabled={action.busy !== null}
                  aria-label={`Mark ${letter.id} read`}
                  onClick={() => void send('read', { read: true }, `${letter.id} is marked read.`)}
                >
                  Mark read
                </Button>
              )}
            </div>
            <details className="fold">
              <summary>{letter.draft ? 'Change it, or write your own' : 'Write a reply'}</summary>
              <div className="fold__body stack">
                <Area
                  label={`Your reply to ${letter.id}`}
                  value={reply}
                  onChange={(value) => {
                    setReply(value)
                    setMissing(false)
                  }}
                  error={missing ? 'Write the reply first.' : null}
                />
                <p>
                  <Button
                    look="primary"
                    size="small"
                    disabled={action.busy !== null}
                    onClick={() => (reply.trim() ? void send('reply', { reply: reply.trim() }, `Your reply to ${letter.id} is recorded.`) : setMissing(true))}
                  >
                    Send this reply
                  </Button>
                </p>
                {letter.draft && (
                  <p>
                    <Button size="small" look="quiet" onClick={() => setReply(letter.draft ?? '')}>
                      Start from the draft
                    </Button>
                  </p>
                )}
              </div>
            </details>
          </div>
        )}
        {action.error && <p className="field__error small">{action.error}</p>}
      </div>
    </li>
  )
}

function GiveWord({ current }: { current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const action = useAction()
  const [text, setText] = useState('')
  const [overrules, setOverrules] = useState('')
  const [reference, setReference] = useState('')
  const [silence, setSilence] = useState(false)
  const [tried, setTried] = useState(false)
  const overrulesId = useId()
  const silenceId = useId()
  const open = openDockets(current.government)
  const title = (dilemma: string) => game.content.dilemmas.find((d) => d.id === dilemma)?.title ?? dilemma
  const referenceProblem = reference.trim() && !isDocId(reference.trim()) ? 'A reference looks like hansard-00012.' : null

  async function give(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (!text.trim() || referenceProblem) return
    const target = reference.trim() || overrules
    const done = await action.run('word', async () => {
      await game.giveWord({ text: text.trim(), ...(target ? { overrules: target } : {}), ...(silence ? { silence: true } : {}) })
      return true
    })
    if (!done) return
    setText('')
    setOverrules('')
    setReference('')
    setSilence(false)
    setTried(false)
    announce('Your Word is entered. It is laid before the bodies until you confirm it.')
  }

  return (
    <form className="stack founder-word" onSubmit={(event) => void give(event)} noValidate>
      <Area
        label="The Word, exactly as it is to be entered"
        rows={6}
        value={text}
        onChange={setText}
        error={tried && !text.trim() ? 'A Word needs words.' : null}
      />
      <div className="field">
        <label className="field__label label" htmlFor={overrulesId}>
          It overrules
        </label>
        <select id={overrulesId} className="field__input" value={overrules} onChange={(event) => setOverrules(event.target.value)}>
          <option value="">Nothing in particular</option>
          {open.map((docket) => (
            <option key={docket.dilemma} value={docket.dilemma}>
              Petition #{docket.number}, {title(docket.dilemma)}
            </option>
          ))}
        </select>
      </div>
      <TextField
        label="Or a document it overrules"
        value={reference}
        onChange={setReference}
        hint="Its reference, from the document's page. Leave empty for none."
        error={tried ? referenceProblem : null}
      />
      <label className="check" htmlFor={silenceId}>
        <input id={silenceId} type="checkbox" checked={silence} onChange={(event) => setSilence(event.target.checked)} />
        <span>
          Silence
          <span className="small soft"> Nobody may argue it further. The bodies may not remonstrate.</span>
        </span>
      </label>
      {action.error && (
        <Notice tone="problem" title="The Word was not entered">
          <p>{action.error}</p>
        </Notice>
      )}
      <p>
        <Button type="submit" look="primary" disabled={action.busy !== null} aria-busy={action.busy !== null}>
          Give the Word
        </Button>
      </p>
    </form>
  )
}

function Words({ current }: { current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const action = useAction()
  const words = [...(current.government?.words ?? [])].reverse()
  if (words.length === 0) return <p className="gov-none">No Word has been given.</p>
  return (
    <>
      {action.error && (
        <Notice tone="problem" title="Not confirmed">
          <p>{action.error}</p>
        </Notice>
      )}
      <ol className="founder-words" reversed>
        {words.map((word) => (
          <li key={word.number}>
            <p className="small">
              <span className="gov-cite">Word No. {word.number}</span>, {nationDate(current.government, word.day)}
              {word.silence && (
                <>
                  {' '}
                  <Tag>Silence</Tag>
                </>
              )}{' '}
              <Tag tone={word.confirmed ? 'good' : 'plain'}>{word.confirmed ? 'Confirmed' : 'Not yet confirmed'}</Tag>
            </p>
            <blockquote className="founder-words__text">
              <p>{word.text}</p>
            </blockquote>
            {word.overrules && <p className="small soft">It overrules {word.overrules}.</p>}
            {word.remonstrances.length > 0 && (
              <p className="small">
                Answered by:{' '}
                {word.remonstrances.map((doc, i) => (
                  <span key={doc}>
                    {i > 0 && ', '}
                    <TextLink to={docRoute(current.id, doc)}>{doc}</TextLink>
                  </span>
                ))}
              </p>
            )}
            {!word.confirmed && (
              <p>
                <Button
                  size="small"
                  look="primary"
                  disabled={action.busy !== null}
                  onClick={() =>
                    void action.run('confirm', async () => {
                      await game.giveWord({ number: word.number, confirm: true })
                      announce(`Word No. ${word.number} is confirmed. It is final.`)
                    })
                  }
                >
                  Confirm Word No. {word.number}
                </Button>
              </p>
            )}
            {word.document && (
              <TextLink to={docRoute(current.id, word.document)} className="small">
                As entered in the record
              </TextLink>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}

// The Founder's own page: what is put to them, the letters, the Words given, and the place
// to give another. It records; nothing here acts until the server has taken it.
export function Founder({ current }: { current: Current }) {
  const government = current.government
  const founder = government?.institutions.founder
  const open = government?.questions.filter((q) => q.status === 'open' || q.status === 'later') ?? []
  const settled = government?.questions.filter((q) => q.status === 'answered' || q.status === 'no-answer') ?? []
  const letters = [...(government?.letters ?? [])].sort((a, b) => {
    const rank = (l: Letter) => (l.status === 'unread' ? 0 : l.status === 'read' ? 1 : 2)
    return rank(a) - rank(b) || Number(b.urgent) - Number(a.urgent) || b.day - a.day
  })

  return (
    <GovFrame
      current={current}
      here="founder"
      founder
      title="The Founder’s page"
      intro={
        <p>
          For {founder?.name ?? 'the Founder'}. The questions put to you, the letters written to you, and your Words.
          What you write here is entered word for word.
        </p>
      }
    >
      <Band title="Questions for you">
        {open.length === 0 ? (
          <p className="gov-none">No question is waiting for your answer.</p>
        ) : (
          <ul className="founder-qs">
            {open.map((q) => (
              <QuestionItem key={q.id} question={q} current={current} />
            ))}
          </ul>
        )}
        {settled.length > 0 && (
          <details className="fold">
            <summary>Answered ({settled.length})</summary>
            <ul className="plain-list small">
              {settled.map((q) => (
                <li key={q.id}>
                  <p>
                    <span className="gov-cite">{q.id}</span> {q.text}
                  </p>
                  <p className="soft">{q.status === 'answered' ? `Your answer: ${q.answer ?? ''}` : 'Left unanswered.'}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Band>

      <Band title="Letters to you">
        {letters.length === 0 ? (
          <p className="gov-none">Nobody has written.</p>
        ) : (
          <ul className="letters">
            {letters.map((letter) => (
              <LetterItem key={letter.id} letter={letter} current={current} />
            ))}
          </ul>
        )}
      </Band>

      <Band title="Give a Word">
        <p className="small">
          A Word stands above every branch. It is laid before the bodies, who may remonstrate, and takes effect when you
          confirm it. Overruling a ruling or a binding vote costs the government a little legitimacy.
        </p>
        <GiveWord current={current} />
      </Band>

      <Band title="Words already given">
        <Words current={current} />
      </Band>
    </GovFrame>
  )
}
