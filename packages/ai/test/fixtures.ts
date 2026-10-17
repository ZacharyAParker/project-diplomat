// Small hand-made inputs for the tests. Nothing here reaches a network.

import type { Brief, Body, PetitionBrief, TaskInput } from '@diplomat/government'

export const brief: Brief = {
  nation: { name: 'Testland', demonym: 'Testish', capital: 'Port Example', currency: 'marks', leaderTitle: 'Steward' },
  date: 'Tuesday 20 October 2026',
  day: 10,
  form: { id: 'commonwealth', name: 'Commonwealth', executive: 'the Steward' },
  standing: ['Liberty: high, 72'],
  canon: ['Testland is an archipelago of three islands.'],
  words: [],
  record: [],
}

export const petition: PetitionBrief = {
  number: 4,
  dilemma: 'harbour_lights',
  title: 'The Harbour Lights',
  description: 'The harbour lamps are failing.',
  kind: 'major',
  options: [
    { course: '1', number: 1, advocate: 'A harbourmaster', speech: 'Replace them all.', forecast: ['Public finances down a little'], tags: [] },
    { course: '2', number: 2, advocate: 'A candlemaker', speech: 'Candles.', forecast: ['Environment down a little'], tags: [] },
  ],
}

export const ministry: Body = {
  id: 'treasury',
  kind: 'ministry',
  name: 'The Treasury',
  shortName: 'the Treasury',
  size: 1,
  parties: [],
  members: [{ id: 'glim', name: 'Perpetua Glim', party: '', office: 'Minister', character: 'Counts everything twice.' }],
  portfolio: 'finance',
  description: 'The budget.',
}

export const court: Body = {
  id: 'court',
  kind: 'court',
  name: 'The High Court',
  shortName: 'the Court',
  size: 3,
  parties: [],
  members: [
    { id: 'a', name: 'Justice A', party: '', character: '', philosophy: 'textualist' },
    { id: 'b', name: 'Justice B', party: '', character: '', philosophy: 'pragmatist' },
    { id: 'c', name: 'Justice C', party: '', character: '', philosophy: 'liberal' },
  ],
  description: '',
}

export const adviceInput: TaskInput['ministry.advice'] = { brief, body: ministry, petition }

export const courtInput: TaskInput['court.opinion'] = {
  brief,
  body: court,
  petition,
  rights: [],
  articles: [],
  precedents: [],
  barVotes: 2,
}
