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

The display name and a one-line description of each indicator live in the engine as
`INDICATOR_INFO`, so anything that draws them says the same thing.

## Identity

A name, a capital, a currency, a demonym, the leader's title ("Prime Minister", "President",
whatever the player types) and a flag. The flag is a layout name and a list of colours. The engine
stores it and never looks inside; drawing it is the interface's business.

## Founding

Before day 1 the player answers the questions in the pack's `founding.yaml`: seven in the core
pack, three or four answers each. They ask what kind of country this already is: how it began, what
it does for a living, what the last government left in the desk drawer.

Each answer moves a few indicators and faction approvals by a few points, with a reason, exactly as
a decision would. There is no right answer; the validator requires every answer to help something
and hurt something. All the answers together are written as the first timeline entry, kind
`founding`, on day 1.

Founding is there to spread nations out, not to decide the game. The validator adds up the most
extreme answer to every question and refuses a pack in which any indicator, or any faction's
approval, could start outside 25 to 75. In the core pack a starting indicator can sit around twenty
points from the default, which is enough that two nations get different first dilemmas and a
different class.

Questions can be skipped. A nation founded with no answers starts at the numbers in the table above.

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

Choosing an option that carries an opposed tag costs legitimacy: the trait's `penalty`, a few
points. A Debtor Nation that announces new spending, or a Surveillance State that suddenly champions
privacy, pays for the inconsistency. This is the main way history constrains the present. A trait
whose penalty is 0 costs nothing, and nothing is recorded.

## Class

A one-line summary of what kind of country this is today: Country in Receivership, Gated Community
With an Anthem, Sovereign Shrug. Unlike a trait it is not earned or kept and it costs nothing. It is
worked out fresh from the current numbers whenever anyone asks.

The pack's `classes.yaml` is an ordered list. Each class has a condition, and the nation is the
first one whose condition holds. The last has no condition and catches everyone else. The core pack
has sixteen, built from liberty, inequality, capacity, administration and the debt.

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

- The gap between `fiscal` and 50 is settled against the debt (a sixth of the gap, to one decimal place).
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

## Elections

A term is 45 days. At the end of day 45, 90 and so on there is an election, and support on the day
decides it.

| Support | Result |
|---|---|
| 50 or more | Re-elected. Legitimacy +6 |
| 43 to 49.9 | Returned with a reduced majority. Legitimacy +1 |
| Under 43 | Voted out |

Being voted out works like a fall: a new government number, a new cabinet, promises lapse and every
faction's approval moves halfway back to 50. Legitimacy is set to 45, not 40, because losing a vote
is a more respectable way to go. It sets the flag `election_lost`, where a fall sets
`government_fell`, so follow-up dilemmas can tell the two apart.

The timeline entry is kind `election` and its text gives the support figure. If the government
collapses on polling day the collapse stands and no election is held. The calendar does not move
after a fall: the next election is still at the next multiple of 45.

## Situations

A situation is a crisis that runs over several days alongside the normal agenda. It has a gauge from
0 to 100 (the reservoir level, in the drought), one decision per stage, and a set of outcomes picked
by where the gauge ends up. Ordinary decisions can push the gauge too: a situation lists the option
tags that bear on it.

## A day

1. The agenda is one major dilemma, up to two minor ones, and the current situation stage if there
   is one. It is fixed for the day and is the same every time you ask. `agendaItems` turns it into
   the dilemmas themselves, and `dayComplete` says whether anything is left to decide.
2. Each decision applies at once and writes a timeline entry.
3. Ending the day settles the budget (weekly), delayed effects, promises, the situation, traits,
   resignations, the government check and the election if one is due, in that order, then builds
   tomorrow's agenda.

A day can have nothing on it, when no dilemma is eligible. It can still be ended. Ending a day with
decisions still open is also allowed; they are simply not taken.

Everything is deterministic for a given seed, set of founding answers and set of choices.

## Forecasts

Before choosing, the player can see what an option will do: the immediate changes with their
reasons, any legitimacy penalty for acting against a trait, any pressure on a running situation,
which policies would change, whether a promise is being made and when it falls due, and whether
something is scheduled for later (but not what; that is the surprise).

`forecast` gets this by running the option against a scratch copy of the nation through the same
function `decide` uses, so the two cannot drift apart.

One thing differs between the two kinds of option: a decision on a dilemma puts pressure on a
running situation through its tags, and a decision at a situation stage does not. `forecastDecision`
and `forecastSituation` take ids, exactly as `decide` and `decideSituation` do, and refuse the same
things they refuse. `forecast` takes the option itself and works out which kind it is by finding it
on today's agenda. A copy of the option (one that has been through JSON, or spread into another
object) is found by its id. If a dilemma on the agenda and the waiting stage both have an option
with that id, a copy could be either, and `forecast` throws and says to use one of the other two.

## Saves

The whole game is one plain object, and `serialize` turns it into JSON. It carries a save version
(1) and the id and version of the pack it was founded from. `deserialize` refuses anything that is
not JSON, has no version, has a version it does not know, or has a part missing or malformed. The
check goes all the way down: every stored effect and condition has to be one the engine can read,
days and counts have to be whole numbers, and indicators, approvals, standings and the gauge have to
be between 0 and 100. So a save that loads will not fall over later in the day.

What it cannot check is anything that needs the pack: whether the factions, policies, dilemmas and
situations named in the save exist. A save carries the id and version of its pack, and whether to
play one from a different pack or pack version is for the caller to decide.

## Other countries

Twenty nations: the five on the border in `packs/core/neighbours.yaml`, fifteen further off in
`nations.yaml`. Each is a name, a leader, a form of government, what it is short of, what it has to
spare, a temperament, a strength and a wealth, and a **standing** with the nation from -100 to 100.
What they do between the player's days (wars, pacts, claims, the Assembly of Nations, foreign
matters) is in [world.md](world.md); what follows is how they touch the nation's own decisions.

- **Opinions.** Each neighbour notices one or two kinds of decision (option tags), whoever the
  decision was about. Velsa likes `green` and dislikes `surveillance`; Ardune likes `pro_labour`.
  A decision that carries one moves standing by 2 (at most 4 either way), with the neighbour's own
  line in the paper.
- **Resources.** Energy, food, capital, manufactured goods and workers. The pack has a rule for when
  the nation is short of each and when it has some to spare (`resources.yaml`), worked out at the
  start of every day. A dilemma can require `{ resource: energy, is: need }`.
- **Dilemmas about another country.** A dilemma with `abroad` only comes up when a neighbour fits it
  (has energy to spare, wants workers, has standing of 20 or more, has or hasn't a given treaty).
  The engine picks one that fits, and the dilemma's text, effects and later consequences all apply
  to that one.
- **Treaties.** Five kinds (`treaties.yaml`). Once signed, a treaty pays out every week until it
  runs its course or the other side walks out, which it does if standing falls below the treaty's
  limit (usually -30). A walk-out costs 2 legitimacy.

## The sandbox

A page of levers the rules keep out of reach: set any figure, any faction's approval, relations
with any neighbour, any law; put any issue on today's desk; start any crisis. Each change is
written into the record as a `sandbox` entry and sets `sandbox: true` on the nation for good,
which every page then shows. Skipping days is the one thing on the page that does not mark the
nation, because it is only ending days without deciding anything.

## Not built yet

Regional projects and offices. Conflict between nations is built for single player (see
[world.md](world.md)); between players it is still only sketched, in [disputes.md](disputes.md).
