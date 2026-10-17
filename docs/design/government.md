# Government: bodies, petitions, the record, and the AI that plays them

Version 0.6.0 merges Claudetopia into Project Diplomat. Claudetopia was a NationStates nation
whose government was played by Claude agents: an Assembly that debated and voted, a High Court
that ruled each option permitted or barred, eleven ministries, the world and its press, and a
government website over the record they kept. Here that becomes part of the game, for any nation
and any form of government, with the engine (not NationStates) owning the numbers.

The contract types are in `packages/government/src/types.ts`. This file is the plan around them.

## What changes and what does not

- **The engine still owns every number.** Dilemmas, effects, forecasts, the day, elections,
  traits, neighbours: unchanged. Three things are added to it: `dismiss`, `applyExternal` (a
  bounded change from a bill, an event or a Word, recorded with its reason) and two entry kinds.
- **Above the engine sits a government.** Its bodies decide which options the executive may
  take. The AI plays the bodies and decides as they would; code checks every count and works out
  every consequence of a vote. With AI off, rules-based stand-ins play them, so the game still
  works.
- **The record is an Archive** of documents, like Claudetopia's: Hansard, court reports, the
  executive's papers, the Founder's Words, the almanac and the press, bills, letters, factbooks,
  the constitution. It is browsable as the nation's government website.
- **There is now a local server** (`apps/server`). The blueprint always said the AI layer would
  bring it back. It runs the engine, owns the saves, keeps the Archive on disk, and calls the AI.
  The browser is the client.

## Forms of government

A government is bodies plus rules (`Institutions`, `Rules`, `Step`). A petition runs through the
steps in stage order; steps on the same stage run in parallel. `rules.ts` works out the
`Standing` (what the executive may do) from whatever has been sat and ruled so far.

| Form | Bodies | Steps | Executive |
|---|---|---|---|
| `commonwealth` | Assembly (151, parties), High Court (7), ministries | 1: Assembly recommends (binds at 2/3, carries at 1/2) and Court reviews (bar at 4 of 7), in parallel. Reconciliation on, veto with reasons, three exchanges, dismissal only at a standstill | The Steward |
| `presidential` | Congress (435), Supreme Court (9), cabinet departments | 1: Congress recommends (binds at 2/3, the veto-proof share) and Court reviews (bar at 5 of 9). Veto with reasons on, no reconciliation, one exchange | The President |
| `parliamentary-monarchy` | Parliament (650), the Crown (council of 1), Supreme Court (12), ministries | 1: Parliament recommends, decisive at a majority. Court reviews (bar at 7 of 12). 2: the Crown assents | The Prime Minister (carries out the majority's choice) |
| `direct-democracy` | The People (electorate), Federal Council (7), Court (5) | 1: Council advises, Court reviews (3 of 5). 2: the People vote, decisive | The Federal Council's President |
| `one-party` | Party Congress (2,000), Politburo (council of 7), People's Court (advisory) | 1: Court reviews, not binding. 2: Congress recommends (never binds). Politburo advises | The General Secretary |
| `absolute-monarchy` | Privy Council (council of 9), ministries | 1: Privy Council advises | The Monarch |
| `theocracy` | Council of Elders (council of 12, bar at 7, on doctrine), Majlis (290) | 1: Majlis recommends (carries at 1/2, never binds) and Elders review | The Supreme Leader |
| `junta` | Council of Officers (council of 9) | 1: Council recommends (binds at 2/3) | The Chairman |
| `custom` | whatever an amendment left | whatever an amendment left | as amended |

The numbers are first guesses. `forms.ts` builds each one from the form, the pack's factions
(parties carry factions' interests), the pack's portfolios (one ministry each), the seed (names)
and the founding answers. Every form gets a constitution and rights written out as text; forms
with a court get a charter the court reads. The player chooses the form at founding. A nation
can change form later by an amendment bill, a revolution when a government falls (a pack
dilemma can offer one), or a Founder's Word.

### The executive's choice, in general (rules.ts)

Worked out after every sitting and ruling, never by a model:

1. Under a binding review, a barred course is out. Under a non-binding review it is marked
   "advised against" and stays open.
2. If a decisive vote has a first preference that is permitted, it is the decision.
3. If a recommending body's first preference is permitted and carried by at least `bindAt`
   of the whole body, the executive must take it.
4. If it is permitted and carried (over `carryAt`) but below `bindAt`: the executive may take
   it, or, where `vetoWithReasons`, set it aside with written reasons for another permitted
   course or dismissal.
5. If it is barred and `reconciliation` is on: the body sits again among the permitted courses.
   Its reconciliation choice is then treated as in 2 to 4.
6. If every option is barred: standstill, dismissed. If `dismissOnlyAtStandstill`, dismissal is
   otherwise open only after reconciliation rejects the sole permitted option by `bindAt`.
7. With no recommending body (absolute monarchy) the executive takes any permitted course.

### The Founder

The player is always the Founder, above every branch (Claudetopia's Article 0). A Founder's
Word can overrule any body's decision, a ruling, a vote, or the executive. It is entered word
for word. The bodies may answer it with remonstrances. If the player confirms it, it is final.
If the player orders Silence, nobody argues it further. A Word that overrules a ruling or a
binding vote costs a little legitimacy through `applyExternal`. The country notices when its
institutions are set aside. Claudetopia's own Words are migrated as they stand.

**Modes.** In `govern` the player also holds the executive office: the desk shows each
petition's standing and the Accept buttons follow it (barred options disabled, with "Overrule
by Word"; a binding option the only one enabled; veto asks for reasons). In `found` the AI
executive decides and the player reads the record, answers the questions put to the Founder,
and steps in by Word. The mode can be switched on the nation's settings page at any time.

## The day, with a government

1. **Morning.** The engine builds the agenda. The server opens a docket for each dilemma that
   goes through the bodies (majors always; minors when `minorsThroughBodies`) and starts it at
   once, so the bodies sit while the player reads the paper. Generation runs ahead of need.
2. **Petition pipeline** (server, per docket): stage by stage, each step one task: advice,
   sittings and reviews. Then reconciliation and exchanges where the rules call for them. Then
   `rules.ts` gives the standing. Progress lines go on the docket for the screen to show.
3. **Decision.** In govern mode the player accepts a course. In found mode the server runs
   `executive.decision`, checks that the course is one the standing allows (if not, it retries
   once, then takes the stand-in's choice), and enacts it. Either way the engine's
   `decide` or `dismiss` is called and a petition document is completed.
4. **Evening.** When the player ends the day (or the server does, in found mode with "Run the
   nation"): `world.day` writes the almanac and the press from what was actually decided. Its
   bounded effects go through `applyExternal`. Its matters arising become questions for the
   Founder, or items for a body. `bill.sitting` moves any bills, now and then. Letters arrive.
   Then the engine's `endDay`.

The engine has no idea any of this happened. It sees `decide`, `dismiss`, `applyExternal` and
`endDay`, as it would from a player. A save replays from its timeline.

## AI

`packages/ai` holds the provider interface, three back ends and one prompt per task:

| Back end | How | Notes |
|---|---|---|
| `none` | The rules-based stand-ins in `packages/government/standins.ts` | Always available. The default |
| `anthropic` | The player's API key, Messages API, server side only, forced tool use for JSON | The supported path. The key is stored in the data folder and never sent to the browser |
| `claude-cli` | The player's own installed, logged-in `claude -p`, run with the nation's archive folder as its working directory and read-only tools | Opt-in. This is how Claudetopia ran: an agent reads its own past sittings in full. Grey under Anthropic's terms for third-party products; see `docs/research/04-ai-providers.md`. The game never reads or stores credentials |

Tiers map to models: bulk → `claude-haiku-5-5`, standard → `claude-sonnet-5-5`, strategic →
`claude-opus-5-5`, each changeable in settings. Every output is validated (`validate.ts`). A
division must add up to the seats, a ruling must cover every course, and a course must exist.
Counts code can work out (carried, binding, verdicts from votes) are always re-derived. Effects
are clamped by `bounds.ts`. A failed task is retried once, then the stand-in plays and the
record says "(sat without the AI)".

The prompts are the Claudetopia agent definitions made general: independence ("you are never
told what the executive wants"), "read to save before you bar", "the House is there to choose a
solution", consequences carry, nobody writes their own opposition, game facts win, append don't
rewrite, the Founder's Word and Silence. The nation's specifics (bodies, members, parties,
rights, canon, precedents) come in the input, as data.

## The record

Each nation is a folder:

```
data/nations/<id>/
  save.json                     engine state + snapshots + government state (one file, rewritten atomically)
  archive/<series>/<seq>-<slug>.md   one document each, append-only
```

A document file is front matter then Markdown:

```
---
id: hansard-00012
series: hansard
title: Petition #17, Corporations Demand Political Say — first sitting
day: 12
date: Thursday 22 October 2026
issuer: The Commonwealth Assembly
kind: sitting
refs: ["petition-00017", "corporations_say"]
data: {"ladder":["2","1","dismiss"], ...}
---
The debate...
```

The server keeps an index in memory, built from the front matter at start. Search reads the
bodies. Documents are never edited after they are written. A correction is a new document that
cites the old one. Being plain files, the claude-cli back end can read them, and so can a person.

## Server API (apps/server)

Bound to 127.0.0.1. Every request must carry a `Host` of `127.0.0.1:<port>` or
`localhost:<port>`. Every request that changes anything must also carry `X-Diplomat: 1` and,
if it has an `Origin`, the same origin. Together they stop another web page from driving the
game through the browser. JSON in and out. Errors are `{ "error": "what is wrong and what to do" }`
with a 4xx or 5xx.

| Method and path | Does |
|---|---|
| `GET /api/status` | `{ version, pack, ai: { backend, ok, detail, models } }` |
| `GET /api/settings` · `PUT /api/settings` | AI back end, models per tier, `minorsThroughBodies` default. The API key is write-only: `PUT { apiKey }`, read back as `apiKeySet: true` |
| `POST /api/settings/test` | Runs the provider self-test, says which credential is in use |
| `GET /api/nations` | Summaries for the home screen |
| `POST /api/nations` | `{ identity, answers, form, mode, founder }` → `{ id }`. Builds institutions, writes the founding documents |
| `POST /api/nations/import` | `{ text }`: a 0.5 save (gets a commonwealth government) or a 0.6 save with its archive inline |
| `GET /api/nations/:id` | `{ nation: { id, createdAt, updatedAt, state, history }, government }` |
| `GET /api/nations/:id/export` | The save plus every document, as one JSON file |
| `DELETE /api/nations/:id` | Moves the folder to `data/trash/` |
| `POST /api/nations/:id/decide` | `{ dilemmaId, course, text?, veto?, word? }` → `{ entry, nation, government }`. Refused with the standing's explanation if the rules forbid it, unless a Word is given |
| `POST /api/nations/:id/situation` | `{ optionId }` |
| `POST /api/nations/:id/end-day` | Runs the evening (world day, bills, letters) then the engine's night → `{ entries, nation, government }` |
| `POST /api/nations/:id/run` | Found mode: `{ days }`. Decides every docket and ends each day, up to 7 |
| `POST /api/nations/:id/dockets/:dilemmaId/convene` | Starts or restarts a docket (after a failure, or with AI newly on) |
| `GET /api/nations/:id/dockets` | Every open docket with its progress. The client polls this every 2 s while any is sitting |
| `POST /api/nations/:id/sandbox` | `{ adjust }`, `{ callUp }`, `{ crisis }` or `{ skip }`, as the 0.5 sandbox |
| `PUT /api/nations/:id/identity` | as 0.5 |
| `PUT /api/nations/:id/mode` | `{ mode }` |
| `POST /api/nations/:id/words` | `{ text, overrules?, silence?, confirm? }`. Enters a Word; confirm an existing one with `{ number, confirm: true }` |
| `POST /api/nations/:id/questions/:qid` | `{ answer }`, `{ noAnswer: true }` or `{ later: true }` |
| `POST /api/nations/:id/letters/:lid` | `{ reply }`, `{ adopt: true }`, `{ noReply: true }`, `{ read: true }` |
| `GET /api/nations/:id/archive` | `?series=&q=&from=&to=&issuer=&limit=&offset=` → heads, newest first |
| `GET /api/nations/:id/archive/:docId` | The document, with `citedBy` |
| `POST /api/nations/:id/factbooks` · `PUT …/factbooks/:fid` · `POST …/factbooks/draft` | Write, edit, or have the AI draft a factbook entry |
| `POST /api/nations/:id/bills` | The Founder or a member moves a bill: `{ title, summary }`. It goes on the order paper |

The server also serves `apps/web/dist` and falls back to `index.html` for the hash routes.
`pnpm start` builds nothing. It starts the server on port 8150 and prints the address.

## The web app

The 0.5 screens stay: home, founding, the desk, the nation page, the record, the sandbox,
settings, admin. The store's actions become requests to the server, and the engine is still
imported for read-only views (forecasts, classification). New:

- **Founding** asks for the form of government, the mode, and the Founder's name.
- **The desk** shows each petition as a docket: advice, the sitting (ladder, division by party,
  extracts from the debate), the ruling on each option (permitted or barred, the split,
  markers), exchanges, and the standing in words. The Accept buttons follow the standing.
- **The government website** (`#/n/<id>/gov/...`): Today, the Library (every document,
  searchable, filterable by series, issuer and date), a document page (head, contents, cites and
  cited by, print layout), In force (rulings that bind, statutes, bills), each body (the seat
  chart, parties, members, divisions; the justices and how they split), the Executive (cabinet,
  ministries, directions owed), the Country (opinion, the press, the census), the Founder's page
  (questions with a box to answer each, letters with draft replies, Words given, a form to give
  a Word). Its look is Claudetopia's site: sober, official, in the nation's flag colours.
- **The census** on the nation page: population, the economy, income, tax, crime and the rest,
  derived by `census.ts` from the indicators and the nation's census base, with ratings in
  words.
- **Factbooks** on the nation page, written by the player or drafted by the AI.
- **Settings** gain an AI section: back end, API key, models, the self-test, and the AI's
  status, always shown in the menu (on, which account; paused; off).
- **Saves in the browser from 0.5** are offered for moving to the server on first load.

## Migrating Claudetopia

`scripts/import-claudetopia.ts <archive folder>` reads `H:\claudetopia` and writes a 0.6 nation
to the data folder:

- Identity, flag colours (midnight navy and gold), motto, animal, currency, Founder (Aegis).
- Institutions from `government/legislature.md` (seven parties and their seats, members),
  `government/judiciary.md` (seven justices and their philosophies), the eleven ministries,
  `law/constitution.md` and `law/charter-of-rights.md` (articles and rights, verbatim), and the
  three newspapers and the Wireless. The form is `commonwealth`.
- The census base from the NationStates figures: 5 million people, 222bn tokens, tax 21.8%,
  crime 4.17 an hour. Indicators set from the NationStates ratings by a stated mapping.
- Every record split into documents, as the old site's `archive.py` divided them: petitions,
  Hansard sittings, court reports, the almanac's days, the Steward's papers, ministry papers,
  the Founder's Words, letters and replies, questions, hearings, factbooks, lore, law.
- The in-world calendar from `simulation/state.md`, and the engine day to match it.
- Bills, open questions, unanswered letters and directions to the Steward, as structured state.
- Timeline entries for every decided petition, so the record and the nation page show its
  history. They carry no changes, because the NationStates effects were not the engine's.

The mapping and everything it could not carry over are written to the import's own report
document (`other` series).

## The Director (0.6.1)

The Director is a Claude Code session that sits outside the fiction. It is the player's
out-of-character partner: it runs the branch agents, advises the player candidly, and does the
sandbox for testing, for fun, or for cheating. It is how Claudetopia was actually run: one main
Claude session talking to the Founder and sending work out to the branch agents.

### What it is

- **One Director per nation**: a Claude Code session (`claude -p --resume <id>`) that carries on
  between visits. Its session id is kept in `data/nations/<id>/ooc/director.json`. "New session"
  starts a fresh one; the old transcript is kept.
- **Two places to talk to it.** A Director panel in the web page (the server runs the session and
  streams its replies), and plain Claude Code in a terminal: `claude` in the repo, where `.mcp.json`
  gives it the same tools and `.claude/skills/director` gives it the same role.
- **Its tools are an MCP server**, `apps/server/src/mcp.ts` (stdio, no dependencies), which calls the
  running game server's Director endpoints. The game server must be running.
- **It always uses Claude Code**, whatever back end the branches use. Its model is a setting,
  `claude-opus-5-5` by default.

### What it may do

| Kind | Tools | In the record |
|---|---|---|
| Read everything, OOC | the nation's state, every docket, the Archive, the OOC log, the rules' standing, forecasts | nothing |
| Run the government | convene a petition, run the world's day, end the day, run the nation for N days | as normal: the bodies' own documents |
| Advise | (it just talks) | nothing |
| Cheat | set any figure, faction, neighbour, policy or census base; call up any issue; start any crisis; skip days; force a docket's outcome; add or remove a law; amend the constitution or change the form; inject a world event with any effects; edit identity; decide a petition outright | **quietly**: the OOC log only, and the nation's sandbox badge |

**The OOC log** is `data/nations/<id>/ooc/log.jsonl`: every cheat, with the day, who asked (the
Founder through the Director), what changed, and the figures before and after. It sits outside
`archive/`, so no branch agent can ever read it. The engine's cheats run in a quiet form that sets
`state.sandbox` (the badge) and writes no timeline entry. The world simply is the way the Director
made it, and the in-world record never hears about it.

### What it must not do

- **Never speak in character for a branch.** The Assembly, the Court, the Isles and the Steward are
  separate agents. The Director convenes them and passes them only what the rules pass, never the
  OOC conversation, never what the Founder wants. A body can learn what the Founder wants only
  through a Word, which the Founder gives, word for word.
- **Never pass the OOC log or its own conversation to a branch.**
- **Push back.** If the Founder's Word contradicts an earlier one, breaks the constitution, or would
  do harm the Founder hasn't weighed, the Director says so plainly, out of character, before it is
  given. It can be overruled.
- Cheats happen only when the Founder asks. Running the government does not need asking.

### Hardening (from the Codex and Antigravity reviews)

- **No free text from the Director to a branch.** It has no tool to put words of its own before a
  body. In-world references, messages and addresses come only from the executive (the AI executive
  in found mode, the player in govern mode, through the desk) and from the bodies themselves. The
  Director's only channel into the fiction is a Founder's Word, verbatim, given when the Founder
  asks.
- **Branches are sealed in by the CLI, not by trust**: `--safe-mode`, `--strict-mcp-config`, no
  MCP, read-only tools confined to `archive/`. `ooc/` is a sibling of `archive/`, never inside it.
  A test proves a branch cannot read `ooc/`.
- **Every cheat is undoable.** The OOC log keeps the figures before and after, and
  `POST /api/nations/:id/ooc/:n/undo` (tool `undo_cheat`) puts them back, and logs that too. A cheat
  tool must be given `request`: the Founder's words asking for it, quoted. The panel shows each
  cheat as it happens.
- **A cheat invalidates what it touches.** Any open docket for the day is reconvened, so no ruling
  or vote rests on figures that are no longer true, and every branch session starts afresh.
- **One writer per branch session.** Calls to a branch go through the nation's queue and a lock per
  session id, whoever asked for them, so a session is never resumed twice at once.

### Branch memory

Each branch (the legislature, the court, each council, the world, the executive, each ministry)
keeps its own Claude Code session per nation, resumed on each call (`--session-id` the first time,
then `--resume`). Session ids are in `data/nations/<id>/ooc/sessions.json`, OOC. A branch's session
starts afresh at the start of each **term** (every election, or every 30 days in a nation that
holds none), when the constitution is amended, after any cheat, and after 12 calls, whichever
comes first. Every call's brief says that it is the current truth: where a branch's memory and
the brief disagree, the brief wins. The Archive stays the source of truth, and a fresh session re-reads it. Sessions are never
shared: no branch sees another's, or the Director's. The `anthropic` back end has no sessions and
behaves as before.

### Server endpoints (Director)

| Method and path | Does |
|---|---|
| `GET /api/nations/:id/director` | `{ messages: DirectorMessage[], busy, session: { id?, startedAt? }, available, detail }` |
| `POST /api/nations/:id/director` | `{ text }` → 202 `{ accepted: true }`. Refused 409 while busy. The reply streams into `messages`; the client polls every 1.5 s while `busy` |
| `POST /api/nations/:id/director/stop` | stops the turn in progress |
| `POST /api/nations/:id/director/reset` | starts a new session; the transcript so far is kept |
| `GET /api/nations/:id/ooc` | `{ log: OocEntry[] }`, newest first |
| `POST /api/nations/:id/ooc/:n/undo` | reverses cheat number n, logs the undo, returns the nation payload |
| `POST /api/director/:id/<tool>` | the MCP server's calls, one per tool. Each needs the header `X-Director-Token` matching `data/director-token` (made at first start, never sent to the browser) |

```ts
interface DirectorMessage {
  id: string
  role: 'founder' | 'director' | 'activity' // activity: "Used set_figures", "Convened Petition #1728"
  text: string // Markdown for the director; grows while it streams
  at: string // ISO time
  streaming?: boolean
}
interface OocEntry { n: number; at: string; day: number; action: string; detail: string; request: string; changes?: { target: string; from: unknown; to: unknown }[]; undone?: boolean; undoes?: number }
```
