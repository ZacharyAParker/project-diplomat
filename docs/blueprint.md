# Project Diplomat: blueprint

Last updated 2026-10-01. No code yet. "Project Diplomat" is a codename until I pick a real name
(section 12).

This is the plan. The reading behind it is in `research/`:

| File | What's in it |
|---|---|
| `01-how-nationstates-works.md` | Every NationStates system, explained well enough to rebuild |
| `02-players-and-history.md` | What players love, why they leave, and what killed NationStates 2 |
| `03-landscape.md` | Other games in the space, design patterns worth taking, stack and AI cost |
| `04-ai-providers.md` | Running AI on a player's own Claude or ChatGPT plan, and what the terms allow |
| `05-design-notes.md` | A second pass over the whole thing, to check I'd land in the same place |

If something below isn't verified, it says so.

---

## 1. What I'm building

A nation game where you answer satirical policy dilemmas and your country changes, like
NationStates, plus three things NationStates doesn't have:

1. **Consequences that compound and get explained.** Choices set policies, shift factions and plant
   flags that later dilemmas check. The result screen shows why each number moved.
2. **Other nations that matter.** Treaties, trade dependencies, regional projects and collective
   disputes exist in the rules, not only in roleplay.
3. **A history worth reading.** Every nation keeps a permanent timeline and a newspaper.

Decisions I've made:

| Decision | Choice |
|---|---|
| Vision | A deeper successor: keep the issues-and-stats heart, add nation-to-nation mechanics |
| Launch scope | Single-player first, built so private group worlds and a public world can follow |
| Setting | A fictional present day, played dry |
| Content | Community-written and AI-assisted, both |
| AI | Players can use a Claude or ChatGPT plan they already pay for, within each provider's terms. Model picked per task |
| Platform | Web-based: it runs on your machine and opens in the browser |
| Licence | Open source, MIT |
| Goal | A hobby that could grow. Costs near zero |

---

## 2. What the research says

### 2.1 The parts I'm confident about

- **NationStates survives on identity and community, not simulation depth.** Max Barry says so
  himself: he built a place to make a nation and talk, and the players built the intrigue.
- **The core weakness is the cliff after week one.** Issues take minutes, they repeat, and nothing
  else is discoverable from the nation page. The real game lives in regions and on Discord.
- **Stat effects are hidden and tuned to extremes,** which players read as arbitrary. NationStates
  started fixing this on 24 September 2026 with reports explaining each decision.
- **The simulation has to be deterministic. AI writes; it never decides.** Every AI-as-rules-engine
  game I looked at gets the same complaints (ignored moves, forgotten state) and has the same cost
  problem.
- **Sell expression only.** Pay-to-win is the common thread in the decline of CyberNations,
  Politics & War and eRepublik.

### 2.2 The warning: NationStates 2

NationStates 2 (2008 to 2009) was the last attempt at a deeper sequel. It failed because it:

- split players into closed worlds of about 300 with random, fixed placement;
- shipped war late, one-on-one, and punishing to the attacker, which made alliances pointless;
- made using trade and war a losing move;
- charged for identity features like custom flags;
- was run by a publisher that lost the community's trust.

Players asked for war for five years and then rejected it when it arrived. The lesson for me isn't
"don't add depth". It's: keep depth opt-in, make conflict collective and bounded, never let another
player wreck your nation, and prototype before committing architecture.

### 2.3 Where I went back and forth

| Question | Option A | Option B | Where I landed |
|---|---|---|---|
| Database and hosting | Cloudflare Workers + D1 | One TypeScript app + PostgreSQL | **SQLite locally, D1 when hosted.** Single-player first means the game runs on the player's machine, where SQLite is the obvious store. D1 is SQLite, so one schema covers both. Postgres stays the escape hatch |
| Session length | Three or four issues in five minutes | One large and two small decisions | **One major decision plus up to two minor ones a day,** with a clear end |
| AI cost | Budget per player on my bill | | Mostly moot at launch: in single-player the player's own provider pays, and the game works with AI off |

### 2.4 Things that change the plan

- **NationStates is still improving.** Its General Assembly was rebuilt in July 2026 and decision
  reports arrived in September 2026. I can't assume it's standing still.
- **There are rivals.** Pax Historia (AI-driven, reports 35,000 daily users) owns the free-text,
  AI-as-engine space. SimNations is reportedly a successor being built by NationStates veterans; I
  couldn't confirm its status. PolisForge and Country Simulator market themselves as alternatives.
- **Free-text social features come with legal duties.** The UK Online Safety Act has no
  small-service exemption. One more reason to launch single-player. I haven't taken advice on this.

---

## 3. Design pillars

1. **Your nation is yours.** No other player or NPC can destroy it, delete its history or lock it
   out of play. Governments can fall; the nation carries on.
2. **Every number has a reason.** No hidden effects. The result screen names the chain.
3. **The past constrains the present.** Policies, traits and promises make some options costly and
   unlock others.
4. **Other nations are people with interests,** human or scripted, and they act between your visits.
5. **Short by default, deep by choice.** A full day takes about five minutes. Diplomacy and
   authorship are there if you want longer.
6. **Works with AI off.** Authored content is the game. AI adds variety and voice.
7. **Satire with a straight face.** No option is the right answer.

---

## 4. Core loop

One in-game day:

1. **Briefing.** What changed since yesterday and why: indicators, faction moods, what the
   neighbours did, which promises are close to deadline. Written as a short newspaper front page.
2. **One major decision.** A dilemma card with two to four options, each voiced by a named advocate.
   Each option shows who gains and who loses before you choose.
3. **Up to two minor matters.** Quick calls: an appointment, a treaty reply, a regional vote.
4. **Result.** Immediate effects, the causal chains that fired, anything now scheduled for later.
5. **Done for today.** An explicit end, and one line about what tomorrow might bring.

Rules of the loop:

- **Missed days bank,** up to five. No streaks, no penalty for being away.
- **Solo worlds are player-paced.** You can play several days in a sitting. Group and public worlds
  run on a real-time clock. The clock belongs to the world, not the engine.
- **A crisis every week or two.** A multi-day "situation" advances one stage per day, and your
  daily decisions push it either way.

---

## 5. The nation model

| Layer | What it is | Notes |
|---|---|---|
| **Indicators** | About twelve readable measures: fiscal balance, debt, productive capacity, employment, living standards, inequality, health, education, environment, civil liberties, legitimacy, state capacity | The numbers the simulation actually runs on |
| **Policies** | Named on/off or tiered laws (conscription, public broadcaster, wealth tax) | Explicit records. They gate which dilemmas and options are valid |
| **Factions** | Six to eight named groups, each with a clout share and an approval score | Every option lists which factions gain or lose. Low approval among high-clout factions threatens the government |
| **Traits** | Labels earned from history ("Surveillance State", "Tax Haven") | Acting against a trait costs legitimacy. This is how the past constrains the present |
| **Flags and promises** | Hidden markers and visible commitments with deadlines | Later dilemmas check them: "because you nationalised the railways" |
| **Cabinet** | A handful of named ministers who persist and remember | Gives decisions a face. Ministers can resign or be sacked |
| **Timeline** | Dated, permanent entries written when things happen, never regenerated | The nation's history, and the source for its newspaper |
| **Census** | Lots of comic derived rankings computed from the layers above | Flavour and leaderboards only. Nothing depends on them |

Effects are data. Every option carries an immediate effect, optional delayed effects, an ongoing
cost, the factions it moves, and a reversal cost. This is a deliberate break from NationStates:
effects are bounded and visible, not hidden and pushed to extremes.

**Failure exists but it's a chapter break.** If legitimacy collapses, the government falls: new
regime, some policies reset, a scar on the timeline, and play continues.

---

## 6. Other nations

### 6.1 What's in the rules

| Mechanic | How it works | Why it's safe |
|---|---|---|
| **Dependencies** | Each nation has a few endowments and needs, derived from its policies and industry mix | No goods market, no production chains. That was the NationStates 2 trap |
| **Treaties** | Structured agreements: parties, obligations, duration, exit terms. Trade deals are treaties that satisfy a need | Terms are fields, not prose, so the engine can enforce them |
| **Regional projects** | Members commit capacity over several days to a shared build with a shared benefit | Cooperation has an object |
| **Blocs and offices** | Regions elect scarce roles (chair, treasurer, envoy) with real powers | Other players matter without anyone being attacked |
| **Disputes** | Conflict between blocs or nations: sanctions, embargoes, standoffs, resolved over several days by committed political capital | Collective, bounded and reversible |

### 6.2 The sovereignty guarantee

Players love a nation nobody can ruin, and I want conflict. This is how both hold:

- A dispute can cost you a treaty, a project share, standing, or a temporary indicator dip.
- It can never delete a nation, erase its timeline, remove its owner or impose a permanent penalty.
- Each nation sets a **posture**: Neutral, Engaged or Contender. Neutral nations can't be targeted
  and can't target. Higher postures unlock both the risks and the rewards.
- No accumulating military power. A year-old nation is more storied than a new one, not stronger.

**This is the part I trust least.** NationStates 2 shows that people asking for conflict is not the
same as people wanting it. Disputes get prototyped on paper and in single-player before any
multiplayer architecture depends on them.

### 6.3 The single-player world

A solo world is one region of twenty to forty scripted nations with distinct temperaments. A
rules-based planner scores the legal moves for each one. If an AI provider is connected, the model
can pick among moves the planner has already scored as legal, and it words the diplomacy. Without
AI, the planner picks and templates do the talking. NPC nations follow the same rules as the player.

---

## 7. Content: community-written, AI-assisted

**The format.** A dilemma is a data file validated against a schema: title, description, validity
conditions, options, per-option effects, flags set and checked, faction movements, result text.
Content ships in **packs** that a world turns on or off.

**How contributions work.**

1. At first, packs live in this repo and contributions come in as pull requests. A validator checks
   schema, effect bounds, unreachable options and dangling flags before I read anything.
2. Later, an in-game editor with preview and a review queue, the way NationStates does it with its
   issue editors.
3. Contributors license their writing to the project explicitly, including permission for AI
   processing. Nothing gets copied from NationStates: not its issues, its census names, its category
   names, or the term "World Assembly".

**House style,** borrowed from NationStates' submission rules because they work: every option has
costs and benefits; never tell the player what their leader thinks; result text must not contradict
the choice.

**Where AI helps authors.** Drafting from a premise, proposing a third option, checking that
effects match the prose, generating variants per nation archetype. A person approves anything that
goes into a shared pack.

---

## 8. AI design

### 8.1 Rules

1. The engine computes the outcome first. The model gets the computed state and writes about it.
2. Model output is a proposal: validated against a schema, effects clamped to designer ranges,
   rejected on any failure, replaced by a template.
3. Generation happens ahead of need, never while the player waits.
4. Player free text never goes into a prompt unfiltered.
5. Everything generated is saved with the world, so a save replays identically with no provider.
6. The interface always says what the AI status is: on (which account), paused (why, until when),
   or off.

### 8.2 Tasks and models

Prices are from the providers' pricing pages on 2026-10-01 (USD per million tokens, input /
output). Which model goes with which task is my judgement, not a benchmark. I need a small
evaluation set before I lock it in.

| Task | Needs | Claude | OpenAI |
|---|---|---|---|
| Headlines, briefing prose, timeline entries | Volume, voice, low stakes | Haiku 4.5 ($1 / $5) | gpt-6-luna ($0.10 / $0.50) |
| Personalised dilemma variants from an authored template | Schema adherence, coherent trade-offs | Sonnet 5.5 ($2 / $10) | gpt-6.1-sol ($2 / $10) |
| New dilemma drafting for authors | Best writing, used rarely | Opus 5.5 ($4 / $20) | gpt-6.1-sol |
| NPC nation move selection and diplomacy text | Consistent temperament over time | Sonnet 5.5 | gpt-6-sol ($2 / $10) |
| Validation and moderation of generated text | Cheap, fast, strict | Haiku 4.5 | gpt-6-luna |

Schema and range checks are code, not model calls. On a subscription the scarce thing is the
player's quota, which they share with everything else they use it for, so each task defaults one
tier cheaper there.

### 8.3 Providers and what the terms allow

One interface, several back ends. The game asks for a task and a tier; the back end maps that to a
model.

| Back end | How | Where it stands |
|---|---|---|
| **None** | Authored and pre-generated packs | Always available. The default |
| **ChatGPT plan** | Sign in with ChatGPT, calling the Responses API | OpenAI's docs say an open-source app "can request permission to use the user's ChatGPT plan for eligible Responses API requests". Paid or remotely hosted apps have to apply first. I checked that sentence at the source; I couldn't get OpenAI's Terms of Use to load |
| **API key** (Anthropic or OpenAI) | Player supplies their own key | The supported path for both providers |
| **Codex CLI** | The player's own installed, logged-in `codex exec` | Works technically; the docs don't address third-party apps doing it. Grey. Fallback only |
| **Claude Code CLI** | The player's own installed, logged-in `claude -p` | **Grey.** See below |

**Anthropic,** from `code.claude.com/docs/en/legal-and-compliance`, read 2026-10-01:

- Against: "Developers building products or services that interact with Claude's capabilities ...
  should use API key authentication", and Anthropic "does not permit third-party developers to offer
  Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan
  credentials on behalf of their users."
- For: the same page says this doesn't "prevent an end user from signing in to the unmodified
  Claude Code binary with their own Claude subscription".
- It also says limits "assume ordinary, individual usage" and that Anthropic may enforce "without
  prior notice". Anthropic reportedly blocked third-party use of subscription tokens twice in 2026
  (I only have secondary sources for that).

**My position.** The supported Claude integration is the API key. A Claude subscription mode is
opt-in only, and all it does is call the Claude Code the player installed and signed in to
themselves. The game never bundles it, never reads credentials, and doesn't advertise it as a
selling point. Before I ship that mode to anyone else I'm going to ask Anthropic; their docs invite
the question. Same care for me bulk-generating shipped content on a personal subscription: that
goes through an API key with batch pricing.

One server feeding many players from one subscription is prohibited by both providers and isn't
part of this.

**Known fragility.** Claude Code's docs say a mode that ignores subscription login will become the
default for headless calls. So every provider runs a self-test at startup that confirms which
credential is actually in use.

### 8.4 Still to write

The system prompts. They depend on the dilemma schema (section 7), so they're the first job once
the schema is fixed: one prompt per task in the table above, each with the output schema, the house
style, and worked examples.

---

## 9. Architecture

### 9.1 Shape

```
packages/engine    pure TypeScript: (state, decisions, seed) -> (state, events)
packages/content   pack schema, validator, starter packs
packages/ai        provider interface, back ends, prompts, output validators
apps/local         local server + SQLite + web UI on localhost   <- ships first
apps/hosted        Cloudflare Workers + D1 + Queues              <- group and public worlds, later
```

- **The engine has no platform imports.** It can be replayed, tested and rebalanced, and it runs
  unchanged on a laptop or a Worker.
- **Single-player runs locally and opens in the browser.** It has to run locally anyway: a web page
  can't start the player's Claude Code or Codex. A small local server serves the interface and owns
  the save. No desktop packaging for now.
- **One schema, two homes.** SQLite locally, D1 when hosted. Hosted ticks run from a scheduled
  trigger through a queue, in idempotent chunks keyed by tick number.
- **A world is configuration:** clock (player-paced or scheduled), membership (solo, invite, open),
  enabled packs, AI policy. Solo, group and public are the same engine with different settings. The
  simulation never forces a community to be split up.

### 9.2 Data model sketch

| Record | Holds |
|---|---|
| World | clock, membership, packs, rules version, seed |
| Nation | owner (player or NPC), identity, one packed state row, state version |
| Decision | day, dilemma id and version, option chosen, idempotency key |
| Event | append-only: causes, effects, visibility. The source for timeline and newspaper |
| Treaty / Project / Dispute | parties, structured terms, status, deadlines |
| Region | charter, roles, membership |
| Content | pack, dilemma versions, review state, author |
| Generated text | task, input hash, model, output, the events it was written from |
| Snapshot | per-nation state per day, with retention |

Nations are keyed by id, never by name, so renaming, resetting and deleting are ordinary operations.
State is one row per nation, not one row per stat.

### 9.3 Cost

Single-player costs me nothing to run. A hosted world at tens of thousands of nations sits near
Cloudflare's five-dollar monthly floor as long as state is packed. What grows is history storage,
and any AI I pay for myself, which the design avoids.

---

## 10. Roadmap

Each phase ends at a test, not a date.

| Phase | Build | Move on when |
|---|---|---|
| **0. Paper** | Nation model, dilemma schema, thirty hand-written dilemmas, one situation, the dispute rules on paper | Playing it through by hand produces a history worth retelling |
| **1. Solo prototype** | Engine, local app, briefing and result screens, timeline, no AI | A tester can explain why their numbers moved and asks for another day |
| **2. Neighbours** | NPC nations, treaties, dependencies, one regional project, disputes | Players choose to deal with their neighbours without being told to |
| **3. AI layer** | Provider interface, no-AI and API-key back ends, then ChatGPT plan, then the opt-in CLI modes; system prompts; evaluation set | Generated content passes validation at a high rate and testers can't reliably pick the generated dilemmas as worse |
| **4. Authoring** | Pack validator, contribution guide, editor | Someone outside the project lands a dilemma without my help |
| **5. Group worlds** | Hosted app, scheduled clock, invites, regional offices and votes | A group of friends plays for a month |
| **6. Public world** | Moderation tools, appeals, account security, share cards and public nation pages | I understand the legal duties and abuse is manageable |

---

## 11. Risks and open questions

| Risk | What I'll do about it |
|---|---|
| Depth turns the game into homework | Test the daily loop before building diplomacy. Depth stays optional |
| Conflict is wanted in theory and rejected in practice | Prototype disputes early, in single-player, before multiplayer depends on them |
| The Claude subscription path gets restricted or breaks | API key is the supported path; CLI mode is opt-in; startup self-test |
| Content is the real cost | Community packs plus AI drafting. The validator keeps quality up |
| Writing bias | NationStates' own editors admit theirs. Get authors from across the spectrum and review for it |
| Naming and IP | Mechanics are free to imitate. Names, text and coined terms are not. Section 12 |
| Legal duties once players can write to each other | Launch single-player. Take advice before phase 5 |

Gaps in my research: thin on Reddit; NSWiki was down; NationStates' stat formulas, revenue and
exact influence formula aren't public; some competitor player counts are unverified.

---

## 12. Name

It can't be close to "NationStates", it can't borrow a real institution's name (NationStates got a
cease-and-desist from the UN in 2008 and had to rename), and it should say something about the game.

Candidates. **I haven't checked any of these** against trademark registers, existing games, domains
or app stores:

| Name | Idea |
|---|---|
| **Red Box** | The case of papers a minister works through each day. Fits the daily loop |
| **Mandate** | What you hold until the factions take it away |
| **Order Paper** | The day's business |
| **Small Republics** | Modest, comic |
| **The Honourable Member** | Satirical, character-led |
| **Body Politic** | The nation as something that reacts |

A trademark and marketplace search comes before any public use. "A spiritual successor to
NationStates" is how everyone else in the genre describes themselves, and that seems fine. A
courtesy note to Max Barry would be cheap, and his community is loyal.
