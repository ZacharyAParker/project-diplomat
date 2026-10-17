import type { ProviderStatus, Tier } from '@diplomat/government'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { DEFAULT_DIRECTOR, type AiSettings, type Backend } from '../api.ts'
import { useGame } from '../store/game.tsx'
import { useAction } from '../store/useAction.ts'
import { Button, ChoiceList, Notice, Screen, Sheet, TextField, useAnnounce } from '../ui/index.ts'

const BACKENDS: readonly { id: Backend; name: string; line: string }[] = [
  {
    id: 'none',
    name: 'No AI',
    line: 'Rules-based stand-ins play the bodies. Everything works; the debates are short and the court is predictable.',
  },
  {
    id: 'anthropic',
    name: 'A Claude API key',
    line: 'Your own key, used by the server only. It is never sent back to this page, and you pay for what is used.',
  },
  {
    id: 'claude-cli',
    name: 'My own Claude Code',
    line: 'The claude command already installed and signed in on this computer, reading the nation’s archive itself. The game never sees the credentials.',
  },
]

const TIERS: readonly { id: Tier; name: string; hint: string }[] = [
  { id: 'bulk', name: 'Model for routine work', hint: 'Ministry papers and letters.' },
  { id: 'standard', name: 'Model for the day’s business', hint: 'The world, the press, councils, bills.' },
  { id: 'strategic', name: 'Model for the great bodies', hint: 'The legislature, the court and the executive.' },
]

function StatusLine({ status }: { status: ProviderStatus }) {
  const words = status.backend === 'none' ? 'Off' : status.ok ? 'Working' : 'Not working'
  return (
    <p className="ai__status">
      <span className="label">{words}</span> {status.detail}
    </p>
  )
}

// The AI section of the settings: which back end, the key, the models, and a test.
export function AiSettingsSheet() {
  const game = useGame()
  const announce = useAnnounce()
  const loading = useAction()
  const saving = useAction()
  const [saved, setSaved] = useState<AiSettings | null>(null)
  const [backend, setBackend] = useState<Backend>('none')
  const [key, setKey] = useState('')
  const [models, setModels] = useState<Record<Tier, string>>({ bulk: '', standard: '', strategic: '' })
  const [minors, setMinors] = useState(false)
  const [director, setDirector] = useState(DEFAULT_DIRECTOR)
  const directorId = useId()
  const [tested, setTested] = useState<ProviderStatus | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const minorsId = useId()

  const { aiSettings } = game
  const { run } = loading
  useEffect(() => {
    void run('load', async () => {
      const settings = await aiSettings()
      setSaved(settings)
      setBackend(settings.backend)
      setModels(settings.models)
      setMinors(settings.minorsThroughBodies)
      setDirector(settings.director ?? DEFAULT_DIRECTOR)
    })
  }, [aiSettings, run])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaid(null)
    const settings = await saving.run('save', () =>
      game.saveAiSettings({
        backend,
        models,
        minorsThroughBodies: minors,
        director: { enabled: director.enabled, model: director.model.trim() || DEFAULT_DIRECTOR.model },
        ...(key.trim() ? { apiKey: key.trim() } : {}),
      }),
    )
    if (!settings) return
    setSaved(settings)
    setKey('')
    setSaid('Saved.')
    announce('The AI settings are saved.')
  }

  async function test() {
    setTested(null)
    const status = await saving.run('test', () => game.testAi())
    if (status) setTested(status)
  }

  const status = game.status?.ai
  return (
    <Sheet kicker="This computer" title="The AI">
      <div className="stack measure">
        <p className="small soft">
          The AI plays the bodies, the world and the press. With it off, rules-based stand-ins play them and the game
          still works. These settings are kept by the server and apply to every nation.
        </p>
        {status ? (
          <StatusLine status={status} />
        ) : (
          <p className="soft small">{game.statusError ?? 'Asking the server how the AI is.'}</p>
        )}
        {loading.error && (
          <Notice tone="problem" title="The settings could not be read">
            <p>{loading.error}</p>
          </Notice>
        )}
        {saved && (
          <form className="stack" onSubmit={(event) => void save(event)} noValidate>
            <ChoiceList
              legend="Who plays the bodies"
              options={BACKENDS.map((b) => ({ value: b.id, label: b.name, detail: b.line }))}
              value={backend}
              onChange={(value) => {
                setBackend(value)
                setSaid(null)
              }}
            />
            {backend === 'anthropic' && (
              <TextField
                label="Claude API key"
                type="password"
                autoComplete="off"
                value={key}
                onChange={(value) => {
                  setKey(value)
                  setSaid(null)
                }}
                hint={
                  saved.apiKeySet
                    ? 'A key is set. It is never shown again. Type a new one only to replace it.'
                    : 'No key is set yet. It is stored by the server on this computer and never sent back here.'
                }
              />
            )}
            {backend !== 'none' &&
              TIERS.map((tier) => (
                <TextField
                  key={tier.id}
                  label={tier.name}
                  value={models[tier.id]}
                  hint={tier.hint}
                  onChange={(value) => setModels({ ...models, [tier.id]: value })}
                />
              ))}
            <label className="check" htmlFor={minorsId}>
              <input id={minorsId} type="checkbox" checked={minors} onChange={(event) => setMinors(event.target.checked)} />
              <span>
                Minor issues go through the bodies too
                <span className="small soft"> Slower and dearer, and the record is fuller. New nations start with this.</span>
              </span>
            </label>
            <fieldset className="ai__director stack">
              <legend className="label">The Director</legend>
              <p className="small soft">
                Your partner out of character. It always runs on your own Claude Code, whatever plays the bodies.
              </p>
              <label className="check" htmlFor={directorId}>
                <input
                  id={directorId}
                  type="checkbox"
                  checked={director.enabled}
                  onChange={(event) => setDirector({ ...director, enabled: event.target.checked })}
                />
                <span>Switch the Director on</span>
              </label>
              {director.enabled && (
                <TextField
                  label="The Director's model"
                  value={director.model}
                  hint={`Left empty, ${DEFAULT_DIRECTOR.model}.`}
                  onChange={(model) => setDirector({ ...director, model })}
                />
              )}
            </fieldset>
            <div className="row">
              <Button type="submit" look="primary" disabled={saving.busy !== null} aria-busy={saving.busy === 'save'}>
                {saving.busy === 'save' ? 'Saving' : 'Save the AI settings'}
              </Button>
              <Button onClick={() => void test()} disabled={saving.busy !== null} aria-busy={saving.busy === 'test'}>
                {saving.busy === 'test' ? 'Testing' : 'Test it'}
              </Button>
            </div>
            {said && <p className="small soft">{said}</p>}
            {saving.error && (
              <Notice tone="problem" title="Not done">
                <p>{saving.error}</p>
              </Notice>
            )}
            {tested && (
              <Notice tone={tested.ok ? 'note' : 'problem'} title={tested.ok ? 'The test passed' : 'The test failed'}>
                <p>{tested.detail}</p>
              </Notice>
            )}
          </form>
        )}
      </div>
    </Sheet>
  )
}

// The same section on a page of its own, reached from the menu's AI line outside a nation.
export function AiScreen() {
  return (
    <Screen title="The AI" className="settings">
      <AiSettingsSheet />
    </Screen>
  )
}
