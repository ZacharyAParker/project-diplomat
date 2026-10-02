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
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { Snapshot, Summary } from '../logic/saves.ts'
import type { GameStore, Problem } from './gameStore.ts'

// The open nation with everything a screen is likely to ask the engine about it,
// worked out once per change and not once per component.
export interface Current {
  id: string
  state: GameState
  history: Snapshot[]
  nationClass: NationClass
  support: number
  electionIn: number
  agenda: AgendaItems
  dayComplete: boolean
  forecastDecision(dilemmaId: string, optionId: string): Forecast
  forecastSituation(optionId: string): Forecast
}

type Actions = Pick<
  GameStore,
  | 'open'
  | 'close'
  | 'found'
  | 'decide'
  | 'decideSituation'
  | 'endDay'
  | 'setIdentity'
  | 'remove'
  | 'exportSave'
  | 'importSave'
  | 'dismissNotice'
>

export interface Game extends Actions {
  content: Content
  nations: Summary[]
  current: Current | null
  notice: string | null
  problem: Problem | null
  saveError: string | null
}

const GameContext = createContext<GameStore | null>(null)

export function GameProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  return <GameContext.Provider value={store}>{children}</GameContext.Provider>
}

export function useGame(): Game {
  const store = useContext(GameContext)
  if (!store) throw new Error('useGame needs a GameProvider above it')
  const model = useSyncExternalStore(store.subscribe, store.get)
  const { content } = store
  const { nation } = model

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
      forecastDecision: (dilemmaId, optionId) => forecastDecision(state, content, dilemmaId, optionId),
      forecastSituation: (optionId) => forecastSituation(state, content, optionId),
    }
  }, [nation, content])

  return useMemo(
    () => ({
      content,
      nations: model.nations,
      current,
      notice: model.notice,
      problem: model.problem,
      saveError: model.saveError,
      open: store.open,
      close: store.close,
      found: store.found,
      decide: store.decide,
      decideSituation: store.decideSituation,
      endDay: store.endDay,
      setIdentity: store.setIdentity,
      remove: store.remove,
      exportSave: store.exportSave,
      importSave: store.importSave,
      dismissNotice: store.dismissNotice,
    }),
    [store, content, model, current],
  )
}
