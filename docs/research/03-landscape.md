# Landscape survey: a modern successor to NationStates

Written 2026-10-01.

**How to read the sourcing.** Every factual claim has a URL. Three markers are used where the evidence is weaker:

- **[third-party estimate]**: a number from a Steam revenue estimator or similar, not from the developer.
- **[snippet only]**: I saw the claim in a search snippet and did not open the page itself (some pages returned 403).
- **[unverified]**: from memory, not checked. Treat as a lead, not a fact.

Opinions are labelled as positions. Prices were read on 2026-10-01 and will drift.

---

## 1. Bottom line

1. **The niche is alive and under-served.** NationStates still has about 337,000 active nations 24 years on, with a Perl codebase, no mobile-first design and no share loop ([Wikipedia](https://en.wikipedia.org/wiki/NationStates)). Its direct competitors are all far smaller: Politics & War shows about 2,800 nations active per day ([politicsandwar.com](https://politicsandwar.com/)).
2. **The proven LLM-native competitor is Pax Historia**, a browser alt-history sandbox reporting 35,000 daily users and a YC W26 batch place ([YC](https://www.ycombinator.com/companies/pax-historia)). It sells AI turns for tokens. Do not compete on its ground (free-text, LLM-as-engine, pay-per-turn). Compete on the thing it lacks: a deterministic, persistent, shared world where a five-minute daily session is free.
3. **Position: the simulation must be deterministic and the LLM must be garnish.** Every LLM-as-engine game surveyed has the same complaints (forgotten state, hollow consequences) and the same cost problem. Used for authoring and flavour only, LLM cost is roughly $0.01 to $0.03 per daily player per month. Used as the engine, it is $0.20 to $1.00 or more.
4. **Stack position: stay on Cloudflare**, with D1 as the system of record and one row per nation. At tens of thousands of nations this is small data. The real risks are write-metering from a badly normalised schema and the 10 GB D1 cap on history, both avoidable by design.

---

## 2. Part A: comparable games

### 2.1 Baseline: NationStates

| | |
|---|---|
| Launched | 13 November 2002, by Max Barry, to promote the novel *Jennifer Government* ([Wikipedia](https://en.wikipedia.org/wiki/NationStates)) |
| Scale | 337,296 active nations on 14 May 2026; over 10 million created in total ([Wikipedia](https://en.wikipedia.org/wiki/NationStates), [NS news](https://www.nationstates.net/page=news)) [snippet only for the 10M figure] |
| Content | About 1,867 issues with over 7,000 choices; up to 5 unaddressed issues held at once; 4 issues a day at default settings ([NS forum](https://forum.nationstates.net/viewtopic.php?f=12&t=490650), [NS FAQ](https://www.nationstates.net/page=faq)) [snippet only] |
| Authorship | Barry wrote the first 31 issues; the rest are player-written and passed through volunteer issues editors ([NS dispatch](https://www.nationstates.net/page=dispatch/id=1301085)) [snippet only] |
| Revenue | Advertising, paid supporter memberships, book promotion ([Wikipedia](https://en.wikipedia.org/wiki/NationStates)) |
| Tech | Perl ([Wikipedia](https://en.wikipedia.org/wiki/NationStates)) |

What it gets right and a successor must keep: no win state, satirical voice, issues with no correct answer, an editorial pipeline for player-written content, and regions as the social unit. What it gets wrong: stats shift without an explained causal chain, there is no personal story record, nothing is designed to be shared outside the site, and the social layer (regions, World Assembly, raiding) is close to invisible to a new player.

### 2.2 Persistent browser nation sims

| Game | Core loop | Better than NS | Worse than NS | Numbers and status |
|---|---|---|---|---|
| **Politics & War** (2014) | Build cities, produce resources, join an alliance, fight wars | A real economy and war give alliances material stakes | New players are raided by veterans unless they join an alliance; growth slows until donating feels necessary; up to $99.99 a month tiers ([Game Solver review](https://game-solver.com/politics-and-war/)) [snippet only] | 14,774 nations, 6,016 active in a week, 2,811 active that day ([politicsandwar.com](https://politicsandwar.com/)) [snippet only]. Running. Caps "pay-to-win" credits at 20 per nation ([P&W wiki](https://politicsandwar.com/pwpedia/article/credits)) |
| **CyberNations** (2006) | Daily tax collection and bill payment, alliances, wars | Proved that NS players wanted material stakes: its early growth came from NS migrants ([CN wiki](https://cybernations.fandom.com/wiki/Cyber_Nations_Early_History)) | Chore loop with no narrative; permanent world with unbounded veteran advantage | 7,115 nations in April 2016 falling to 6,773 by June 2016 ([CN forum](https://forums.cybernations.net/topic/131337-nation-count-within-cn-and-trends)) [snippet only]. Current count [unverified]; long decline |
| **eRepublik** (2008) | Daily work, train, fight clicks as a citizen of a real-world country | Players are citizens inside shared nations, so elections and newspapers matter | Pay-to-win gold; community says new players cannot affect anything ([eRepublik article](https://www.erepublik.com/en/article/2676982)) | Sold to Stillfront in 2017 for EUR 7.5M; over EUR 2.5M revenue in 2016 with 34 staff ([Stillfront](https://www.stillfront.com/en/stillfront-group-ab-stillfront-acquires-erepublik-labs/)). About 42,000 players in late 2020 ([eRepublik article](https://www.erepublik.com/en/article/2728498)) [snippet only]. Still running, declining |
| **NationStates 2** (2008 to 2009) | NS issues plus an economy and population to feed | Nothing durable | Run by Jolt, not Barry. Beta opened 3 November 2008, closed 1 July 2009. Jolt cited "major flaws" in the design; Barry cut ties over unpaid royalties ([Wikipedia](https://en.wikipedia.org/wiki/NationStates), [NS forum](https://forum.nationstates.net/viewtopic.php?f=20&t=973)) | Defunct. Players report the issue system "meshed horribly" with keeping people fed ([NS forum](https://forum.nationstates.net/viewtopic.php?p=18703656)) [snippet only] |
| **Particracy** (2005) | Run a party: write bills, vote, contest elections | Legislation is a player-to-player negotiation | Never finished; development stopped | Classic went offline; community continues on forums as "Particracy Legacy"; a rebuild, "PT: Reborn", is in open beta ([Substack](https://prtcy.substack.com/p/pt-reborn)) [snippet only] |
| **Power Play USA** | Play one politician: primaries, fundraising, bills | Role-based multiplayer with offices that only one player can hold | Tiny, US-only, needs hours of presence | 36 players online, 324 Discord members, 28 paying patrons ([powerplayusa.net](https://powerplayusa.net/), [Patreon](https://www.patreon.com/powerplayusa)) [snippet only] |
| **POWER** (oppress.games) | Politician or businessman across several countries, with a stock market | Economy and politics combined | Very small | 9 players online when checked ([oppress.games](https://oppress.games/power/)) [snippet only] |
| **Pax Historia** (2025) | Pick a nation and date, type free-text actions, an LLM narrates the world's response | Anything is possible; community-made scenarios (4,000+ presets with 50+ plays each) | No deterministic state; turns cost money; players commonly complain the AI ignores or forgets their actions ([Pax wiki](https://wiki.paxhistoria.co/wiki/Ark's_Writing_Guide_and_Tips)) | 35,000 daily users, 100+ billion tokens a week, YC W26, team of 6 ([YC](https://www.ycombinator.com/companies/pax-historia)). Covered in detail in 2.5 |

**Positions.**

- **Steal from Particracy and Power:** scarce, player-held roles. A region with one delegate seat is more interesting than a region with a forum.
- **Trap, shown three times (CyberNations, P&W, eRepublik):** a permanent world plus accumulating military or economic power. It produces veteran lock-in, raiding of newcomers, and pressure to sell power. All three are in slow decline or flat at small scale.
- **Trap, shown by NS2:** bolting a resource economy onto issue-answering. The two loops fight each other. If an economy exists, issues must be its only input.

### 2.3 Single-player political sims

| Game | Core loop | Worth borrowing | Weakness | Outcome |
|---|---|---|---|---|
| **Democracy 3 / 4** | Adjust policy sliders; a visible web of cause and effect moves voter groups | The causal graph is the interface. Players see why a stat moved | Dense; no characters or story | Democracy 3 sold 780,000 on Steam; Democracy 4 200,000 by August 2024 ([Wikipedia](https://en.wikipedia.org/wiki/Democracy_(video_game))) [snippet only] |
| **Suzerain** | Text-heavy presidency with named characters and long-delayed consequences | Decisions pay off many hours later with named people attached | Hand-authored, finite | Over 650,000 units, 500,000 on Steam ([GamesMarkt](https://x.com/GamesMarkt/status/2049796313898791289)) [snippet only] |
| **Reigns** | Swipe left or right on a card; four meters must stay between empty and full | The whole decision is one thumb gesture; either extreme of any meter ends the reign | Shallow simulation | 600,000 sales and about $1.8M in the first month; 2 million by August 2019, roughly 80% on mobile ([pocketgamer.biz](https://www.pocketgamer.biz/news/63976/tinder-esque-indie-strategy-reigns-600000-downloads/), [GamesRadar](https://www.gamesradar.com/how-reigns-convinced-two-million-people-to-swipe-right-to-rule-their-kingdom-and-captured-the-game-of-thrones-license/)). Studio Nerial later announced closure ([Kotaku](https://kotaku.com/reigns-card-shark-dev-closing-down-2000738732)) |
| **Tropico 6** | City builder with factions, edicts and elections | Factions with named leaders who react to edicts; humour | Needs a full building game underneath | Estimated 1 to 1.4 million on Steam ([Wikipedia](https://en.wikipedia.org/wiki/Tropico_6)) [third-party estimate, snippet only] |
| **The Political Process** | Career politician in a detailed US system | Proof that a solo developer can sustain a niche political sim | Spreadsheet presentation | 95.5% positive from 2,092 Steam reviews; about $956,000 gross ([steambase](https://steambase.io/games/the-political-process/reviews), [steam-revenue-calculator](https://steam-revenue-calculator.com/app/1184770/the-political-process)) [third-party estimate] |
| **Rogue State Revolution** | Run a fictional Middle Eastern state through crises | Dark humour and advisers with agendas | Balance complaints | 75% positive from 484 Steam reviews ([Steam](https://store.steampowered.com/app/1145340/Rogue_State_Revolution/)) |
| **Realpolitiks** | Lightweight real-time grand strategy | Little | Built for PC and mobile at once and satisfied neither | 60% positive from 904 Steam reviews ([Steam](https://store.steampowered.com/app/553260/Realpolitiks/)) |

**Positions.**

- **Steal the Reigns input model** for the daily issue: a card, two to four options, one thumb.
- **Steal the Democracy causal view** for the result screen: after answering, show the three or four chains that fired ("banned cars, so commute times rose, so the Commuters' Union is angry").
- **Steal Suzerain's delayed consequences**: a choice today plants a flag that a later issue checks.
- **Trap (Realpolitiks):** thin grand strategy. A map and armies done at half depth pleases nobody.

### 2.4 Depth references: Paradox

The aim is to borrow structure, not scale.

| Mechanic | What it does | Lightweight version |
|---|---|---|
| **Victoria 3 interest groups** | Pops join interest groups according to profession, wealth and literacy; each group's clout is the summed political strength of its members ([dev diary 6](https://forum.paradoxplaza.com/forum/developer-diary/victoria-3-dev-diary-6-interest-groups.1481423/), [dev diary 1](https://forum.paradoxplaza.com/forum/developer-diary/victoria-3-dev-diary-1-pops.1476573/)) | Six to eight named factions per nation, each with a clout share and an approval score. Every issue option lists which factions gain or lose. No individual pops |
| **Crusader Kings 3 traits and stress** | A character's traits make some choices costly: acting against a trait adds stress, and stress triggers breakdown events at thresholds ([Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2868962445)) [snippet only] | The nation acquires traits from its history ("Surveillance State", "Tax Haven"). Acting against a trait costs stability. This makes a nation's past constrain its future, which is what turns stats into a story |
| **Stellaris anomalies and situations** | A large pool of short text events with mechanical effects; players fill the gaps with imagination. Critics note this leaves a lot to the reader ([Vice](https://www.vice.com/en/article/storytelling-in-stellaris-leaves-too-much-to-the-imagination/), [Medium](https://medium.com/@chrisboudreau/stellariss-situational-sci-fi-storytelling-6a13a1b1f878)) [snippet only] | Multi-day "situations": a crisis that advances one stage per tick and that the daily issue can push either way |

**Position: steal factions and traits; do not build a pop or goods economy.** Factions give every issue a "who is angry" answer. Traits give a nation memory. A market simulation is the NS2 trap again.

### 2.5 LLM-driven games and research

**Pax Historia (the direct competitor).**

- Alpha launched 18 August 2025; 35,000 daily users; over 100 billion tokens a week ([YC](https://www.ycombinator.com/companies/pax-historia), [research notes](https://github.com/phillipyan300/Pax-Automata/blob/feature/project-init/docs/pax-historia-research.md)).
- Monetisation: sign-up bonus of 1 token, daily login reward of 0.20 tokens, and a $12 a month subscription ([token wiki](https://wiki.paxhistoria.co/wiki/Token_System), [Pax Patron](https://wiki.paxhistoria.co/wiki/Pax_Patron)) [snippet only].
- Cost: a community reverse-engineering puts API cost per turn at about $0.002 on the cheapest tier, $0.014 on the middle tier and $0.13 on the top tier, with late-game turns on the top tier possibly sold at a loss ([gist](https://gist.github.com/thiras/0bcf5b02745f0966e0354bb63b9cc2cc)). The author labels this speculative.
- Reception: the community's own writing guide says players "commonly complain" that models fail actions, miss details or ignore moves, and blames short prompts ([Pax wiki](https://wiki.paxhistoria.co/wiki/Ark's_Writing_Guide_and_Tips)). Position: when the fix for a game is "write longer orders", that is a design gap a deterministic game can exploit.

**AI Dungeon (the cautionary tale).**

- At its 2021 peak Latitude was reported to be spending nearly $200,000 a month on OpenAI and AWS ([CNBC](https://www.cnbc.com/2023/03/13/chatgpt-and-generative-ai-are-booming-but-at-a-very-expensive-price.html)) [snippet only; the page returned 403 to me].
- In April 2021 an automated content filter, added after OpenAI demanded action on sexual content involving minors, produced false positives such as flagging "an 8-year-old computer", and it emerged that staff could read private stories. Players review-bombed the game and left for competitors ([arcanumrpgs.com](https://arcanumrpgs.com/blog/is-ai-dungeon-safe/)) [snippet only].
- Lessons: free-text input creates a moderation liability that the model vendor can force on you overnight, and metering play with "energy" angers a young audience with no money.

**Hidden Door (2025).** Launched August 2025 on licensed story worlds with a curated trope engine, not a raw LLM wrapper ([Variety](https://variety.com/2025/gaming/news/hidden-door-ai-role-playing-fan-fiction-game-platform-1236488265/)). Ian Bicking's design review is the most useful single document found for this project ([ianbicking.org](https://ianbicking.org/blog/2025/08/hidden-door-design-review-llm-driven-game)). His findings:

- **Ungroundedness:** "the story is written only as far as it's been presented to the player". There is no underlying truth, so choices feel weightless.
- **Hollow agency:** the player cannot really fail. He killed a character and was forgiven at once.
- **Pacing:** the model lingers on trivia.
- **Recommendations:** state the world state before writing prose; decide each choice's consequence before writing it; allow real failure; start from pre-generated choice-based fiction, because free-text input invites prompt-hacking.

**Infinite Craft (the cost pattern to copy).** Each new pair of elements goes to an LLM once; the result is stored in a global shared database and served from cache to every later player ([write-up](https://quuxplusone.github.io/blog/2024/02/08/infinite-craft/), [Wikipedia](https://en.wikipedia.org/wiki/Infinite_Craft)) [snippet only]. Generation cost scales with novel content, not with players.

**Suck Up! (pay-per-token inside a paid game).** Ships with 10,000 "AI tokens" for roughly 40 to 50 hours of play ([Steam](https://store.steampowered.com/app/2726370/Suck_Up/)) [snippet only].

**Player sentiment.** Steam titles disclosing generative AI rose about 800% in 2025 ([ScreenHub](https://www.screenhub.com.au/news/games/steam-generative-ai-games-2673234/)). Reported backlash led Frontier to remove AI portraits from Jurassic World Evolution 3 and Embark to replace AI voices in The Finals ([vgtimes](https://vgtimes.com/articles/168308-ai-in-games-backlash-boycotts.html)) [snippet only]. Position: hostility is aimed at AI replacing visible craft (art, voice). Disclose plainly, keep human-written issues as the headline content, and never ship generated art as the face of the game.

**Diplomacy research.**

- **Cicero (Meta, 2022):** scored 25.8% on average across 40 anonymous webDiplomacy games, more than double the human average of 12.4%, and ranked in the top 10% of players with more than one game ([Science paper summary](https://www.mit.edu/~gfarina/2022/cicero), [SingularityHub](https://singularityhub.com/2022/11/28/meta-created-an-ai-that-beat-humans-at-diplomacy/)). It paired a 2.7 billion parameter language model with a separate strategic planner. The lesson for this project is the architecture: a planner decides, a language model only words it.
- **AI Diplomacy (Every, 2025):** 18 general models played each other. o3 lied and won; Claude Opus 4 would not betray allies ([code](https://github.com/EveryInc/AI_Diplomacy), [Dan Shipper](https://x.com/danshipper/status/1930648858654113966)). Lesson: models have stable temperaments, usable for filler nations in quiet regions, but an NPC that negotiates in free text is expensive and manipulable.

**Positions.**

- **Steal:** global cache of generated content (Infinite Craft); state first, prose second (Bicking, Cicero).
- **Trap:** LLM as rules engine. **Trap:** free-text player input to a model. **Trap:** charging per AI turn in a game meant to be a free daily habit.

### 2.6 Async social games with daily loops

| Game | What it shows | Numbers |
|---|---|---|
| **Wordle** | A spoiler-free result that others can read at a glance. The emoji grid was invented by a player; Wardle added a share button in December 2021 ([Wardle on X](https://x.com/powerlanguish/status/1471493886031773707)) | About 90 daily players in early November 2021, about 300,000 by mid-January 2022, then millions ([Wikipedia](https://en.wikipedia.org/wiki/Wordle)) [snippet only] |
| **Torn** (2004) | A permanent text world can still grow in year 22 with infrastructure work and paid marketing | 48,515 daily players in January 2024; passed 100,000 on 27 April ([MCV](https://mcvuk.com/business-news/industry-news-torn-surpasses-100000-daily-active-players-after-22-years-at-the-top/), [pocketgamer.biz](https://www.pocketgamer.biz/torn-rpg-surpasses-100000-daily-players-after-22-years-of-growth/)). $5 donator pack gives 31 days of status and tradeable points ([Torn wiki](https://wiki.torn.com/wiki/Donator_Pack)) |
| **Neopets** | Nostalgia plus a daily round of small rewards; revival under an independent team | Nearly 250,000 daily and over 400,000 monthly users in 2024, three times the earlier level ([Neopets](https://portal.neopets.com/news/feb5-neopets-year-in-review-2024), [pocketgamer.biz](https://www.pocketgamer.biz/neopets-surpasses-400000-maus-under-new-management/)) |
| **Reigns** | See 2.3: swipe input sold 2 million | |
| **Idle games** | Progress accrues while away, so returning is a reward and not a debt | [unverified] general design knowledge |

**Positions.**

- **Steal the Wordle share artefact,** adapted: the card must be legible to someone who has never played and must not spoil the issue.
- **Steal Torn's tradeable-subscription model** only if an in-game currency exists. Otherwise cosmetic supporter status is cleaner.
- **Steal the idle "world moved while you were away" return screen.**
- **Trap:** Neopets-style daily checklists. Ten small chores a day is how a five-minute session becomes thirty.

---

## 3. Part B: design patterns

### 3.1 The first five minutes

Median mobile games keep about 22% of players to day 1, under 4% to day 7 and under 1% to day 30; the top 1% keep 64 to 68% on day 1 ([GameAnalytics 2026 benchmarks](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks)) [snippet only]. Web games have less friction to start and less to keep, so the first session carries the whole burden.

Position, in order:

1. **No sign-up before play.** NationStates asks for a name, flag, motto and classification first. Open instead with three issues; the nation is named afterwards, from what the answers produced.
2. **First issue inside ten seconds.** Reigns-style card.
3. **Show causation at once.** After each answer, show which factions moved and one newspaper headline.
4. **End the first session with an artefact:** the nation's classification, a generated crest and a one-line description. This is the first share card and the reason to make an account.
5. **Place the player in a region automatically,** with a visible neighbour list, before they close the tab.

### 3.2 Daily loops that are not chores

- **Bank missed days.** NationStates holds up to five issues. Keep that. A streak that punishes absence is the chore pattern.
- **A short ceiling.** Three to four issues, one situation update, done. An explicit "that's today" end state, as Wordle has.
- **The world moves between visits.** The tick produces a "while you were away" summary: stat changes, regional events, a neighbour's decision that affected you.
- **Vary the stakes.** Most days are routine; a multi-day situation every week or two provides the peaks.

### 3.3 Consequences that compound into a story

- **Flags and traits** (2.4): each significant choice sets a named flag; later issues check flags. The player sees "because you nationalised the railways in week 2".
- **A permanent timeline** per nation: dated entries, generated at decision time, never regenerated. This is the personal history NationStates lacks.
- **Named recurring characters** (Suzerain, Tropico): a finance minister who remembers.
- **Real failure** (Bicking): governments can fall. A collapse is a chapter break, not account deletion: the nation continues under a new regime with scars.

### 3.4 Shareable artefacts

- **A daily or weekly card:** flag, classification, one absurd headline, three stat arrows. Rendered server-side as an image with Open Graph tags so that a pasted link unfurls in chat apps.
- **A text fallback** in the Wordle style for platforms that strip images.
- **Public nation pages** that load fast without login. Every share is a landing page.
- **Comparison cards:** "my nation versus yours" is a stronger invitation than a solo boast.

### 3.5 Async multiplayer that makes others matter

Problem to avoid: in NationStates a nation can ignore every other player for ever.

- **Regional spillover.** Each tick, a region's aggregate stats nudge its members (pollution, refugees, trade). Small effects, clearly attributed to named neighbours.
- **Scarce roles** (Particracy, Power): regional delegate, treasurer, assembly rapporteur.
- **Collective votes** with real mechanical effect, one open at a time, one tap to vote.
- **Shared situations:** a regional crisis that members resolve by their separate daily answers.
- **No direct attack on a nation's progress.** Raiding in P&W drives out newcomers (2.2). Conflict should be over regional offices and votes, as NationStates raiding already is.

### 3.6 Seasons versus a permanent world

Travian wipes each server after 6 to 12 months when an alliance completes a wonder; OGame universes never reset ([Gameforge comparison](https://gameforge.com/en-GB/games/ogame-vs-travian.html)) [snippet only]. Resets give fair starts and delete months of work. Permanence gives attachment and entrenches veterans.

Position: **permanent nations, seasonal world.** The nation, its timeline and traits never reset. Leaderboards, regional offices, assembly agendas and a world theme run in seasons of about three months, ending in a published almanac and a commemorative card. NationStates' own card seasons point the same way ([NS forum](https://forum.nationstates.net/viewtopic.php?f=15&t=554691)) [snippet only]. This works only because no power accumulates: a year-old nation is more storied than a new one, not stronger.

### 3.7 Mobile-first web

- Build a web app first. A link opens the game; an app store listing does not.
- **Do not depend on web push.** On iOS, push works only after the user adds the site to the home screen through the share sheet, and there is no install prompt ([MagicBell guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)) [snippet only]. Use email digests as the primary re-engagement channel, with push as a bonus.
- EU status of home-screen web apps has changed more than once; sources in the same search conflict. [unverified] Check before relying on it.
- Thumb-reach layout, server-rendered pages, and a first load small enough for a poor connection.

### 3.8 Moderation of user content

- **Law.** The UK Online Safety Act has no exemption for small services: a small forum must complete an illegal-content risk assessment covering 17 priority categories and run a complaints process ([Bristows](https://inquisitiveminds.bristows.com/post/102k11s/my-organisation-runs-a-small-online-forum-is-it-in-scope-of-the-osa), [The Register](https://www.theregister.com/2025/01/14/online_safety_act/)) [snippet only]. Some small forums disabled direct messages in response ([What Hi-Fi forum](https://forums.whathifi.com/threads/disabling-direct-messages-in-the-forums.138535/post-1364950)). EU Digital Services Act and US COPPA duties also apply. [unverified] Take legal advice before opening free-text features.
- **Design position: minimise free text at launch.** Nation names, mottos and short dispatches only. No private messages. Regional chat comes later, behind account age.
- **Pre-moderate names and mottos** with a cheap classifier call plus a blocklist; queue borderline cases for a human.
- **Player-written issues go through an editorial queue,** as NationStates does. This is a strength: it is the content pipeline.
- **Never let player text reach an LLM prompt unfiltered,** and never show generated text that was conditioned on another player's free text without review. The AI Dungeon filter crisis (2.5) is the reference failure.

### 3.9 Fair monetisation

Evidence: P&W and eRepublik draw sustained pay-to-win complaints (2.2). Torn sells status and tradeable points at $5 and is growing (2.6). NationStates runs on ads and supporter memberships (2.1). Pax Historia charges for AI turns (2.5).

Position:

- **Free:** the full daily loop, for ever, with no energy meter.
- **Supporter subscription (about $3 to $5 a month):** cosmetics (flag effects, card frames, custom crest), deeper history charts, extra nation slots, no ads.
- **One-off purchases:** season almanac prints, card styles.
- **If LLM extras are sold,** sell them as bounded perks (a weekly long-form "state of the nation" address), not as turns.
- **Never sell:** stat changes, extra issues, vote weight.
- **Payments:** Stripe is about 2.9% + 30c and leaves tax to you; a merchant of record such as Paddle is about 5% + 50c and handles VAT ([fee comparison](https://dev.to/jettfu/stripe-vs-paddle-vs-lemon-squeezy-fee-comparison-2026-2c77)) [snippet only]. For a solo developer selling small items worldwide, the merchant of record is worth the fee. Note the fixed 50c is heavy on a $3 item, so prefer quarterly or annual billing.

---

## 4. Part C: technical options

### 4.1 Workload

- 50,000 nations with 100 numeric stats each is 5 million numbers, about 40 MB as raw floats. This is small.
- Two ticks a day. Each tick reads every active nation, applies decisions and regional spillover, writes results and rankings.
- Reads dominate: public nation pages, share cards, leaderboards.
- Realtime is optional and confined to regions.

### 4.2 Cloudflare, assessed

Prices and limits from [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

| Item | Figure |
|---|---|
| Workers Paid | $5 a month; 10M requests and 30M CPU-ms included |
| D1 | 10 GB per database; 25 billion row reads and 50M row writes included; $1.00 per extra million writes; one query at a time per database; 30 s per query; 1,000 queries per invocation |
| Durable Objects | 10 GB SQLite per object; about 1,000 requests a second per object; same row pricing as D1 since January 2026 ([changelog](https://developers.cloudflare.com/changelog/2026-01-07-durable-objects-sqlite-storage-billing)) |
| Cron Triggers | Up to 15 minutes of CPU per run |
| Queues | 1M operations included, $0.40 per extra million |

**Fits well.**

- Public pages and share cards served at the edge with caching.
- Cron Trigger plus Queues fits a twice-daily tick in chunks.
- One Durable Object per region suits live chat and vote tallies.
- Cost at this scale is close to the $5 floor if the schema is sensible.

**Real constraints.**

- **Write metering punishes normalised stats.** One row per nation per tick: 50,000 x 2 x 30 = 3M writes a month, inside the included 50M. One row per stat: 300M a month, about $250. Store each nation's stats as one packed row.
- **History hits the 10 GB cap.** A 2 KB snapshot per nation per day is about 36 GB a year. Keep recent history in D1, downsample older data, archive to R2.
- **D1 is single-threaded with no long transactions.** The tick must be chunked and idempotent, keyed by tick number, so a retried chunk cannot double-apply.
- **Worker memory is limited** (128 MB) [unverified], so do not load the whole world into one invocation.
- An independent comparison finds Cloudflare and a flat-price Hetzner server tied at about 10M writes a month, with Cloudflare about $58 dearer at 100M ([bex.co](https://bex.co/blog/2026/08/22/cloudflare-zero-egress-durable-objects-storage-bill-hetzner)).

### 4.3 Alternatives

| Option | Cost | For | Against |
|---|---|---|---|
| **One VPS with Postgres and one app process** | Hetzner CX23 about EUR 6 a month ([cloudhim](https://www.cloudhim.com/cloud-costs/hetzner-cx22-pricing-2026)) [snippet only] | The tick is one transaction in one process. Full SQL, window functions for rankings, no metering. This is roughly how NationStates has run for 24 years | You run backups, patching and failover. One box is one point of failure |
| **Workers plus external Postgres** (Neon, via Hyperdrive) | Neon Launch about $15 a month ([comparedge](https://comparedge.com/tools/neon-db/pricing)) [snippet only] | Edge delivery with a real relational database | Two vendors; cold starts; another bill |
| **Supabase** | $25 a month Pro, 8 GB database ([Supabase pricing guide](https://flexprice.io/blog/supabase-pricing-breakdown)) [snippet only] | Auth, storage and realtime included | Dearer; the tick still needs a worker somewhere |
| **Fly.io with managed Postgres** | From $38 a month for the database alone ([Fly](https://fly.io/mpg/)) [snippet only] | Long-running processes | Most expensive at this size |

### 4.4 Recommendation

**Stay on Cloudflare.** The developer's existing knowledge is worth more than the VPS's simplicity, and the scale is well inside the platform's limits. Conditions:

- **D1 is the single system of record.** One row per nation, stats packed. Append-only decision log. Per-tick snapshot table with a retention policy.
- **Tick:** Cron Trigger enqueues chunks of about 500 nations to Queues; each consumer is idempotent on (tick, chunk). A final job computes regional aggregates and rankings.
- **Durable Objects only for regions** (presence, chat, live vote counts). Do not make one object per nation: it turns every cross-nation query into a fan-out.
- **R2** for archived history and rendered share images. **Cache** public nation pages for the length of a tick.
- **Keep the simulation as a pure function** `(state, decisions, seed) -> state` in plain TypeScript with no platform imports. This allows replay, testing and balance changes, and makes a later move to Postgres a storage change only.
- **Front end:** server-rendered pages with light client code (SvelteKit or Astro on Workers), installable as a web app.
- **Escape hatch:** if analytics or history outgrow D1, add Postgres through Hyperdrive for those tables first.

Choose the single VPS instead only if the tick needs cross-nation computation that cannot be chunked, such as a market that clears across all nations at once. Section 2 argues against building that.

### 4.5 LLM cost

Prices read on 2026-10-01:

| Model | Input $/M tokens | Output $/M tokens | Source |
|---|---|---|---|
| Claude Opus 5.5 | 4.00 | 20.00 | [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) |
| Claude Sonnet 5 | 2.00 | 10.00 | same |
| Claude Haiku 4.5 | 1.00 | 5.00 | same |
| Gemini 3.5 Flash-Lite | 0.30 | 2.50 | [Google](https://ai.google.dev/gemini-api/docs/pricing) [not double-checked; confirm] |
| GPT-OSS 20B on Workers AI | 0.20 | 0.30 | [Cloudflare](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Llama 3.1 8B on Workers AI | 0.045 | 0.384 | same |

Anthropic and Google both give 50% off for batch jobs. Anthropic cache reads cost 0.1x input for the Sonnet and Haiku models above (0.05x for Opus 5.5).

**Scenario A, naive: LLM writes everything per player.** Assume 5 calls a day (4 bespoke issues and a summary), each 1,500 tokens in and 400 out.

| Model | Per call | Per daily player per month | 10,000 daily players per month |
|---|---|---|---|
| Sonnet 5 | $0.0070 | $1.05 | $10,500 |
| Haiku 4.5 | $0.0035 | $0.53 | $5,250 |
| Gemini 3.5 Flash-Lite | $0.00145 | $0.22 | $2,175 |
| GPT-OSS 20B (Workers AI) | $0.00042 | $0.06 | $630 |

The cheap end is affordable but gives the weakest writing in a game whose appeal is its writing. The good end costs more per player than a free web game earns. This is the trap.

**Scenario B, bounded: shared authored pool plus one flavour call.**

- **Issue pool, shared by all players.** Draft with the best model, edit by hand. About 30 new issues a week at about 10,000 tokens in and 3,000 out on Opus 5.5 is $0.10 a draft. With several revision passes, about $15 a week in total, whatever the player count.
- **Per-player flavour.** One batched call a day (800 in, 150 out) for a personal headline or timeline entry.

| Model (batch price) | Per daily player per month | 10,000 daily players per month |
|---|---|---|
| Haiku 4.5 | $0.023 | $233 |
| Gemini 3.5 Flash-Lite | $0.009 | $93 |
| GPT-OSS 20B (Workers AI, no batch discount assumed) | $0.006 | $62 |

**Scenario C, cached: no per-player calls.** Generate headline variants per (issue, option, nation archetype) once and store them, as Infinite Craft does. 2,000 issues x 4 options x 10 archetypes is 80,000 short texts: a one-off cost of roughly $50 to $100 on Haiku batch, then nothing per player.

**Ways to keep it bounded, in order of value.**

1. **Templates with generated flavour.** Effects are data; the model writes only the sentence. A failed or slow call falls back to the template.
2. **Pre-generate at tick time,** in batch, never in the request path. No player waits on a model, and batch pricing halves the bill.
3. **Global cache** keyed on (issue, option, archetype, relevant flags).
4. **Small model for flavour, large model for authoring.**
5. **Hard budget per tick** with graceful degradation to templates.
6. **Only active players.** Skip nations that have not logged in for three days.
7. **Structured output, state first.** The model receives the already-computed result and writes about it. It never decides an outcome.

**Recommendation: build with Scenario C, add Scenario B as a supporter perk.** Launch must work with the model switched off.

---

## 5. Ranked conclusions

### Worth stealing

| # | Idea | Source | Why |
|---|---|---|---|
| 1 | Deterministic simulation; LLM writes only flavour, from computed state, cached globally | Cicero, Bicking, Infinite Craft | Fixes the main complaint about LLM games and bounds cost |
| 2 | One-thumb card input with banked issues and a clear "done for today" | Reigns, NationStates, Wordle | Five-minute session without chore pressure |
| 3 | Factions and traits, so that history constrains choices, with a permanent nation timeline | Victoria 3, Crusader Kings 3, Suzerain | Turns stat drift into a personal story |
| 4 | Server-rendered share card and public nation page | Wordle | The only proven free growth loop in this survey |
| 5 | Permanent nations with seasonal world layers, and no accumulating power | NationStates cards, Travian versus OGame | Keeps attachment without veteran lock-in |
| 6 | Visible causal chains on the result screen | Democracy 3 and 4 | Players learn the model and trust it |
| 7 | Scarce regional roles and regional spillover | Particracy, Power | Makes other players matter without raiding |
| 8 | Player-written issues through an editorial queue | NationStates | Content pipeline and community status at once |

### Traps

| # | Trap | Evidence |
|---|---|---|
| 1 | LLM as the rules engine, or free-text input to a model | Pax Historia complaints, AI Dungeon costs and filter crisis, Bicking's review |
| 2 | Accumulating military or economic power in a permanent world, and selling it | CyberNations, Politics & War, eRepublik |
| 3 | Bolting a resource economy onto issue-answering | NationStates 2 |
| 4 | Open free-text social features at launch | UK Online Safety Act duties; AI Dungeon |
| 5 | Daily checklists and streak punishment | Neopets-style dailies; median day-30 retention under 1% leaves no room for resentment |
| 6 | Depending on web push for re-engagement | iOS install requirement |
| 7 | Thin grand strategy (map, armies) | Realpolitiks |
| 8 | One Durable Object or one row per stat per nation | Cloudflare write metering |

### Open questions not resolved here

- Current CyberNations and eRepublik active counts.
- NationStates revenue. No public figure found.
- Whether Pax Historia is profitable. The only margin analysis is speculative.
- Current EU status of home-screen web apps on iOS.
- Exact legal duties for a solo operator under the UK Online Safety Act, EU DSA and COPPA.
- Gemini prices: I have not double-checked these against the pricing page.
