# Notice: what the game does, and what the AI is

Read this before you switch the AI on.

## It runs on your computer

Project Diplomat is a game you run yourself. `pnpm start` starts a small server that listens on
`127.0.0.1:8150` and answers only to that address, and the game is the page it serves. There is
no Project Diplomat service, no account and no online world yet. Your nations, their Archives and
your settings are files in the `data/` folder of your copy, and the maintainer never sees them.

Keep the server on your own machine. It has no sign-in of its own, and it isn't built to be put on
a public address or reached through a forwarded port.

## The AI is optional

With the AI off, rules-based stand-ins play every body and nothing leaves your computer. With it
on, the game sends work to Anthropic:

- **Claude API key.** The game calls `https://api.anthropic.com` with your key. Anthropic bills
  your API account for what it uses.
- **My own Claude Code.** The game runs the `claude` command you installed and signed in to
  yourself, so Anthropic sees those calls as your own Claude Code use, on your plan's limits. Each
  body can read its own nation's Archive and nothing else. Whether a game may use a subscription
  this way is not settled in Anthropic's terms; [docs/research/04-ai-providers.md](docs/research/04-ai-providers.md)
  has what they say. Check the terms for your plan before you use it. If in doubt, use an API
  key.
- **The Director** always runs on your own Claude Code, with its own switch in Settings.

What gets sent is listed in the [privacy policy](PRIVACY.md). You need your own Anthropic account
for either, and you must follow Anthropic's terms and usage policies for it.

## What the AI writes is fiction

The parliaments, courts, ministers, newspapers, letters and the Director's advice are written by
a language model playing parts. They can be wrong, contradict the record, repeat themselves, or
say something offensive. The game checks every reply against its rules and keeps the numbers to
itself: the engine decides every figure, and a body can only do what its constitution allows. But
the words are the model's.

The countries, parties and people in the game are made up. A resemblance to a real country,
politician, party or event is the satire doing its job, or a coincidence. Nothing a body or a paper
says is the maintainer's view, and none of it is political, legal, medical or financial advice.

## The Director and the sandbox

The Director is out of character and can change your nation when you ask it to: move a figure,
skip time, call up an issue. Those cheats go in the out-of-character log with your words, mark
the nation as sandboxed, and can be undone from the log.

If you run `claude` in this repository, the Director is in your terminal with the game's tools.
That session is ordinary Claude Code: it has whatever file and command permissions you give it,
so read what it asks before you approve.

## Claudetopia and NationStates

Project Diplomat isn't affiliated with NationStates. The Claudetopia importer reads an archive you
already keep on your own computer and writes it into your `data/` folder. Keep what it imports to
yourself; see [COPYRIGHT.md](COPYRIGHT.md).

## The rest

The [terms](TERMS.md), [privacy policy](PRIVACY.md), [license](LICENSE),
[license scope](LICENSE-SCOPE.md), [copyright notice](COPYRIGHT.md),
[third-party notices](THIRD-PARTY-NOTICES.md), [security policy](SECURITY.md) and
[patch notes](CHANGELOG.md) cover everything else.

---
Project Diplomat v0.8.0 · © 2026 Zachary Parker
