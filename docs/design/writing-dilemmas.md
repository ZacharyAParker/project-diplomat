# Writing dilemmas

A dilemma is a YAML file in `packs/core/dilemmas/`. A file can hold one dilemma or a list of them.
Run `pnpm validate` to check your work and `pnpm simulate` to see it play.

The rest of the pack sits beside it:

| File | What it holds |
|---|---|
| `pack.yaml` | The pack's `id`, `name` and `version` |
| `factions.yaml`, `cabinet.yaml` | The factions, the portfolios and the pool of minister names |
| `policies.yaml`, `policies/*.yaml` | Policies. One root file, a folder of files, or both |
| `traits.yaml`, `traits/*.yaml` | Traits, split the same way |
| `situations/*.yaml` | Situations |
| `founding.yaml` | The questions asked before day 1 |
| `classes.yaml` | The one-line classifications |

An id may appear only once across a root file and its folder. Files in the folders can end in
`.yaml` or `.yml`.

## House rules

1. **No right answer.** Every option in a major dilemma must help something and hurt something.
   The validator enforces this.
2. **Never tell the player what they think.** Advocates argue; the leader stays silent. Don't write
   "you decide that..." or give the leader an opinion.
3. **Every number has a reason.** Each effect has a `why`: one plain sentence saying what happened
   in the world to move that number. Not "living standards rise" but "Commuters are getting to work,
   which they had stopped expecting." The player reads these before choosing as well as after, so
   a `why` on an immediate effect should make sense as a forecast. Keep the twist for `later`,
   which the player is only told exists.
4. **The result can't contradict the choice.** If the player banned something, the result line
   doesn't describe it thriving.
5. **Satire with a straight face.** The world is fictional and present-day. No real countries,
   parties, companies or people. Everyone gets mocked evenly, including whoever you agree with.
6. **Keep it short.** A description is two or three sentences. A speech is one or two.

## Shape

```yaml
- id: rail-buyout                # lowercase, dashes; never reused
  title: A headline, ideally a bad pun
  description: >-
    The situation, stated neutrally.
  tags: [transport, economy]
  kind: major                    # or minor; major is the default
  when: { flag: something }      # optional: who gets this dilemma
  priority: 0                    # higher wins when several are eligible; use 1 for follow-ups
  options:
    - id: nationalise
      advocate: { name: Petra Hallam, role: general secretary of the rail union }
      speech: "What the advocate says."
      when: { policy: rail_public, is: false }   # optional: when this option is offered
      tags: [spending, pro_labour]
      effects:
        - { indicator: debt, by: 5, why: "The buy-out was paid for with borrowing." }
        - { faction: labour, by: 8, why: "The rail union got what it has asked for since 1994." }
        - { minister: finance, by: -10, why: "The Finance Minister was overruled." }
        - { policy: rail_public, to: true }
        - { flag: rail_nationalised }
      later:
        - after: 12              # days
          when: { policy: rail_public, is: true }   # optional, checked on the day
          headline: What the paper says when it lands
          effects:
            - { indicator: living, by: 3, why: "..." }
      promise:
        id: fares-frozen
        text: Rail fares will not rise this year
        due: 30
        kept: { not: { flag: fares_raised } }
        broken:
          - { indicator: legitimacy, by: -5, why: "..." }
      headline: State takes over NorthLine
      result: One or two dry sentences about what happened next.
```

A dilemma has two to four options, and at least two must have no `when`, so nobody is ever left
with one choice.

## Conditions

Used in `when`, `kept`, and trait rules.

| Form | True when |
|---|---|
| `{ indicator: debt, gte: 70 }` | The indicator passes the test. `gt`, `gte`, `lt`, `lte` |
| `{ faction: labour, lt: 30 }` | The faction's approval passes the test |
| `{ policy: wealth_tax, is: true }` | The policy has exactly that value |
| `{ flag: rail_nationalised }` | The flag has been set |
| `{ trait: debtor_nation }` | The nation holds the trait |
| `{ day: { gte: 10 } }` | The day number passes the test |
| `{ all: [...] }`, `{ any: [...] }`, `{ not: ... }` | Combine the above |

## Limits

One effect can move a number only so far. These keep any single decision from deciding the game.

| Target | Immediate | Delayed |
|---|---|---|
| Indicator | 10 | 12 |
| Faction approval | 15 | 17 |
| Minister standing | 20 | 20 |

In practice most effects are between 2 and 6. Save anything over 8 for decisions that really are
that large.

## Text macros

`{nation}`, `{capital}`, `{currency}`, `{demonym}`, `{leader}` (the title the player chose, such as
Prime Minister; there is no macro for the leader's name because the leader has none), and
`{minister:finance}` (any portfolio from `cabinet.yaml`), which becomes the title and name of
whoever holds the job. A minister can be an advocate:
`advocate: { name: "{minister:finance}", role: speaking in cabinet }`.

## Tags

Option tags do two jobs. Traits oppose them (`debtor_nation` opposes `spending`), and situations
take pressure from them (the drought is pushed by `water_heavy` and `water_saving`). Tag an option
when it clearly is that thing. Current tags with mechanical meaning:

`spending`, `austerity`, `redistribution`, `pro_labour`, `anti_labour`, `privacy`, `surveillance`,
`green`, `polluting`, `permissive`, `paternalist`, `hawkish`, `dovish`, `growth`, `water_heavy`,
`water_saving`.

## Follow-ups

Set a flag in one dilemma, require it in another, and give the second `priority: 1` so it arrives
soon after. See `rail-buyout` and `rail-fares`.

The engine sets two flags itself: `government_fell` when a government collapses and `election_lost`
when one is voted out. Both can be used in `when`.

## Founding questions

`founding.yaml` holds six to eight questions, each with three or four answers.

```yaml
questions:
  - id: inheritance
    prompt: The last people to run the place left a note in the desk drawer. What did it say?
    answers:
      - id: balanced
        label: '"The books balance. Please do not look at the hospital roofs."'
        effects:
          - { indicator: fiscal, by: 5, why: "The country owes very little to anyone, and mentions it at every summit." }
          - { indicator: health, by: -5, why: "The hospitals have buckets in the corridors, and not for cleaning." }
          - { faction: labour, by: -4, why: "Public sector pay was frozen so long ago that the freeze has tenure." }
```

The prompt is put to someone who has just taken office, and the answers describe the country as
they found it. Write the `why` lines as standing facts, not events: nothing has happened yet. Each
one is shown on its own, so it must not lean on the line above it ("So did the Chamber" will not
do), and it should name the faction the way `factions.yaml` does.

An answer can move indicators and faction approvals and set policies. It cannot set flags, touch
ministers or schedule anything. The usual limits apply, and so does the first house rule: every
answer must help something and hurt something. On top of that, the most extreme answers to every
question added together must leave each indicator and each faction's approval between 25 and 75,
so when adding a question check what the others already do to the same numbers. Two to six points
is the normal size.

Be careful setting a policy here. If a dilemma offers to introduce that policy and does not check
whether it is already on, a nation founded with it will be offered it again.

## Classes

`classes.yaml` is an ordered list, read from the top.

```yaml
- id: receivership
  name: Country in Receivership
  description: The creditors have a desk at the Treasury now. It is the nicest desk.
  when: { indicator: debt, gte: 75 }

- id: muddle
  name: Muddle With a Mandate
  description: Nothing about {nation} is extreme enough to remark on. The government regards this as an achievement.
```

The nation is the first class whose `when` holds, so put the narrow and dramatic ones first. The
last entry has no `when` and every other entry must have one. The name is shown on its own, as a
label under the nation's name, so it does not have to follow "is a" and should not be made to.
`pnpm simulate 90 --runs 200` prints how often each class is held at the start and at the end,
and lists any that nobody reached.

## What the validator checks

Structure, unknown factions/policies/portfolios/traits, effect limits, the no-right-answer rule,
flags that are checked but never set, unknown macros, and duplicate ids (including the same policy
or trait id in two files). Also a policy set to the wrong kind of value (an on-or-off policy given
a number, or the other way round) and a comparison with no `gt`, `gte`, `lt` or `lte`, which would
always be true.

For founding: the same reference, limit and macro checks, that every answer helps something and
hurts something, duplicate question and answer ids, and that no combination of answers can start an
indicator or a faction's approval outside 25 to 75.

For classes: that the last one has no `when` and all the others do, plus references, macros and
duplicate ids.
