import type { GameState } from '@diplomat/engine'
import { render, screen } from '@testing-library/react'
import { App } from '../App.tsx'
import { memoryStore, newNationSave, storeNation, type KeyValue } from '../logic/saves.ts'
import { GameProvider } from '../store/game.tsx'
import { createGameStore, type GameStore, type Sources } from '../store/gameStore.ts'
import { SettingsProvider } from '../store/settings.tsx'
import { Announcer } from '../ui/index.ts'
import { content } from './fixtures.ts'

export function fixedSources(seed = 7): Sources {
  let ids = 0
  let ticks = 0
  return {
    id: () => `nation-${++ids}`,
    seed: () => seed,
    now: () => `2030-01-01T00:00:${String(ticks++ % 60).padStart(2, '0')}.000Z`,
  }
}

// The whole app over a plain map, with ids, seeds and the clock pinned.
export function mount(kv: KeyValue = memoryStore(), seed = 7): { kv: KeyValue; store: GameStore } {
  const store = createGameStore(kv, content, fixedSources(seed))
  render(
    <SettingsProvider kv={kv}>
      <GameProvider store={store}>
        <Announcer>
          <App />
        </Announcer>
      </GameProvider>
    </SettingsProvider>,
  )
  return { kv, store }
}

// A store holding one nation in the given state, as if it had been played to there.
export function holding(state: GameState, id = 'kept'): KeyValue {
  const kv = memoryStore()
  const problem = storeNation(kv, newNationSave(state, id, '2030-01-01T00:00:00.000Z'), content)
  if (problem) throw new Error(problem)
  return kv
}

export const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })
