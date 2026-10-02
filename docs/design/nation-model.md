# The nation model

What a nation is made of, and the rules that move it. This is the version the engine in
`packages/engine` implements today. Numbers here are first guesses and will change with playtesting.

## Indicators

Twelve numbers from 0 to 100. These are what the simulation runs on. For ten of them higher is
better; for debt and inequality, higher is worse.

| Id | What it means | Starts at |
|---|---|---|
| `fiscal` | This year's books. 50 is balanced, below is deficit, above is surplus | 48 |
| `debt` | What the country owes. Higher is worse | 45 |
| `capacity` | How much the economy can produce: industry, infrastructure, investment | 50 |
| `employment` | How many people have work | 52 |
| `living` | Day-to-day standard of living: prices, housing, services that function | 50 |
| `inequality` | The gap between top and bottom. Higher is worse | 50 |
| `health` | How well and how long people live | 50 |
| `education` | Schools, universities, skills | 50 |
| `environment` | Air, water, land, emissions | 48 |
| `liberty` | Civil liberties: privacy, protest, press | 55 |
| `legitimacy` | Whether people accept that the government has the right to govern | 55 |
| `administration` | Whether the state can actually do things: capable ministries, short queues | 50 |

Every change to an indicator carries a one-line reason, and the reason is stored with the change.
There are no hidden effects.

## Factions

Eight groups. Each has a **clout** (its share of political weight; they add up to 100) and an
**approval** of the government from 0 to 100, starting at 50.

| Id | Name | Clout |
|---|---|---|
| `labour` | The Unions | 16 |
| `business` | The Chamber | 18 |
| `rural` | The Shires | 10 |
| `faithful` | The Congregations | 8 |
| `services` | The Services | 10 |
| `mandarins` | The Mandarins | 8 |
| `youth` | The Young | 12 |
| `grey` | The Grey Vote | 18 |

**Support** is approval averaged by clout. It's the single number for "how is the government
doing".

Factions belong to the content pack, not the engine, so a different pack can have different ones.

## Policies

Named laws that are either on or off, or set to a number (the pension age). They are explicit
records, not something inferred from the indicators. Dilemmas and options can require a policy to be
in a particular state, which is how a nation's past changes what it's asked next.

## Traits

Labels a nation earns from what it has done: Surveillance State, Debtor Nation, Green Pioneer. Each
has a condition for earning it, sometimes a condition for losing it, and a list of option tags it
**opposes**.

Choosing an option that carries an opposed tag costs legitimacy. A Debtor Nation that announces new
spending, or a Surveillance State that suddenly champions privacy, pays for the inconsistency. This
is the main way history constrains the present.

## Cabinet

Seven ministers, each with a name and a **standing** from 0 to 100, starting at 50. Decisions can
raise or lower a minister's standing, usually because their advice was taken or ignored. A minister
whose standing falls to 10 resigns, which costs a little legitimacy, and a replacement is appointed.

## Flags, delayed effects and promises

- **Flags** are markers a decision leaves behind (`rail_nationalised`). Later dilemmas can require
  them. This is how follow-ups work.
- **Delayed effects** are scheduled when a decision is made and land a set number of days later,
  with their own headline. They can carry a condition, checked on the day.
- **Promises** are public commitments with a deadline. If the condition holds on the day, the
  government gains a little legitimacy. If not, the promise's stated penalty applies.

## The budget

Once every seven days:

- The gap between `fiscal` and 50 is settled against the debt (a sixth of the gap, rounded).
- `fiscal` moves 30% of the way back to 50, because most costs and windfalls are one-offs.
- If debt is at 80 or more, interest costs take 1 off living standards and 2 off legitimacy.

So spending shows up as debt a week or two later, and debt past 80 starts a slow bleed.

## When the government falls

At the end of any day, if legitimacy is 10 or lower, or support is under 20, the government falls.

- Legitimacy resets to 40.
- Every faction's approval moves halfway back to 50.
- Outstanding promises lapse and a new cabinet is appointed.
- Policies, traits, debt and everything else stay exactly as they were.

The nation continues under a new administration that inherits all of it. Nothing is deleted.

## Situations

A situation is a crisis that runs over several days alongside the normal agenda. It has a gauge from
0 to 100 (the reservoir level, in the drought), one decision per stage, and a set of outcomes picked
by where the gauge ends up. Ordinary decisions can push the gauge too: a situation lists the option
tags that bear on it.

## A day

1. The agenda is one major dilemma, up to two minor ones, and the current situation stage if there
   is one. It is fixed for the day and is the same every time you ask.
2. Each decision applies at once and writes a timeline entry.
3. Ending the day settles the budget (weekly), delayed effects, promises, the situation, traits,
   resignations and the government check, in that order, then builds tomorrow's agenda.

Everything is deterministic for a given seed and set of choices.

## Not built yet

Founding questionnaire, other nations, treaties, dependencies, regional projects, disputes, the
census of comic rankings. Disputes are sketched in [disputes.md](disputes.md).
