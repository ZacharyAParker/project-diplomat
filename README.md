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

Planning. There's no game here yet, just the design and the research behind it.

- [docs/blueprint.md](docs/blueprint.md) is the plan: what I'm building, how it works, what order.
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

Too early for code contributions, but if you've played NationStates and have opinions about what a
successor should do, I'd like to hear them. Open an issue.

## Licence

MIT. See [LICENSE](LICENSE).

Not affiliated with NationStates or Max Barry.
