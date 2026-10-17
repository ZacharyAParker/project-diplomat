import type { DocketStatus, FormId, Mode, Series } from '@diplomat/government'

// What the screens say about each form of government. The bodies and rules themselves are
// built by the server (packages/government/forms.ts); this is only the names and one line
// each, for the founding and the nation page.
export interface FormInfo {
  id: Exclude<FormId, 'custom'>
  name: string
  line: string
  executive: string
}

export const FORMS: readonly FormInfo[] = [
  {
    id: 'commonwealth',
    name: 'Commonwealth',
    line: 'An Assembly recommends, a High Court may bar, and a Steward decides within what they leave open.',
    executive: 'The Steward',
  },
  {
    id: 'presidential',
    name: 'Presidential republic',
    line: 'A Congress recommends, a Supreme Court may bar, and a President decides and may veto with reasons.',
    executive: 'The President',
  },
  {
    id: 'parliamentary-monarchy',
    name: 'Parliamentary monarchy',
    line: 'Parliament decides by majority, the courts may bar, and the Crown signs what it is given.',
    executive: 'The Prime Minister',
  },
  {
    id: 'direct-democracy',
    name: 'Direct democracy',
    line: 'The people vote on every petition. A Federal Council advises and a court may bar.',
    executive: 'The President of the Federal Council',
  },
  {
    id: 'one-party',
    name: 'One-party state',
    line: 'The Party Congress recommends, the Politburo advises, and the courts may only advise.',
    executive: 'The General Secretary',
  },
  {
    id: 'absolute-monarchy',
    name: 'Absolute monarchy',
    line: 'The Monarch decides. A Privy Council advises, and nobody may bar anything.',
    executive: 'The Monarch',
  },
  {
    id: 'theocracy',
    name: 'Theocracy',
    line: 'A Council of Elders may bar on doctrine, a Majlis recommends, and a Supreme Leader decides.',
    executive: 'The Supreme Leader',
  },
  {
    id: 'junta',
    name: 'Military junta',
    line: 'The Council of Officers votes, and the Chairman decides. Nothing else binds.',
    executive: 'The Chairman',
  },
]

export function formName(id: FormId | string): string {
  if (id === 'custom') return 'A constitution of its own'
  return FORMS.find((f) => f.id === id)?.name ?? id
}

export interface ModeInfo {
  id: Mode
  name: string
  line: string
}

export const MODES: readonly ModeInfo[] = [
  {
    id: 'govern',
    name: 'Govern',
    line: 'You hold the executive office. You decide each petition yourself, within what the bodies allow.',
  },
  {
    id: 'found',
    name: 'Found',
    line: 'The executive decides on its own. You read the record, answer what is put to you, and step in by Word.',
  },
]

export const modeName = (mode: Mode) => MODES.find((m) => m.id === mode)?.name ?? mode

export const DEFAULT_FOUNDER = { name: 'the Founder', title: 'Founder' }

export const SERIES_NAMES: Record<Series, string> = {
  petition: 'Petitions',
  hansard: 'Hansard',
  court: 'Court reports',
  advice: 'Ministry papers',
  papers: 'The executive’s papers',
  words: 'The Founder’s Words',
  almanac: 'The almanac',
  bills: 'Bills',
  letters: 'Letters',
  questions: 'Questions',
  factbook: 'Factbooks',
  law: 'Law',
  lore: 'Lore',
  hearing: 'Hearings',
  world: 'Abroad',
  other: 'Other papers',
}

export const SERIES_LIST = Object.keys(SERIES_NAMES) as Series[]

export const STATUS_WORDS: Record<DocketStatus, string> = {
  waiting: 'Waiting to be sent',
  sitting: 'The bodies are sitting',
  reconciling: 'Sitting again among what is permitted',
  exchanging: 'The bodies are answering each other',
  ready: 'Ready for a decision',
  deciding: 'The executive is deciding',
  decided: 'Decided',
  failed: 'Could not be heard',
}

// A docket still being worked on, which the desk keeps asking about.
export const ACTIVE: readonly DocketStatus[] = ['sitting', 'reconciling', 'exchanging', 'deciding']

export const isActive = (status: DocketStatus) => ACTIVE.includes(status)
