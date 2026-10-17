import { useState, type FormEvent } from 'react'
import { version } from '../../package.json'
import type { FlagSpec } from '../logic/flags.ts'
import { buildIdentity, checkIdentity, sameName, textOf } from '../logic/identity.ts'
import { THEMES, type Theme } from '../logic/settings.ts'
import { download } from '../store/browser.ts'
import { useGame, type Current } from '../store/game.tsx'
import { go } from '../store/route.ts'
import { useSettings } from '../store/settings.tsx'
import { useAction } from '../store/useAction.ts'
import { AiSettingsSheet } from './Ai.tsx'
import {
  Button,
  Dialog,
  FileButton,
  FlagEditor,
  IdentityFields,
  LinkTo,
  Notice,
  Screen,
  Segmented,
  Sheet,
  TextField,
  useAnnounce,
} from '../ui/index.ts'

const THEME_NAMES: Record<Theme, string> = { system: 'Follow the system', light: 'Day', dark: 'Night' }

type Imported = { ok: true; id: string; text: string } | { ok: false; text: string } | null

export function Settings({ current }: { current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const { settings, change } = useSettings()
  const saved = current.state.identity

  const [text, setText] = useState(() => textOf(saved))
  const [flag, setFlag] = useState<FlagSpec>(saved.flag)
  const [said, setSaid] = useState<string | null>(null)
  const [imported, setImported] = useState<Imported>(null)
  const [deleting, setDeleting] = useState(false)
  const [typed, setTyped] = useState('')
  const [wrong, setWrong] = useState(false)
  const action = useAction()

  const errors = checkIdentity(text)
  const problems = Object.keys(errors).length
  const next = buildIdentity(text, flag)
  const changed = JSON.stringify(next) !== JSON.stringify(buildIdentity(textOf(saved), saved.flag))

  function say(message: string) {
    setSaid(message)
    announce(message)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (problems > 0)
      return say(problems === 1 ? 'One line needs another look.' : `${problems} lines need another look.`)
    if (!changed) return say('Nothing has been changed.')
    const done = await action.run('identity', async () => {
      await game.setIdentity(next)
      return true
    })
    if (done) say('Saved. The papers have been told.')
  }

  async function exportSave() {
    const file = await action.run('export', () => game.exportSave(current.id))
    if (!file) return
    download(file.filename, file.text)
    say(`Exported as ${file.filename}.`)
  }

  async function importText(file: string | Error) {
    if (file instanceof Error) return setImported({ ok: false, text: file.message })
    const result = await game.importSave(file)
    if (!result.ok) return setImported({ ok: false, text: result.problem })
    setImported({ ok: true, id: result.id, text: `Imported ${result.name}. ${result.notice ?? ''}`.trim() })
  }

  function closeDelete() {
    setDeleting(false)
    setTyped('')
    setWrong(false)
  }

  async function remove() {
    if (!sameName(typed, saved.name)) return setWrong(true)
    const done = await action.run('remove', async () => {
      await game.remove(current.id)
      return true
    })
    if (!done) return closeDelete()
    announce(`${saved.name} has been deleted.`)
    go({ name: 'home' })
  }

  return (
    <Screen title="Settings" kicker={saved.name} className="settings">
      <div className="settings__sheets">
        <form onSubmit={(event) => void save(event)} noValidate className="settings__identity">
          <Sheet kicker="Identity" title="Names and titles">
            <p className="small soft measure">
              A new name appears from tomorrow's paper. Old headlines keep the name they were printed with.
            </p>
            <div className="measure">
              <IdentityFields
                value={text}
                onChange={(value) => {
                  setText(value)
                  setSaid(null)
                }}
                errors={errors}
              />
            </div>
          </Sheet>
          <Sheet kicker="Identity" title="The flag">
            <FlagEditor
              value={flag}
              onChange={(value) => {
                setFlag(value)
                setSaid(null)
              }}
            />
          </Sheet>
          <div className="settings__save">
            <Button type="submit" look="primary" disabled={action.busy !== null} aria-busy={action.busy === 'identity'}>
              Save name and flag
            </Button>
            <p className="small soft">
              {said ??
                (changed ? 'There are changes that have not been saved.' : 'Nothing has been changed.')}
            </p>
          </div>
        </form>

        {action.error && (
          <Notice tone="problem" title="Not done">
            <p>{action.error}</p>
          </Notice>
        )}

        <AiSettingsSheet />

        <Sheet kicker="This browser" title="Edition">
          <div className="stack">
            <Segmented
              legend="Theme"
              options={THEMES.map((theme) => ({ value: theme, label: THEME_NAMES[theme] }))}
              value={settings.theme}
              onChange={(theme) => change({ theme })}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={settings.reduceMotion}
                onChange={(event) => change({ reduceMotion: event.target.checked })}
              />
              <span>
                Reduce motion
                <span className="small soft"> Pages change at once, with nothing sliding or fading.</span>
              </span>
            </label>
            <p className="small soft">These apply to every nation in this browser.</p>
          </div>
        </Sheet>

        <Sheet kicker="Safekeeping" title="Export and import">
          <div className="stack measure">
            <p>
              The server keeps the nation and its whole archive after every decision. Take a copy now and then all
              the same. The file holds the nation, its government and every document.
            </p>
            <div className="row">
              <Button onClick={() => void exportSave()} disabled={action.busy !== null}>
                Export {saved.name}
              </Button>
              <FileButton look="secondary" onText={(file) => void importText(file)}>
                Import a save
              </FileButton>
            </div>
            <p className="small soft">
              An import never replaces anything. It is added beside the nations already here.
            </p>
            {imported && (
              <Notice
                tone={imported.ok ? 'note' : 'problem'}
                title={imported.ok ? undefined : 'That file was not imported'}
                actions={
                  imported.ok && (
                    <LinkTo to={{ name: 'nation', id: imported.id, page: 'desk' }} size="small">
                      Open it
                    </LinkTo>
                  )
                }
              >
                <p>{imported.text}</p>
              </Notice>
            )}
          </div>
        </Sheet>

        <Sheet kicker="About" title="Project Diplomat">
          <dl className="facts">
            <div>
              <dt className="label soft">Game</dt>
              <dd>Version {version}</dd>
            </div>
            <div>
              <dt className="label soft">Pack</dt>
              <dd>
                {game.content.pack.name}, version {game.content.pack.version}
              </dd>
            </div>
            <div>
              <dt className="label soft">Licence</dt>
              <dd>MIT</dd>
            </div>
          </dl>
          <p>Not affiliated with NationStates or Max Barry.</p>
          <p className="small soft">
            The game runs on this computer. There is no account and nothing is counted. Nothing leaves it unless
            the AI is switched on, and then only what the bodies are asked.
          </p>
        </Sheet>

        <Sheet kicker="The end" title={`Delete ${saved.name}`}>
          <div className="stack measure">
            <p>This removes the nation and its whole record from the server. It cannot be undone here.</p>
            <p>
              <Button look="danger" onClick={() => setDeleting(true)}>
                Delete this nation
              </Button>
            </p>
          </div>
        </Sheet>
      </div>

      <Dialog
        open={deleting}
        title={`Delete ${saved.name}?`}
        onClose={closeDelete}
        actions={
          <>
            <Button look="secondary" onClick={closeDelete}>
              Keep it
            </Button>
            <Button look="danger" onClick={() => void remove()} disabled={action.busy !== null}>
              Delete for good
            </Button>
          </>
        }
      >
        <p>
          {current.state.day === 1 ? 'One day' : `${current.state.day} days`} of history go with it. Export it
          first if there is any doubt.
        </p>
        <TextField
          label="Type the nation's name to confirm"
          hint={saved.name}
          value={typed}
          onChange={(value) => {
            setTyped(value)
            setWrong(false)
          }}
          error={wrong ? 'That is not its name.' : null}
        />
      </Dialog>
    </Screen>
  )
}
