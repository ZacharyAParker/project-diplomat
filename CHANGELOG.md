# Changelog

## 0.6.1

The Director, and a round of fixes.

- The Director. A Claude Code session for each nation that stands outside the fiction: it runs the
  bodies for you, tells you plainly what it thinks they will do and what it thinks of your plans,
  and does the sandbox when you ask. Talk to it from the Director page in the game, or from a
  terminal with `claude` in the repo, where the same tools load over MCP.
- Cheats through the Director go in an out-of-character log, not the record. Each one quotes what
  you asked for, marks the nation as sandboxed, and can be undone from the log.
- Each body keeps its own Claude Code session, so the Assembly and the Court remember their own
  earlier sittings. A session starts fresh after an election, an amendment, a cheat or a dozen
  sittings, and the record always wins over what a body remembers.
- The bodies are sealed into their own Archive: they can read it and nothing outside it.
- Fixes: bills pass only on a division and become law by code, the world's day can no longer
  change laws, an election reseats the legislature, a Word of the Founder is only in force once
  confirmed, a reply from the Court can only lift a bar it could have lifted, and found mode can't
  be decided without a Word.
- Setting work aside (a cheat, an undo, a new session) now stops the model calls already running
  for it, instead of leaving the petition waiting on them.
- Legal papers: terms of use, a privacy policy, a notice on what the AI is, the license scope, a
  copyright notice and third-party notices, linked from the About sheet in Settings. The core
  pack is now licensed CC BY-SA 4.0; the code stays MIT. The security policy describes the local
  server and the AI, and vulnerabilities can be reported privately on GitHub.

## 0.6.0

The game gets a government, and Claudetopia comes home.

Claudetopia was a NationStates nation whose government was played by Claude agents: an Assembly
that argued and voted, a High Court that could bar what the Charter forbade, eleven ministries, the
weather, the people and their newspapers, all kept in a State Archive with its own website. This
version makes all of that part of the game, for any nation, with the engine owning the numbers
instead of NationStates.

- Forms of government. A government is bodies (a legislature with parties and members, a court of
  justices, a council, the people, the ministries) and rules saying who recommends, who may bar an
  option, when a vote binds and who decides. Eight forms to found with; a nation can change its form
  by amendment.
- Petitions. Each issue goes before the bodies before you decide it. The desk shows the debate's
  ladder, the division by party, each ruling and its split, the ministries' advice and, in words,
  what the rules leave you free to do. Barred options are barred; a binding vote must be taken; a
  veto needs written reasons.
- Two modes. Govern: you hold the executive. Found: an AI executive does, and you read the record
  and step in.
- The Founder. Above every branch, you. A Founder's Word overrules anything, word for word in the
  record; the bodies may argue back, and Silence closes a matter. Questions and letters from the
  country come to the Founder's page.
- The world's day: weather, events, the press, opinion, matters arising, and small effects on the
  figures within fixed bounds.
- The Archive and the government website: every document, searchable, with what cites what.
- A census in the old style, worked out from the indicators.
- Factbooks, written by you or drafted by the AI.
- Elections only where the form holds them, on the nation's own calendar.
- The AI layer is real: a Claude API key, or your own installed Claude Code. With it off,
  rules-based stand-ins play every body. Model output is checked: divisions must add up, rulings
  must cover every option, and the counts that decide anything are worked out again by code.
- A local server now runs the game and keeps nations on disk in `data/`. Saves from 0.5 in the
  browser are offered for moving across.
- The Claudetopia import.


## 0.5.0

- Issues that settle who the nation is: a national animal, a motto, an official faith, a new
  capital, a currency reform and a new title for the head of government. Each is a debate like
  any other, and one position always lets you write the answer yourself. The nation page shows
  what has been settled.
- A sandbox for every nation: skip days, set any figure, law or relationship, call up any issue,
  start any crisis. Anything but skipping days is written in the record and marks the nation as
  sandboxed on every page, for good.
- An admin page, locked with a password of your choosing, for looking after the browser the game
  is played in: every nation listed, export them all, delete them all, and look through the pack.
- Security: a Content Security Policy on the built page, security headers on the local server, a
  size limit on imported saves, cleaning of every name a player types, and a write-up of all of it
  in SECURITY.md.

## 0.4.0

A new look, in the style of the nation games it descends from.

- A menu down the left, a landscape strip across the top drawn from each nation's flag, Georgia
  for reading and green links and buttons.
- The desk is now Issues. Each issue reads as the issue, then the debate, with numbered positions
  and an Accept button under each. What a position will do is still shown before you accept it.
- The nation page leads with the flag, the name, its classification, three pills for civil
  liberties, the economy and public trust, and a written description of the country built from its
  numbers.
- The first morning and the front page show the biggest changes and fold the rest away.
- On a phone the menu is a bar along the top instead of along the bottom.
- The bundled fonts are gone; the page is lighter.

## 0.3.0

Neighbours.

- Five countries round about: Eskerland, Morvaine, Caravel, Velsa and Ardune. Each has a leader,
  something it is short of, something it has to spare, and a standing with you from hostile to
  close.
- They read the papers. Each notices one or two kinds of decision, whoever it was about, and
  relations move a little when you make one.
- Thirteen dilemmas about other countries: energy and grain offers when you are short, buyers when
  you have a surplus, investment when the debt is high, trade talks, state visits, spies, an
  extradition request, a polluted river, and two small embarrassments.
- Five kinds of treaty. Once signed they pay out weekly until they run their course, or until the
  other side walks out because relations have collapsed.
- The nation page has an "Abroad" section: what you are short of, what you have to spare, and where
  you stand with each neighbour.
- Saves from 0.1 and 0.2 load, and pick up the neighbours the next time a day ends.

Still to come: regional projects and offices, and disputes, which need testing on paper first.

## 0.2.0

The gaps 0.1.0 admitted to, mostly.

- Routine business: the budget, the pay round, a reshuffle, the televised address, a by-election
  and the regional summit now come round again every few weeks, so the desk no longer goes quiet
  for good once the one-off dilemmas run out.
- Follow-ups wait. A dilemma can require that a flag was set some days ago, and the existing
  follow-ups now use it. The fares row no longer arrives the morning after the railway is bought.
- Elections are more of a contest. The bar to survive one is support of 43, up from 40. Governing
  at random now loses about one election in three.
- The weekly budget settles to one decimal place, so small deficits reach the debt instead of
  rounding away.
- Saves from 0.1.0 load as they are.

Still true:

- The one-off dilemmas run out around day 80. After that it is routine business only.
- No other nations yet, so no treaties, trade or disputes.
- The AI layer is prompts only.

## 0.1.0

The first playable version. Single-player, in the browser, no server and no AI.

- Found a nation: name, flag, leader's title, and seven questions that set where it starts.
- The desk: a front page each morning, one major dilemma and up to two minor ones a day, and a
  crisis now and then. Every option shows what it will do before you choose, and every change says
  why afterwards.
- Elections every 45 days. Governments can be voted out or collapse; the nation carries on.
- A permanent record of everything that has happened.
- Saves in the browser, with export and import. Several nations side by side.
- The core pack: 85 major and 10 minor dilemmas, four crises, ten traits and sixteen classes of
  nation.
- Day and night editions.

Known gaps:

- The major dilemmas run out around day 80. After that the days are quiet.
- Follow-up dilemmas can arrive the day after the decision they follow, which is sooner than the
  text sometimes implies.
- Under random play most elections end in a reduced majority. They need to be more of a contest.
- No other nations yet, so no treaties, trade or disputes.
- The AI layer is prompts only. Nothing calls a model.
