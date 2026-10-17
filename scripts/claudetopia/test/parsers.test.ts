// The Claudetopia readers, on short excerpts copied from the State Archive.
//   node --test scripts/claudetopia/test/*.test.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bbcodeToMarkdown } from '../bbcode.ts'
import { divide, findDate, readTables } from '../md.ts'
import {
  DRAFT_FIELDS,
  LETTER_FIELDS,
  parseBillsRegister,
  parseCharter,
  parseConstitution,
  parseDirections,
  parseDivisions,
  parseFieldSection,
  parseJudiciary,
  parseLegislature,
  parseOrderPaperOutcomes,
  parsePetition,
  parseQuestionQueue,
  parseQuestionsPut,
  parseVotes,
  parseWord,
} from '../parsers.ts'
import { level2Sections } from '../md.ts'

const SURNAMES = ['Wickwright', 'Halcyon', 'Marigold', 'Chandler', 'Thrift', 'Reckoning', 'Glasswright']
const PARTIES = [
  { id: 'open-hand', name: 'The Open Hand' },
  { id: 'charter-union', name: 'The Charter Union' },
  { id: 'enterprise-and-token-league', name: 'The Enterprise and Token League' },
  { id: 'keepers-fellowship', name: "The Keepers' Fellowship" },
  { id: 'safe-harbour-party', name: 'The Safe Harbour Party' },
  { id: 'human-chair-league', name: 'The Human Chair League' },
  { id: 'trust-and-tide', name: 'Trust and Tide' },
]

test('dates: an in-world date wins over a real one, and ranges take the first day', () => {
  assert.deepEqual(findDate('real date 2026-10-12; in-world Friday 23 October 2026'), { iso: '2026-10-23', kind: 'in-world' })
  assert.equal(findDate('Extraordinary First Sitting, 11–12 October 2026')?.iso, '2026-10-11')
  assert.equal(findDate('12 Oct 2026; taken 13 Oct 2026')?.iso, '2026-10-12')
  assert.equal(findDate('no date here'), null)
})

test('divide: a file at level 1 keeps its preface and ignores headings in fences', () => {
  const text = [
    '# Hansard — Proceedings of the Commonwealth Assembly',
    '',
    'The Assembly\'s own record.',
    '',
    '---',
    '',
    '# Extraordinary First Sitting',
    '',
    '```',
    '# not a sitting',
    '```',
    '',
    '# Fourth Ordinary Sitting — Petition #17',
    'body',
  ].join('\n')
  const { fileTitle, parts } = divide(text, 1)
  assert.equal(fileTitle, 'Hansard — Proceedings of the Commonwealth Assembly')
  assert.deepEqual(parts.map((p) => p.title), [null, 'Extraordinary First Sitting', 'Fourth Ordinary Sitting — Petition #17'])
  assert.equal(parts[0]!.body, "The Assembly's own record.")
  assert.match(parts[1]!.body, /# not a sitting/)
})

test('tables: rows parted from their table by a blank line are joined to it', () => {
  const text = ['| No. | Short title |', '|---|---|', '| 1 | Supply |', '| 2 | Living Donors |', '', '| 3 | Second Asking |'].join('\n')
  const [t] = readTables(text)
  assert.equal(t!.rows.length, 3)
})

test('legislature: parties, seats, leaders and members', () => {
  const text = `# The Assembly of the Commonwealth

### 3.1 The Speaker

**Tarry Aldermoss**, sixth Member for Sconce, aged 71.

### 7.1 Seats

| Party | Nickname | Seats | Colour | Side |
|---|---|---|---|---|
| The Open Hand | the Hands | 39 | Madder red | Accord |
| Trust and Tide | the Tidies | 6 | Kelp green | Accord |
| **Total** | | **45** | | |

### 7.3 The Open Hand — "the Hands" — 39 seats

- **Colour:** madder red. **Symbol:** an open palm.
- **Ideology:** social democratic and trade unionist.
- **How they talk:** in numbers and in names.

## 10. Members

### 10.2 The Open Hand

**Welcome Harrowgate** — Leader. First Member for Wick. Aged 52.
- *Background:* delivery-boat pilot at seventeen.
- *Temperament:* warm, unhurried, a bargainer.
- *Speaking style:* short sentences, a figure, a name, sit down.

**Diligence "Dil" Cooperage** — Chair, Tokens and Supply. Fourth Member for Greater Tallow.
Aged 61.
- *Temperament:* dry, exact, joyless about waste, privately very funny.

### 10.8 Trust and Tide

**Sunnifa Reedmace** — Leader; Chair, the Trust. Second Member for Glim. Aged 39.
- *Temperament:* patient.
`
  const leg = parseLegislature(text)
  assert.deepEqual(leg.problems, [])
  assert.deepEqual(leg.parties.map((p) => [p.id, p.seats, p.leader, p.nickname, p.colourName]), [
    ['open-hand', 39, 'Welcome Harrowgate', 'the Hands', 'Madder red'],
    ['trust-and-tide', 6, 'Sunnifa Reedmace', 'the Tidies', 'Kelp green'],
  ])
  assert.equal(leg.parties[0]!.description, 'social democratic and trade unionist. in numbers and in names.')
  assert.equal(leg.members.length, 3)
  assert.equal(leg.members[1]!.office, 'Chair, Tokens and Supply')
  assert.match(leg.members[0]!.character, /^warm, unhurried, a bargainer\. Speaks: short sentences/)
  assert.equal(leg.speaker, 'Tarry Aldermoss')
})

test('judiciary: a justice, the philosophy and the temperament', () => {
  const text = `## 6. The seven justices

### 6.2 Justice Corvin Halcyon

| | |
|---|---|
| Age | 58 |

**Philosophy.** Strict textualism of the Charter. Justice Halcyon held the pen for the
Charter committee.

**Temperament.** From Snuff, and proud of being difficult.
`
  const { justices, problems } = parseJudiciary(text)
  assert.equal(justices.length, 1)
  assert.equal(problems.length, 1) // not seven
  assert.deepEqual(justices[0], {
    id: 'corvin-halcyon',
    name: 'Corvin Halcyon',
    office: 'Justice',
    surname: 'Halcyon',
    philosophy: 'Strict textualism of the Charter. Justice Halcyon held the pen for the Charter committee.',
    character: 'From Snuff, and proud of being difficult.',
  })
})

test('hansard: a division by party, named from the summary; the Speaker sits with the Keepers', () => {
  const body = `*The House divided.*

| Party | Present | Aye | No | Abstain |
|---|---|---|---|---|
| Open Hand | 38 | 38 | 0 | 0 |
| Keepers' Fellowship | 20 | 19 | 0 | 1 |
| The Deputy Speaker | 1 | 1 | 0 | 0 |
| The Speaker | 1 | 1 | 0 | 0 |
| **Total** | **60** | **59** | **0** | **1** |

## Summary of the sitting

| Question | Aye | No | Abstain | Result | Reached 101 |
|---|---|---|---|---|---|
| 1. Ratify decree on #1725 (trial of Jane Garcia) | 59 | 0 | 1 | Ratified | Yes |
| 2. Counting of Lamps | 84 | 40 | 26 | Recommended | No |
`
  const { divisions, summary, problems } = parseDivisions(body, PARTIES, { 'deputy speaker': 'open-hand' })
  assert.equal(divisions.length, 1)
  assert.equal(divisions[0]!.question, '1. Ratify decree on #1725 (trial of Jane Garcia)')
  assert.deepEqual(divisions[0]!.byParty, { 'open-hand': { aye: 39, no: 0, abstain: 0 }, 'keepers-fellowship': { aye: 20, no: 0, abstain: 1 } })
  assert.equal(divisions[0]!.reached, 'Yes')
  assert.equal(summary.length, 2)
  assert.equal(problems.length, 1) // the Counting of Lamps has no table here
})

test('court: the table of votes, in both of its forms', () => {
  const a = `## Table of votes

| Question | Result | Majority | Dissenting |
|---|---|---|---|
| Option 1 — repeal | Permitted, 6–1 | Wickwright, Halcyon, Chandler, Thrift, Reckoning, Glasswright | Marigold |
| #1725 opt. 1 | Barred, 7–0 | All (C5 ground: Halcyon, Reckoning, Glasswright, Marigold) | — |
`
  const ra = parseVotes(a, SURNAMES)
  assert.deepEqual(ra.problems, [])
  assert.equal(ra.rows[0]!.votes['Marigold'], 'dissent')
  assert.equal(Object.values(ra.rows[1]!.votes).filter((v) => v === 'majority').length, 7)
  const b = `## Table of votes

| Petition | Option | Result | To bar | To permit |
|---|---|---|---|---|
| P-1220 | 1 — force galleries | Barred, 5–2 | Wickwright, Halcyon, Reckoning, Glasswright, Marigold | Chandler, Thrift |
`
  const rb = parseVotes(b, SURNAMES)
  assert.equal(rb.rows[0]!.question, 'P-1220, option 1 — force galleries')
  assert.equal(rb.rows[0]!.votes['Chandler'], 'permit')
  assert.equal(rb.rows[0]!.votes['Halcyon'], 'bar')
  assert.equal(rb.rows[0]!.reconciled, true)
})

// Found in review: "7–0 (direction 1: 6–1)" was read as 6–1 on the whole, because the
// dissent column names who dissented on one direction only.
test('court: a split within a split is read whole, not from the dissent column', () => {
  const table = `## Table of votes

| Question | Result | Majority | Dissenting |
|---|---|---|---|
| Directions to the Steward | 7–0 (direction 1: 6–1) | Wickwright, Halcyon, Thrift, Reckoning, Glasswright, Marigold | Chandler (direction 1 only) |
| A mixed one | 5–2 (part 2: 4–3) | Wickwright, Halcyon, Thrift, Reckoning, Glasswright | Chandler, Marigold |
`
  const r = parseVotes(table, SURNAMES)
  assert.deepEqual(r.rows[0]!.split, [7, 0])
  assert.equal(Object.values(r.rows[0]!.votes).filter((v) => v === 'majority').length, 7)
  assert.equal(r.rows[0]!.votes['Chandler'], 'majority')
  assert.deepEqual(r.rows[1]!.votes, {})
  assert.equal(r.problems.length, 1)
})

test('petitions: number, options, the Assembly, the Court and the decision', () => {
  const text = `# Petition #17 — Corporations Demand Political Say

- **Received:** real date 2026-10-11; in-world Friday 16 October 2026

## The options (verbatim)

**Option 1.** “This is supposed to be a democratic country,”

**Option 2.** “You say political freedom, I hear vote-buying,”

**Option 3.** “Frankly, I don’t see why we need to have elections at all,”

**Dismiss.**

## The Assembly's recommendation

- **First preference: Option 2.** Counting of Lamps 84 Aye, 40 No, 26 low. It does not
  reach 101.

## The High Court's opinion

- **Option 1: Permitted, 6–1** (Marigold J. dissenting).
- **Option 3: Barred, 7–0** (C6, which cannot be limited; Articles 2, 13, 68).

## The Steward's decision

**Option 2, on the Court's stated reading.** Thursday 22 October 2026.
`
  const p = parsePetition(text)
  assert.deepEqual(p.problems, [])
  assert.equal(p.number, 17)
  assert.equal(p.received, '2026-10-16')
  assert.equal(p.options, 3)
  assert.deepEqual(p.decision, { course: '2', date: '2026-10-22', decree: false })
  assert.deepEqual(p.assembly, { firstPreference: '2', aye: 84, no: 40, low: 26 })
  assert.deepEqual(p.rulings, [
    { course: '1', verdict: 'permitted', split: [6, 1] },
    { course: '3', verdict: 'barred', split: [7, 0] },
  ])
  const dismissed = parsePetition('# Petition #27 — Cash for Colons?\n\n## The Steward\'s decision\n\n**Dismissed.** 12 October 2026.\n')
  assert.deepEqual(dismissed.decision, { course: 'dismiss', date: '2026-10-12', decree: false })
})

test("Founder's Words: the quoted words, and Words given the same day", () => {
  const body = `**Given:** real date 2026-10-11; in-world Thursday 15 October 2026 (YL 140).

**The Founder's words:**

> "the founder has the ability to overrule any choice made by any branch...think of me
> like the pope"

**Effect:** Article 0 entered in the Constitution.

**Overrules:** nothing yet. This Word establishes the power; it has not been used on any
decision.

**Word No. 2, given the same day:** "call me Aegis in the lore and documents." The Founder
is named Aegis from this day.
`
  const w = parseWord("Word No. 1 — The Founder's Prerogative", body)!
  assert.equal(w.number, 1)
  assert.equal(w.given, '2026-10-15')
  assert.equal(w.text, '"the founder has the ability to overrule any choice made by any branch...think of me\nlike the pope"')
  assert.deepEqual(w.inner, [{ number: 2, text: 'call me Aegis in the lore and documents.' }])
  assert.equal(w.silence, false)
  assert.equal(parseWord('Received 20 October 2026 — not yet answered', body), null)
  const later = parseWord('Word No. 10 — Instructions', '**Given and entered:** Wednesday 21 October 2026 (YL 140); real date 2026-10-12.\n')!
  assert.equal(later.given, '2026-10-21')
})

test('questions: the queue, and the questions put with their choices', () => {
  const queue = `# Questions for Aegis

## Q-0003

- From: The Steward's office, out-of-character review
- Kind: review
- Asked: Wednesday 21 October 2026
- Status: answered — Word No. 13, answer 1: "not unless two thirds ask"
- Source: records/founders-words.md, Word No. 9

> You said "never", then said "If the assembly asks me to with a 2/3 of a vote, I will consider it."

## Q-0004

- From: nobody
`
  const { questions, malformed } = parseQuestionQueue(queue)
  assert.equal(questions.length, 1)
  assert.equal(questions[0]!.answered, true)
  assert.equal(questions[0]!.answeredWhere, 'Word No. 13, answer 1: "not unless two thirds ask"')
  assert.equal(malformed.length, 1)
  const put = parseQuestionsPut(`**Put (the *Sun*):** will the Founder's Word ever be used against the Ledger Clause?

| Offered | Described as |
|---|---|
| Never | A flat promise |

**Chosen:** "Not unless the people ask"
`)
  assert.deepEqual(put, [{ put: "(the Sun) will the Founder's Word ever be used against the Ledger Clause?", chosen: '"Not unless the people ask"' }])
})

test('letters and drafts: fields, the letter itself, and "No draft."', () => {
  const [s] = level2Sections(`## L-0001

- From: Unsigned
- Place: Low Saying, Greater Tallow
- Dated: Thursday 15 October 2026
- Came by: Sack 1
- About: Thanks for the lamp; asks nothing

> To Whoever Lit It.
>
> You need not answer.
`)
  const L = parseFieldSection(s!.heading, s!.lines, LETTER_FIELDS)!
  assert.equal(L.number, 'L-0001')
  assert.equal(L.fields['came by'], 'Sack 1')
  assert.equal(L.text, 'To Whoever Lit It.\n\nYou need not answer.')
  const [d] = level2Sections(`## L-0001

- To: Unsigned
- Recommendation: No reply recommended
- Note: She asks for nothing.
- Referral: None
- Urgent: No

No draft.
`)
  const D = parseFieldSection(d!.heading, d!.lines, DRAFT_FIELDS)!
  assert.equal(D.noDraft, true)
  assert.equal(D.fields['urgent'], 'No')
  assert.equal(D.text, '')
})

test('bills: the register and the newer order paper', () => {
  const register = `| No. | Short title | Mover | Presented | Stage | Final vote | Outcome |
|---|---|---|---|---|---|---|
| 2 | Living Donors (No Purchase) Bill | Mercy Fallowfield (Keepers) | 13 Oct 2026 | Dry Reading passed 111–22–17 on 13 Oct 2026; referred to the Hearth | — | Pending. In joint committee |
| 9 | Gambling Duty (Rates) Bill | The Treasury | 3 Nov 2026 | Dry Reading passed 105–30–16 on 3 Nov 2026 (151 present) | **104–32–13** (149 present) | **Passed, 5 Nov 2026**, the appointed day being Tuesday 1 December 2026. Exceeds 101; no signature required as the Assembly reads Article 17 |
`
  const { bills, problems } = parseBillsRegister(register)
  assert.deepEqual(problems, [])
  assert.deepEqual(bills.map((b) => [b.number, b.stage]), [[2, 'committee'], [9, 'law']])
  assert.deepEqual(bills[1]!.divisions, [
    { reading: 'Dry Reading', aye: 105, no: 30, abstain: 16, iso: '2026-11-03' },
    { reading: 'Final question', aye: 104, no: 32, abstain: 13, iso: '2026-11-05' },
  ])
  const overlay = parseOrderPaperOutcomes(`**Passed and off the paper:** Bill No. 1 (13 October, 129–9–12); Bills No. 11, No. 12 and No. 13 (10
November); Bill No. 15, Dealers'
Relief (12 November, 94–40–15; under 101, signed by the Steward the same evening). **Refused a first reading:** Bill No. 16
(11 November, 29–109). **Petitions:** none is before the House.
`)
  assert.deepEqual(overlay.map((o) => [o.number, o.stage, o.iso]), [
    [1, 'law', '2026-10-13'], [11, 'law', '2026-11-10'], [12, 'law', '2026-11-10'], [13, 'law', '2026-11-10'], [15, 'law', '2026-11-12'], [16, 'failed', '2026-11-11'],
  ])
  assert.equal(overlay.find((o) => o.number === 15)!.title, "Dealers' Relief")
})

test('directions: who gave them and whether they are owed', () => {
  const text = `# Standing Directions to the Steward

## From the Founder (Constitution, Article 59)

| Date | Direction |
|---|---|
| 2026-10-11 | Run the nation on the Steward's best judgment and keep government-grade records. |

## From the Assembly — Extraordinary First Sitting, 11–12 October 2026

| Resolution | Vote | Content | Status |
|---|---|---|---|
| Tidewell motion | 118–12–17 | Within five sitting days, propose in Supply the restoration of constabulary budgets. | **Owed** |
`
  const ds = parseDirections(text)
  assert.deepEqual(ds.map((d) => [d.from, d.iso, d.done]), [
    ['The Founder', '2026-10-11', true],
    ['The Commonwealth Assembly', '2026-10-11', false],
  ])
  assert.match(ds[1]!.text, /^Tidewell motion: Within five/)
})

test('the constitution and the charter, verbatim', () => {
  const con = `# The Constitution of the Commonwealth of Claudetopia

## Preamble

We came here by the wrong islands first.

## The Founder's Word

**Article 0. The Founder's Word.**

1. The Founder may overrule any office.

## Part I — The Commonwealth

**Article 1. Name.** The state is the Commonwealth of Claudetopia. The name may be changed
by a two-thirds vote of the Assembly.

**Article 2. Sovereignty.** All public power comes from the people.

---
`
  const arts = parseConstitution(con)
  assert.deepEqual(arts.map((a) => a.number), ['Preamble', '0', '1', '2'])
  assert.equal(arts[2]!.text, 'The state is the Commonwealth of Claudetopia. The name may be changed\nby a two-thirds vote of the Assembly.')
  assert.equal(arts[1]!.text, '1. The Founder may overrule any office.')
  const rights = parseCharter(`# The Charter of Rights

## Article C2 — Conscience and belief *(non-derogable)*

1. Every person is free to believe, to doubt, to change belief and to have none.

## Article C3 — Speech, press and expression

1. Every person may hold, express, publish and receive opinions.
`)
  assert.deepEqual(rights.map((r) => [r.id, r.title, r.absolute]), [['C2', 'Conscience and belief', true], ['C3', 'Speech, press and expression', false]])
})

test('factbooks: BBCode to Markdown', () => {
  const md = bbcodeToMarkdown(`[size=200][b]The Commonwealth of Claudetopia[/b][/size]

[i]"Think Carefully, Act Kindly"[/i]

[hr]

[table][tr][td][b]Full name[/b][/td][td]The Commonwealth of Claudetopia[/td][/tr][tr][td]Capital[/td][td]Owlsreach[/td][/tr][/table]

[list=1][*]One [b]bold[/b] thing[*]Another[/list]`)
  assert.match(md, /^# The Commonwealth of Claudetopia\n/)
  assert.match(md, /\*"Think Carefully, Act Kindly"\*/)
  assert.match(md, /\| \*\*Full name\*\* \| The Commonwealth of Claudetopia \|\n\| --- \| --- \|\n\| Capital \| Owlsreach \|/)
  assert.match(md, /1\. One \*\*bold\*\* thing\n2\. Another/)
  assert.doesNotMatch(md, /\[\/?(b|i|size|table|tr|td|list|hr)\b/)
})
