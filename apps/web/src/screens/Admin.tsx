import { useMemo, useState } from 'react'
import { checkPassword, hasPassword, MIN_PASSWORD, passwordProblem, setPassword } from '../logic/admin.ts'
import { useGame } from '../store/game.tsx'
import { download } from '../store/browser.ts'
import { useSettings } from '../store/settings.tsx'
import { Button, Notice, Screen, Sheet, TextField, useAnnounce } from '../ui/index.ts'

// A wrong password costs a second, so guessing from the keyboard is slow.
const WRONG_DELAY = 1000

function SetPassword({ onSet }: { onSet(): void }) {
  const { kv } = useSettings()
  const [password, setFirst] = useState('')
  const [again, setAgain] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    const wrong = passwordProblem(password, again)
    if (wrong) return setProblem(wrong)
    setBusy(true)
    await setPassword(kv, password)
    setBusy(false)
    onSet()
  }

  return (
    <Sheet title="Set an admin password">
      <p>
        The admin page is locked with a password of your choosing, at least {MIN_PASSWORD} characters. It is kept
        in this browser as a salted hash, never as the password itself. Anyone playing in this browser will need
        it to get in here. It does not stop someone with the browser's developer tools, and nothing kept only in
        a browser can.
      </p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={setFirst} />
        <TextField
          label="The same again"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={setAgain}
          error={problem}
        />
        <Button look="primary" type="submit" disabled={busy}>
          Set the password
        </Button>
      </form>
    </Sheet>
  )
}

function Unlock({ onUnlock }: { onUnlock(): void }) {
  const { kv } = useSettings()
  const [password, setValue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function attempt() {
    setBusy(true)
    const right = await checkPassword(kv, password)
    if (right) {
      setBusy(false)
      return onUnlock()
    }
    await new Promise((resolve) => setTimeout(resolve, WRONG_DELAY))
    setBusy(false)
    setValue('')
    setProblem('That is not the admin password.')
  }

  return (
    <Sheet title="Locked">
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          void attempt()
        }}
      >
        <TextField
          label="Admin password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setValue}
          error={problem}
        />
        <Button look="primary" type="submit" disabled={busy || password === ''}>
          Unlock
        </Button>
      </form>
    </Sheet>
  )
}

function Tools({ onLock }: { onLock(): void }) {
  const game = useGame()
  const announce = useAnnounce()
  const { content, nations } = game
  const [confirm, setConfirm] = useState('')
  const [changing, setChanging] = useState(false)
  const [filter, setFilter] = useState('')

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase()
    return content.dilemmas.filter(
      (d) => !term || d.title.toLowerCase().includes(term) || d.id.includes(term),
    )
  }, [content.dilemmas, filter])

  function exportAll() {
    const saves = nations.flatMap((n) => {
      const file = game.exportSave(n.id)
      return file ? [{ id: n.id, save: file.text }] : []
    })
    download('project-diplomat-all-saves.json', JSON.stringify({ saves }, null, 1))
    announce(`${saves.length} saves exported.`)
  }

  function deleteAll() {
    for (const n of nations) game.remove(n.id)
    setConfirm('')
    announce('Every nation in this browser has been deleted.')
  }

  if (changing) return <SetPassword onSet={() => setChanging(false)} />

  return (
    <>
      <Sheet title="Nations in this browser">
        {nations.length === 0 ? (
          <p className="soft">None.</p>
        ) : (
          <table className="admin__table">
            <thead>
              <tr>
                <th scope="col">Nation</th>
                <th scope="col">Day</th>
                <th scope="col">Sandboxed</th>
                <th scope="col">Last played</th>
              </tr>
            </thead>
            <tbody>
              {nations.map((n) => (
                <tr key={n.id}>
                  <th scope="row">{n.name}</th>
                  <td className="figures">{n.problem ? 'Unreadable' : n.day}</td>
                  <td>{n.sandbox ? 'Yes' : 'No'}</td>
                  <td className="small">{n.updatedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row">
          <Button onClick={exportAll} disabled={nations.length === 0}>
            Export every save
          </Button>
        </div>
      </Sheet>

      <Sheet title="Delete everything">
        <p>Removes every nation from this browser. Export them first if you want them back.</p>
        <TextField
          label='Type "delete everything" to confirm'
          value={confirm}
          onChange={setConfirm}
          autoComplete="off"
        />
        <Button look="danger" onClick={deleteAll} disabled={confirm.trim().toLowerCase() !== 'delete everything'}>
          Delete every nation
        </Button>
      </Sheet>

      <Sheet title={`The pack: ${content.pack.name} ${content.pack.version}`}>
        <p className="small soft">
          {content.dilemmas.length} issues, {content.situations.length} crises, {content.neighbours.length} neighbours,{' '}
          {content.traits.length} traits. Checked against the house rules when the game was built.
        </p>
        <TextField label="Find an issue" value={filter} onChange={setFilter} autoComplete="off" />
        <table className="admin__table">
          <thead>
            <tr>
              <th scope="col">Issue</th>
              <th scope="col">Kind</th>
              <th scope="col">Comes up</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 60).map((d) => (
              <tr key={d.id}>
                <th scope="row">
                  {d.title}
                  <span className="small soft"> ({d.id})</span>
                </th>
                <td>{d.kind}</td>
                <td className="small">
                  {[d.abroad && 'abroad', d.repeat && `every ${d.repeat} days`, d.priority > 0 && 'follow-up', d.when && 'on conditions']
                    .filter(Boolean)
                    .join(', ') || 'any time'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length > 60 && <p className="small soft">{shown.length - 60} more. Narrow the search to see them.</p>}
      </Sheet>

      <Sheet title="The lock">
        <div className="row">
          <Button onClick={() => setChanging(true)}>Change the password</Button>
          <Button look="primary" onClick={onLock}>
            Lock the admin page
          </Button>
        </div>
      </Sheet>
    </>
  )
}

// Locked behind the admin password. The sandbox is for players; this is for whoever looks
// after the browser the game is played in.
export function Admin() {
  const { kv } = useSettings()
  const [set, setSet] = useState(() => hasPassword(kv))
  const [open, setOpen] = useState(false)

  return (
    <Screen title="Admin" className="admin">
      {!set ? (
        <SetPassword
          onSet={() => {
            setSet(true)
            setOpen(true)
          }}
        />
      ) : open ? (
        <Tools onLock={() => setOpen(false)} />
      ) : (
        <>
          <Notice title="Admin only">
            <p>This page manages every nation in this browser. It needs the admin password.</p>
          </Notice>
          <Unlock onUnlock={() => setOpen(true)} />
        </>
      )}
    </Screen>
  )
}
