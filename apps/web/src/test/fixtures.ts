import {
  agendaItems,
  availableOptions,
  decide,
  decideSituation,
  endDay,
  newNation,
  type Content,
  type GameState,
  type Identity,
} from '@diplomat/engine'
import { pack } from '../pack.ts'

export const content: Content = pack

export const identity: Identity = {
  name: 'Vesland',
  capital: 'Highmarch',
  currency: 'florin',
  demonym: 'Veslander',
  leaderTitle: 'Prime Minister',
  flag: { layout: 'cross', colours: ['#1d4e89', '#f2efe6'] },
}

export function firstAnswers(pack: Content = content): Record<string, string> {
  return Object.fromEntries(pack.founding.questions.map((q) => [q.id, q.answers[0]!.id]))
}

export function founded(seed = 7): GameState {
  return newNation(content, identity, seed, firstAnswers())
}

// Takes the first option of everything on the agenda and ends the day, the given number of times.
export function played(days: number, seed = 7): GameState {
  let state = founded(seed)
  for (let i = 0; i < days; i++) {
    const agenda = agendaItems(state, content)
    if (agenda.situation) {
      const option = availableOptions(agenda.situation.stage.options, state)[0]!
      state = decideSituation(state, content, option.id)
    }
    for (const dilemma of [agenda.major, ...agenda.minors]) {
      if (!dilemma) continue
      state = decide(state, content, dilemma.id, availableOptions(dilemma.options, state)[0]!.id)
    }
    state = endDay(state, content)
  }
  return state
}
