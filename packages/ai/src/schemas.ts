// JSON Schemas for what each task must return: TaskOutput in packages/government/src/types.ts,
// written out as data. The Anthropic back end hands the schema to the model as the input
// schema of its one tool; the CLI back end can pass it to `claude -p --json-schema`. Neither
// is a validator: the server checks every reply with validate.ts, re-derives every count code
// can work out, and clamps every effect. These schemas only steer the model to the right shape.

import { INDICATORS } from '@diplomat/engine'
import { TASKS, type Task, type TaskInput } from '@diplomat/government'

export type JsonSchema = Record<string, unknown>

const str = (description?: string): JsonSchema => (description ? { type: 'string', description } : { type: 'string' })
const int = (description?: string): JsonSchema => (description ? { type: 'integer', description } : { type: 'integer' })
const num = (description?: string): JsonSchema => (description ? { type: 'number', description } : { type: 'number' })
const bool = (description?: string): JsonSchema => (description ? { type: 'boolean', description } : { type: 'boolean' })
const arr = (items: JsonSchema, description?: string): JsonSchema =>
  description ? { type: 'array', items, description } : { type: 'array', items }
const obj = (properties: Record<string, JsonSchema>, required: string[], description?: string): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
  ...(description ? { description } : {}),
})
// A map from ids to values: party id to its split, member id to a vote, course to a share.
const map = (values: JsonSchema, description: string): JsonSchema => ({ type: 'object', additionalProperties: values, description })

const course = str('An option course id from the petition, or "dismiss".')

const division = obj(
  {
    aye: int('Ayes in the whole body.'),
    no: int('Noes in the whole body.'),
    abstain: int('Abstentions, absences and members who did not vote, in the whole body.'),
    byParty: map(
      obj({ aye: int(), no: int(), abstain: int() }, ['aye', 'no', 'abstain']),
      "By party id. Each party's aye + no + abstain equals its seats; the parties' figures add up to the whole-body totals.",
    ),
  },
  ['aye', 'no', 'abstain', 'byParty'],
  'The division on the first preference.',
)

const canon = arr(str(), 'New fixed facts this record invented that later records must not contradict, one line each.')

// The two effects a model may propose. Everything else in the engine's Effect union is the
// engine's own business. bounds.ts clamps the numbers whatever is asked for here.
const effect: JsonSchema = {
  anyOf: [
    obj({ indicator: { type: 'string', enum: [...INDICATORS] }, by: num(), why: str() }, ['indicator', 'by', 'why']),
    obj({ faction: str('A faction id given in the input.'), by: num(), why: str() }, ['faction', 'by', 'why']),
  ],
}

const legislature = obj(
  {
    debate: str('Markdown: the sitting, with named members speaking in their own voices.'),
    ladder: arr(course, 'Every course, best first, each exactly once, "dismiss" included.'),
    division,
    remonstrance: str('The full text of a remonstrance the house resolved to send, if any.'),
    address: str('The full text of an address to the executive the house resolved to send, if any.'),
    canon,
  },
  ['debate', 'ladder', 'division'],
)

const court = obj(
  {
    rulings: arr(
      obj(
        {
          course: str('An option course id from the petition. Not "dismiss".'),
          votes: map({ type: 'string', enum: ['permit', 'bar'] }, 'Every member id of the body, each with its vote.'),
          articles: arr(str(), 'Article numbers and right ids the ruling rests on.'),
          markers: arr(str(), 'Limits on a permitted option, each one sentence.'),
        },
        ['course', 'votes', 'articles', 'markers'],
      ),
      'One ruling for every option in the petition, in the petition order.',
    ),
    opinion: str('Markdown: headnote, the majority opinion with its author, concurrences, dissents, disposition.'),
    cautions: arr(str()),
    directions: arr(str()),
    canon,
  },
  ['rulings', 'opinion', 'cautions', 'directions'],
)

const press = obj({ outlet: str(), headline: str(), text: str() }, ['outlet', 'headline', 'text'])

const partialParty = obj(
  {
    id: str('The party id as given. Required: it says which party this rewords.'),
    name: str(),
    nickname: str(),
    leader: str(),
    description: str(),
    colour: str('Hex, e.g. #1f3a5f.'),
  },
  ['id'],
)
const partialMember = obj(
  { id: str('The member id as given. Required.'), name: str(), office: str(), character: str(), philosophy: str() },
  ['id'],
)

const SCHEMAS: Record<Exclude<Task, 'council.sitting'>, JsonSchema> & { 'council.sitting': JsonSchema } = {
  'legislature.sitting': legislature,
  'court.opinion': court,
  // Replaced per input by schemaFor; this union is what the task can return in general.
  'council.sitting': { anyOf: [court, legislature] },
  'electorate.referendum': obj(
    {
      results: map(num(), 'Share of the vote by course, every option and "dismiss", adding up to 100.'),
      turnout: num('Turnout as a fraction between 0 and 1.'),
      campaign: str('Markdown: the campaign and the count.'),
    },
    ['results', 'turnout', 'campaign'],
  ),
  'ministry.advice': obj(
    {
      favours: course,
      summary: str('Two or three sentences: the advice.'),
      costing: str('A costing in words, in the nation\'s currency: "about 0.3bn a year".'),
      paper: str('Markdown: the ministry paper in full, with its head and signature.'),
    },
    ['summary', 'paper'],
  ),
  'executive.decision': obj(
    {
      course,
      reasons: str('The written reasons, as the executive gives them.'),
      veto: obj({ course, reasons: str() }, ['course', 'reasons'], 'Present only when setting aside a vetoable recommendation.'),
      papers: str("Markdown: the executive's papers for this decision."),
    },
    ['course', 'reasons', 'papers'],
  ),
  'world.day': obj(
    {
      weather: str(),
      events: arr(obj({ headline: str(), text: str(), island: str() }, ['headline', 'text'])),
      reaction: str("The country's reaction to what the government actually did."),
      press: arr(press, 'One item for each outlet in the input.'),
      opinion: str(),
      poll: obj({ question: str(), results: map(num(), 'Answer to share, adding up to 100.') }, ['question', 'results']),
      matters: arr(obj({ to: str(), text: str() }, ['to', 'text']), 'Matters arising, each addressed to someone. Not answered.'),
      effects: arr(effect),
      almanac: str('Markdown: the whole day as the almanac prints it.'),
      canon,
    },
    ['weather', 'events', 'reaction', 'press', 'opinion', 'matters', 'effects', 'almanac'],
  ),
  'founding.institutions': obj(
    {
      bodies: arr(
        obj(
          {
            id: str('The body id as given. Required.'),
            name: str(),
            shortName: str(),
            description: str(),
            parties: arr(partialParty),
            members: arr(partialMember),
          },
          ['id'],
        ),
      ),
      press: arr(obj({ id: str('The outlet id as given.'), name: str(), line: str() }, ['id'])),
      canon: arr(str()),
      lore: arr(obj({ title: str(), body: str('Markdown.') }, ['title', 'body'])),
    },
    ['bodies', 'canon', 'lore'],
  ),
  'factbook.draft': obj({ title: str(), body: str('Markdown.') }, ['title', 'body']),
  'letters.draft': obj(
    {
      letters: arr(
        obj(
          { from: str(), place: str(), text: str(), urgent: bool(), draft: str("The office's draft reply.") },
          ['from', 'text', 'urgent', 'draft'],
        ),
      ),
    },
    ['letters'],
  ),
  'exchange.reply': obj(
    {
      text: str('The reply as delivered to the other party.'),
      changes: arr(
        obj(
          {
            course,
            verdict: { type: 'string', enum: ['permitted', 'barred'] },
            ladder: arr(course),
          },
          ['course'],
        ),
        'Only what the reply actually changes. Omit or leave empty when it holds to its earlier position.',
      ),
      document: str('Markdown: the full record of the sitting or conference that produced the reply.'),
    },
    ['text', 'document'],
  ),
  'bill.sitting': obj(
    {
      bills: arr(
        obj(
          {
            number: int('The bill number as given; omit for a bill introduced at this sitting.'),
            title: str(),
            moved: str('The member who moved it, by name.'),
            summary: str(),
            stage: { type: 'string', enum: ['introduced', 'committee', 'passed', 'signed', 'returned', 'failed', 'law'] },
            division: obj({ reading: str(), aye: int(), no: int(), abstain: int() }, ['reading', 'aye', 'no', 'abstain']),
            effects: arr(effect),
          },
          ['title', 'moved', 'summary', 'stage'],
        ),
      ),
      hansard: str('Markdown: the sitting.'),
    },
    ['bills', 'hansard'],
  ),
  'world.nations': obj(
    {
      choices: arr(
        obj(
          {
            nation: str('The nation id as given.'),
            move: str("One of that nation's move ids, exactly as given."),
            note: str("One to three sentences in the nation's own voice: what it says, or tells its own people, about the move."),
          },
          ['nation', 'move', 'note'],
        ),
        'One choice for every nation given, no more and no fewer.',
      ),
    },
    ['choices'],
  ),
  'nation.move': obj(
    {
      move: str('One of the move ids, exactly as given.'),
      note: str("A short paragraph in the nation's own voice: the note it sends, or what its leader says."),
    },
    ['move', 'note'],
  ),
}

export const TASK_SCHEMAS: Readonly<Record<Task, JsonSchema>> = SCHEMAS

// A council sits either as a court (it has rights and a bar threshold) or as a small house.
export function councilSitsAsCourt(input: TaskInput['council.sitting']): boolean {
  return typeof input === 'object' && input !== null && 'barVotes' in input && 'rights' in input
}

// The schema for one call. Only council.sitting depends on the input.
export function schemaFor<T extends Task>(task: T, input?: TaskInput[T]): JsonSchema {
  if (task === 'council.sitting' && input !== undefined) {
    return councilSitsAsCourt(input as TaskInput['council.sitting']) ? court : legislature
  }
  return SCHEMAS[task]
}

export function hasSchema(task: string): task is Task {
  return (TASKS as readonly string[]).includes(task)
}
