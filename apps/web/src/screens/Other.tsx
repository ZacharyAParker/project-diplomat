import { useState } from 'react'
import { download } from '../store/browser.ts'
import { useGame } from '../store/game.tsx'
import type { Problem } from '../store/gameStore.ts'
import { go } from '../store/route.ts'
import { Button, Dialog, LinkTo, Notice, Screen } from '../ui/index.ts'

export function Lost() {
  return (
    <Screen title="No such page" kicker="Wrong address">
      <div className="stack measure">
        <p>Nothing lives at this address. It may have been mistyped, or it may never have existed.</p>
        <p>
          <LinkTo to={{ name: 'home' }} look="primary">
            Back to the nations
          </LinkTo>
        </p>
      </div>
    </Screen>
  )
}

// A save that will not open is never thrown away for the player. They are told what is
// wrong with it, can take the raw text away as a file, and remove it only by asking.
export function Unreadable({ problem }: { problem: Problem }) {
  const game = useGame()
  const [asking, setAsking] = useState(false)
  const stored = problem.raw !== ''

  function exportRaw() {
    const file = game.exportSave(problem.id)
    if (file) download(file.filename, file.text)
  }

  function remove() {
    game.remove(problem.id)
    go({ name: 'home' })
  }

  return (
    <Screen title="This nation cannot be opened" kicker="A problem with the save">
      <div className="stack measure">
        <Notice tone="problem" title="What is wrong">
          <p>{problem.message}</p>
        </Notice>
        {stored && (
          <p>
            Nothing has been changed or deleted. The save is still stored in this browser exactly as it was
            found, and you can take a copy of it away.
          </p>
        )}
        <div className="row">
          <LinkTo to={{ name: 'home' }} look="primary">
            Back to the nations
          </LinkTo>
          {stored && (
            <Button look="secondary" onClick={exportRaw}>
              Export the raw save
            </Button>
          )}
          {stored && (
            <Button look="danger" onClick={() => setAsking(true)}>
              Remove it
            </Button>
          )}
        </div>
      </div>
      <Dialog
        open={asking}
        title="Remove this save?"
        onClose={() => setAsking(false)}
        actions={
          <>
            <Button look="secondary" onClick={() => setAsking(false)}>
              Keep it
            </Button>
            <Button look="danger" onClick={remove}>
              Remove it for good
            </Button>
          </>
        }
      >
        <p>
          It cannot be opened as it is, and once removed it cannot be brought back. Export it first if in
          doubt.
        </p>
      </Dialog>
    </Screen>
  )
}
