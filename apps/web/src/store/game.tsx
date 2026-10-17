import {
  agendaItems,
  classify,
  dayComplete,
  daysUntilElection,
  forecastDecision,
  forecastSituation,
  support,
  type AgendaItems,
  type Content,
  type Forecast,
  type GameState,
  type NationClass,
} from '@diplomat/engine'
import type { CensusFigure, GovernmentState, Mode } from '@diplomat/government'
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { Snapshot } from '../logic/saves.ts'
import type { GameModel, GameStore } from './gameStore.ts'

// The open nation with everything a screen is likely to ask the engine about it,
// worked out once per change and not once per component.
export interface Current {
  id: string
  state: GameState
  history: Snapshot[]
  nationClass: NationClass
  support: number
  // Null for a nation that holds no elections.
  electionIn: number | null
  agenda: AgendaItems
  dayComplete: boolean
  // The government above the engine, as the server last sent it. Null only for a server
  // that sent none, which the screens treat as a nation with no bodies.
  government: GovernmentState | null
  census: CensusFigure[]
  mode: Mode
  forecastDecision(dilemmaId: string, optionId: string): Forecast
  forecastSituation(optionId: string): Forecast
}

type Actions = Omit<GameStore, 'get' | 'subscribe' | 'content'>

export interface Game extends Actions, Omit<GameModel, 'nation' | 'government' | 'census'> {
  content: Content
  current: Current | null
}

const GameContext = createContext<GameStore | null>(null)

export function GameProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  useEffect(() => {
    void store.start()
  }, [store])
  return <GameContext.Provider value={store}>{children}</GameContext.Provider>
}

export function useStore(): GameStore {
  const store = useContext(GameContext)
  if (!store) throw new Error('useGame needs a GameProvider above it')
  return store
}

export function useGame(): Game {
  const store = useStore()
  const model = useSyncExternalStore(store.subscribe, store.get)
  const { content } = store
  const { nation, government, census } = model

  const current = useMemo<Current | null>(() => {
    if (!nation) return null
    const { state } = nation
    return {
      id: nation.id,
      state,
      history: nation.history,
      nationClass: classify(state, content),
      support: support(state),
      electionIn: daysUntilElection(state),
      agenda: agendaItems(state, content),
      dayComplete: dayComplete(state),
      government,
      census,
      mode: government?.mode ?? 'govern',
      forecastDecision: (dilemmaId, optionId) => forecastDecision(state, content, dilemmaId, optionId),
      forecastSituation: (optionId) => forecastSituation(state, content, optionId),
    }
  }, [nation, government, census, content])

  return useMemo(() => {
    const { nation: _n, government: _g, census: _c, ...rest } = model
    const { get: _get, subscribe: _sub, content: _content, ...actions } = store
    return { ...actions, ...rest, content, current }
  }, [store, content, model, current])
}
