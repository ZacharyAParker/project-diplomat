# Writing dilemmas

A dilemma is a YAML file in `packs/core/dilemmas/`. A file can hold one dilemma or a list of them.
Run `pnpm validate` to check your work and `pnpm simulate` to see it play.

## House rules

1. **No right answer.** Every option in a major dilemma must help something and hurt something.
   The validator enforces this.
2. **Never tell the player what they think.** Advocates argue; the leader stays silent. Don't write
   "you decide that..." or give the leader an opinion.
3. **Every number has a reason.** Each effect has a `why`: one plain sentence saying what happened
   in the world to move that number. Not "living standards rise" but "Commuters are getting to work,
   which they had stopped expecting."
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

`{nation}`, `{capital}`, `{currency}`, `{demonym}`, and `{minister:finance}` (any portfolio from
`cabinet.yaml`), which becomes the title and name of whoever holds the job. A minister can be an
advocate: `advocate: { name: "{minister:finance}", role: speaking in cabinet }`.

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

## What the validator checks

Structure, unknown factions/policies/portfolios/traits, effect limits, the no-right-answer rule,
flags that are checked but never set, unknown macros, and duplicate ids.
