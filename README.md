# Project Diplomat

A nation game. You get a policy dilemma, you pick a side, and your country changes because of it.
Then your neighbours react, a minister resigns, and three weeks later the thing you did about the
railways comes back to bite you.

It's a spiritual successor to [NationStates](https://www.nationstates.net), which I've always liked
and always wished went further. Same heart (satirical dilemmas, no right answers, no way to "win"),
with the parts I wanted added:

- **Consequences that add up, and that you can see.** Every number that moves tells you why.
- **Other nations that matter.** Treaties, trade, regional projects and disputes are in the rules.
- **A history.** Your nation keeps a timeline and a newspaper, so there's a story to look back on.

Set in a fictional present day. "Project Diplomat" is a codename until I settle on a name.

## Status

Early. There's a working rules engine and a first pack of dilemmas, and no interface yet. You can
watch a nation play itself in the terminal.

What exists:

- The engine: indicators, factions, policies, traits, a cabinet, promises, delayed consequences,
  a weekly budget, governments that fall, and multi-day situations.
- A core pack: 33 dilemmas and one situation (a drought), plus a validator that enforces the
  house rules.
- Prompts for the optional AI layer. No provider code yet.

What doesn't: a playable interface, other nations, treaties, disputes, saving.

## Try it

Needs Node 24 or later and pnpm.

```
pnpm install
pnpm validate          # check the core pack
pnpm simulate          # one 60-day story with random choices
pnpm simulate 90 42    # 90 days, seed 42
pnpm simulate 60 --runs 200   # averages across 200 seeds, for balance
pnpm test
```

## Where things are

```
packages/engine    the rules, as pure functions with no dependencies
packages/content   pack schema, loader and validator
packages/ai        prompts for the optional AI layer
packs/core         the dilemmas, factions, policies and traits
scripts            the simulator
docs               the plan, the design notes and the research
```

- [docs/blueprint.md](docs/blueprint.md) is the plan.
- [docs/design/nation-model.md](docs/design/nation-model.md) is how a nation works.
- [docs/design/writing-dilemmas.md](docs/design/writing-dilemmas.md) is how to write a dilemma.
- [docs/design/disputes.md](docs/design/disputes.md) is the unbuilt conflict system, on paper.
- [docs/research/](docs/research/) is the reading I did first, including a full teardown of how
  NationStates works and a look at why NationStates 2 failed.

## The short version of the plan

- Single-player first. You run it on your own machine and play in the browser, against a region of
  scripted nations. Private group worlds and a public world come later on the same engine.
- The simulation is plain deterministic rules. AI is optional: if you connect a provider it writes
  news, flavour and NPC diplomacy, and helps authors draft dilemmas. It never decides outcomes, and
  the game works fine with it off.
- Dilemmas are data files in packs, so other people can write them.
- No pay-to-win, ever. Nobody can destroy your nation.

## Contributing

Dilemmas are the easiest way in. Read [writing-dilemmas.md](docs/design/writing-dilemmas.md), add a
file under `packs/core/dilemmas/`, and run `pnpm validate`. If you've played NationStates and have
opinions about what a successor should do, open an issue.

## Licence

MIT. See [LICENSE](LICENSE).

Not affiliated with NationStates or Max Barry.
