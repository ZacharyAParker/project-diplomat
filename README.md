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

Version 0.6.0: the game now has a government. See the [changelog](CHANGELOG.md) for what's in it
and what isn't.

- Found a nation, give it a flag, answer a few questions about its character, and choose its form
  of government: a commonwealth, a presidential republic, a parliamentary monarchy, a direct
  democracy, a one-party state, an absolute monarchy, a theocracy or a junta.
- Every issue is a petition. The bodies your constitution has (a legislature, a court, a council,
  the people, the ministries) sit on it first: the legislature debates and divides, the court rules
  each option permitted or barred, the ministries advise. What they decide binds you, as the rules
  of your form say.
- Govern it yourself, or found it and let an AI executive govern while you watch, stepping in with a
  Founder's Word that can overrule anything.
- The world writes a day after each of yours: weather, events, three newspapers and a broadcaster,
  public opinion, and the questions and letters it puts to you.
- Everything goes in an Archive you can read as your nation's government website: Hansard, court
  reports, the executive's papers, the almanac, bills, letters, factbooks, the constitution.
- A census of figures in the old style (population, the economy, tax, crime) worked out from the
  engine, so every number still has a reason.
- The AI is optional. With it off, rules-based stand-ins play every body and the game still works.
  With it on, it runs on a Claude API key, or on the Claude Code you have installed and signed in
  to yourself.
- Elections when your form holds them, a crisis now and then, five neighbours, treaties, issues
  that settle who the nation is, a sandbox and an admin page, as before.
- The core pack has 120 dilemmas and four crises.

Not in yet: regional projects, disputes and other players.

## Play it

Needs Node 24 or later and pnpm.

```
pnpm install
pnpm serve     # builds the game, then starts it; open the address it prints
```

After the first build, `pnpm start` is enough. The game runs a small server on your own computer
(127.0.0.1:8150, never reachable from outside it) and keeps every nation in `data/`: one folder
each, with its save and its Archive as plain Markdown files.

`pnpm dev` and `pnpm dev:server` together run it with hot reload if you're changing things.

### The AI

Off by default. Turn it on in Settings, under AI:

- **Claude API key**: the supported way. The key stays in `data/settings.json` and is never sent to
  the browser.
- **My own Claude Code**: uses the `claude` you installed and signed in to yourself, run with
  read-only access to the nation's Archive, so the Assembly and the Court read their own past
  sittings and opinions. The game never sees or stores your sign-in. See
  [docs/research/04-ai-providers.md](docs/research/04-ai-providers.md) for where this stands under
  Anthropic's terms.

### Claudetopia

`node scripts/import-claudetopia.ts --source <the Claudetopia archive>` brings the nation of
Claudetopia across from its NationStates years: its constitution and charter, Assembly, High Court
and ministries, and every petition, sitting, opinion, almanac day, Word and letter.

## Other commands

```
pnpm validate                 # check the core pack against the house rules
pnpm simulate                 # one 60-day story with random choices, in the terminal
pnpm simulate 90 42           # 90 days, seed 42
pnpm simulate 135 --runs 200  # averages across 200 seeds, for balance
pnpm test
pnpm typecheck
```

## Where things are

```
apps/web           the game: a React app, a client of the server
apps/server        the local server: runs the engine, keeps the saves and the Archive, calls the AI
packages/engine    the rules, as pure functions with no dependencies
packages/content   pack schema, loader and validator
packages/government  forms of government, the rules that bind them, the petition pipeline, stand-ins, census
packages/ai        the AI back ends and one prompt per body
packs/core         the dilemmas, factions, policies and traits
scripts            the simulator and the Claudetopia import
docs               the plan, the design notes and the research
```

- [docs/blueprint.md](docs/blueprint.md) is the plan.
- [docs/design/nation-model.md](docs/design/nation-model.md) is how a nation works.
- [docs/design/government.md](docs/design/government.md) is how its government works.
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
