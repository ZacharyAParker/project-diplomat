import { render, screen } from '@testing-library/react'
import { App } from '../App.tsx'
import { memoryStore, type KeyValue } from '../logic/saves.ts'
import { GameProvider } from '../store/game.tsx'
import { createGameStore, type GameStore } from '../store/gameStore.ts'
import { SettingsProvider } from '../store/settings.tsx'
import { Announcer } from '../ui/index.ts'
import { FakeServer } from './fakeServer.ts'
import { content } from './fixtures.ts'

export { holding } from './fakeServer.ts'

export interface Mounted {
  fake: FakeServer
  store: GameStore
  kv: KeyValue
}

// The whole app over an in-memory server and a plain map for the browser's storage. The
// desk polls every 20 ms instead of every two seconds, so a test can watch a docket sit.
export function mount(fake: FakeServer = new FakeServer(), kv: KeyValue = memoryStore()): Mounted {
  const store = createGameStore(fake, content, { kv, pollMs: 20, directorPollMs: 20 })
  render(
    <SettingsProvider kv={kv}>
      <GameProvider store={store}>
        <Announcer>
          <App />
        </Announcer>
      </GameProvider>
    </SettingsProvider>,
  )
  return { fake, store, kv }
}

export const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })
