# NationStates: player experience, retention, churn, complaints, history, IP posture

Written 2026-10-01. This is about the people who play NationStates (nationstates.net, Max Barry, launched 13 Nov 2002): why they stay, why they leave, what they complain about, and what happened the last time someone tried a deeper sequel.

## How to read this

- **Sourcing.** Most of it comes from the NationStates forum, the site's own FAQ / news / HISTORY / store / legal pages, Max Barry's blog, Wikipedia, and third-party write-ups.
- **Quotes are paraphrased, not verbatim.** I didn't want to copy other people's forum posts wholesale into my repo, so player and staff statements below are close paraphrases with the poster (where I could tell who it was) and the URL. There's one short verbatim quote in section 2. Every claim links to the page with the original wording.
- **Gaps, stated up front:**
  - **Nothing here comes from Reddit.** I didn't get through r/NationStates for this pass, so the Reddit side of the picture is missing. `05-design-notes.md` picks up a few threads.
  - **Hacker News has no substantive NationStates discussion.** The HN search API shows only a handful of submissions with 2 to 4 points and zero comments.
  - **No real demographic survey was found.** What exists is indirect (section 1).
  - **NSWiki (nswiki.org) and NSindex were unreachable** (connection refused / HTTP 410). NationStates 2 details lean on Max Barry's own posts plus one detailed forum account.
  - Where I didn't note who wrote a forum post, it's attributed as "a poster in [thread]".
  - Items marked **[unverified]** are either things I only saw in a search snippet and never opened, or single-source claims.

---

## 1. Who plays

### 1.1 Population over time

"Active nations" is the only public series. It counts nations, not people: one player may run dozens or thousands of puppets, so it overstates headcount, increasingly so after trading cards (2018) made puppet farming rewarding.

| Date | Active nations | Nations ever created | Source |
|---|---|---|---|
| 27 Nov 2002 (2 weeks in) | n/a | 3,200 | HISTORY |
| 10 Dec 2002 | n/a | 7,500 | HISTORY |
| Jan 2003 | n/a | about 40,000 | Jody Ewing interview (via search snippet) |
| Jul 2003 | 100k | 367,907 | HISTORY |
| Jun 2004 (move to Jolt hosting) | 110k | 804,903 | HISTORY |
| Jan 2006 | 120k | 1.55M | HISTORY |
| Mar 2008 | 75k | 2.27M | HISTORY |
| Jun 2009 (left Jolt, post-NS2) | 45k | 2.51M | HISTORY |
| Mar 2011 | 75k | 2.83M | HISTORY |
| 2012 | 90k to 115k | 3.3M | HISTORY |
| 2014 | 110k to 125k | 4.0M | HISTORY |
| 2016 | 135k (Jan) to 197k (Oct) | 4.5M | HISTORY |
| Nov 2022 | "as many players as ever" (Barry) | 8M | Barry blog |
| Jan 2026 | 329,305 | 9.7M+ | Wikipedia |
| May 2026 | 337,296 | n/a | Wikipedia (via search snippet) |

Sources: https://www.nationstates.net/HISTORY , https://maxbarry.com/2022/11/12/news.html , https://en.wikipedia.org/wiki/NationStates

Reading the curve:
- Explosive launch, a plateau around 100k to 120k through 2006, a slump to 45k by mid-2009 (the Jolt / NS2 period), then a long recovery. The trough coincides with the neglected-under-third-party-hosting era, and the recovery with self-hosting and a burst of features in 2009 to 2016.
- The HISTORY page stops at 2016. The jump from under 200k to 330k+ by 2026 overlaps with issue frequency doubling (2016), trading cards (2018) and puppet farming, so some unknown share of that growth is puppets rather than people. **[unverified how much]**
- Throughput is high and retention is low. Unibot's 2022 essay estimates roughly 1,000 to 1,500 nations created per day, with a large share relocating immediately and several hundred going dormant and dying within a month; net flow into the big default regions trends toward zero. https://forum.nationstates.net/viewtopic.php?f=12&t=526266
- The engaged core is tiny relative to the headline number. A 2019 gameplay essay puts regular Gameplay-forum participants in the low hundreds, on a site roughly a thousand times that size. https://forum.nationstates.net/viewtopic.php?f=12&t=462978
- Forum scale as of Jan 2024: about 33.1M posts, 443k threads, 1.8M registered users (Wikipedia).
- "Is NationStates dying?" is a perennial thread. A search snippet of one such thread has a veteran noting people have said so since 2005. https://forum.nationstates.net/viewtopic.php?f=12&t=544935

### 1.2 Demographics (thin evidence)

No formal survey found. Indirect signals:
- **Skews young.** Forum requires age 13+ (Terms). The site has a formal "NationStates for Educators" programme and classroom auto-registration since 2003/2004 (HISTORY, FAQ). Unibot describes many players as adolescents who use the game as a safe place to practise politics. Players describe finding it via teachers, lecturers and co-workers.
- **Skews male, Western, tech-interested, left-leaning among contributors.** An issues editor, answering a bias complaint, said the writing/editing team appears mostly male, heavily American and British, over-indexed on tech and pop-culture topics, and more left than right; he added that the player base shares the first three skews but is politically more mixed, so right-leaning players notice the bias. https://forum.nationstates.net/viewtopic.php?f=13&t=386514
- **Generationally young as a community despite the site's age.** Unibot's 2021 survey of Gameplay participants found about half had joined after 2016, with more respondents from 2020 alone than from 2002 to 2011 combined. (Self-selected survey, gameplay subculture only.)
- English-language only. Commenters on Barry's blog come from Australia, New Zealand, Belgium, Netherlands, US.

### 1.3 The tribes

The site is really a cluster of loosely coupled sub-games sharing an account system. Each tribe often barely interacts with the others.

| Tribe | What they do | What they get | Notes |
|---|---|---|---|
| Casual issue-answerers | Log in, answer up to a few issues a day, watch stats and rankings change | A low-effort daily ritual; a satirical mirror of their politics; trophies and badges | The majority by nation count. Many never join a region or the forum. Often called "single-player mode" by regulars |
| Stat/trophy chasers | Min-max census scales, use third-party issue-result databases | Rank, gold badges in top 1% | Depend on community tools; resent anything that would let stats be cloned |
| Roleplayers | Forum RP (International Incidents, NS Sports, etc.), factbooks, maps, lore | Collaborative fiction, long friendships, writing practice | The game mechanics are a prop. Wars, trade and diplomacy all exist here, as freeform text |
| Regional government players | Run for office, write constitutions, run courts, newspapers, foreign ministries | Real politics with real people: elections, coups, treaties | Mostly conducted off-site (forums, now Discord) |
| Raiders / defenders (R/D, "military gameplay") | Move WA nations en masse at the twice-daily update to seize or protect regional delegacies | Team competition with timing skill; ranks; esprit de corps | The only mechanical player-vs-player conflict. Depends on scripts and precise update timing |
| World Assembly authors | Draft and campaign for General Assembly law and Security Council commend/condemn/liberate resolutions | Legislative craft, a badge of authorship, influence | Heavy self-developed rule body; drafting now largely on Discord |
| Card collectors and traders | Open packs earned from issues, trade on a timed double auction, farm with puppets | Collection completion, market play | Explicitly cosmetic. Barely related to nation simulation |
| Issue authors and editors | Draft issues in Got Issues, a few become volunteer editors | Authorship credit, seeing their writing reach everyone | Staff say roughly 49 of 50 undrafted submissions are rejected **[unverified, search snippet]** |
| Tool builders | API clients, issue-result databases, recruitment bots, update-timing tools, card tools, browser extensions | Technical problem-solving, status as infrastructure | The site would be much thinner without them; also the source of several scandals |
| General-forum debaters ("NSG") | Argue real-world politics in the General forum | A moderated debate venue | Many of them barely play the game |
| Moderators / mentors / staff | Volunteer moderation, RP mentoring, issue editing | Stewardship | Some have served 10 to 20 years (Barry, 2022) |

Barry's own list of who made the site what it is names nearly all of these groups. https://maxbarry.com/2022/11/12/news.html

---

## 2. Retention: why people stay for years

The consistent answer from the creator, staff and veterans is that the game mechanics are not what retains people. The community and what it built on top are.

- **Barry (2022)** credits survival to: not selling the site (he says he came close, and believes a buyer would have squeezed users for a year until they left); volunteer moderators; a community that turned a nation-plus-chat site into intrigue, relationships, lore and rules; the minority who buy supporter upgrades and stamps; and cautious management of a 20-year-old Perl codebase. He says he does not fully understand the community part: he built a place to make a nation and talk, and the players did the rest. https://maxbarry.com/2022/11/12/news.html
- **Barry (2009)**, explaining why NS1 mattered more than the sequel: players reminisce about regions that rose and fell, betrayed delegates, infiltrated alliances and forum ideological battles; games can become universes that people live in. https://www.nationstates.net/page=news/2009/05/20/index.html
- **Barry (2008)** admitted he designed the original as a passing fancy that people would enjoy briefly and leave. Longevity was accidental. https://www.nationstates.net/page=news/2008/index.html
- **The "cardboard box" idea.** Unibot relays a saying popular among veterans: the game is an empty box, and people either ask where the game is, or climb in with friends and make it a fort or spaceship. He argues development should protect that blank-canvas quality. https://forum.nationstates.net/viewtopic.php?f=12&t=526266
- **A poster explaining why NS2 was the wrong idea**: NS's glory is that it is a blank slate; one person can be fighting a roleplayed war while another argues politics and another plays a fantasy hero; every attempt to bolt on conventional game features has been weak. https://forum.nationstates.net/viewtopic.php?p=18703656
- **Refuge Isle** (a prominent gameplayer): NS is a political simulator more than a nation simulator. The real game is regional and interregional politics: who is running for office, what crises are being started or solved, who is invading or liberating. None of it was coded; it arose from circumstance. https://forum.nationstates.net/viewtopic.php?f=15&t=536734

Long-time players in their own words (paraphrased, from comments on Barry's 20th-anniversary post, https://maxbarry.com/2022/11/12/news.html):
- **Radiatia** (New Zealand, joined 2008 after a politics lecturer recommended it): the site's impact on their life is hard to overstate; roleplay produced lifelong friendships, including some of the closest people in their life; it sharpened their political knowledge, which they connect to three years working in the NZ Parliament, and their writing.
- **Stijn** (Belgium): the one verbatim quote in these notes: "a game that turned into a hobby that turned into a third place". He rejects the sunk-cost explanation and attributes return visits to the flexibility of the platform, which had built a community footprint before Facebook existed.
- **towr** (Netherlands): NS led them to the novel, which led them to reading as a hobby.
- **Ben Turner** (Australia): played at launch, drifted away, came back years later to find the nation gone. This is the lapsed-player pattern and a reason nation restoration (added 2008) matters.
- **Barry in the comments**: there are people alive today because their parents met on the site.

Structural retention mechanisms worth copying:
1. **Tiny daily commitment, no punishment.** Nations cannot be attacked or destroyed; no micromanagement; taxes set themselves; population always grows (FAQ). You cannot fall behind. Inactivity deletion at 28 days (60 in vacation mode) with restoration available.
2. **Identity investment.** Name, flag, motto, custom fields unlocked at population milestones (250M, 500M, 750M, 1B), factbooks, a nation whose stats are a record of years of choices.
3. **Real offices with real power.** Delegates can eject and ban. Regions can be captured. Stakes are social but real, so politics is real.
4. **A legible ladder of roles** from resident to officer to delegate to WA author to commended nation.
5. **Player-authored content pipelines.** Players write the issues, the WA law, the dispatches. Barry notes over 400k dispatches by 2015. https://maxbarry.com/2015/12/08/news.html
6. **Rituals and shared events.** April Fools events every year (several became permanent: the World Assembly, trading cards, Cards Against NationStates), Z-Day zombie outbreak at Halloween, N-Day.
7. **An open API** that lets the community build its own infrastructure.
8. **Institutional continuity**: same owner, same rules ethos, same nations for two decades.

---

## 3. Churn: why new players leave

### 3.1 The "I answered issues and there was nothing else" pattern

This is the best documented churn path.
- **The Great Nevada Overlord** (June 2023) listed all actual gameplay and concluded: issues take about 20 minutes to clear and hours to refill; cards are niche; Cards Against NationStates is dead; the WA needs an email; the head-to-head challenge is not really a contest. There are no battles, no resource trade, no nation-level embassies, no military, no economy to run. If you do not enjoy roleplay and lore, you are out of luck. https://forum.nationstates.net/viewtopic.php?f=15&t=536734
- **Snaketown** (Oct 2016), recruited by a co-worker: built about six nations, planned to reach 1 billion population before joining a region, and by 600 million found it monotonous, estimating 90% of issues across the nations were repeats; asked whether paying unlocks more. https://forum.nationstates.net/viewtopic.php?f=13&t=390805
- A search snippet of the issue-frequency thread has players saying it is dull to hang around with nothing as rewarding as issues to do between refills. https://forum.nationstates.net/viewtopic.php?t=437513&f=15
- Veterans' standard reply is "join a region, try the forums, try roleplay". That is the churn in miniature: the real game is elsewhere, undiscoverable from the nation page, and requires social initiative from a stranger.

Note that Snaketown explicitly delayed joining a region until the nation was "ready". New players often treat the solo loop as a prerequisite to the social game, and burn out before reaching it.

### 3.2 Onboarding problems

- **No guided path.** The FAQ's answer to "what do I do" is essentially "it depends", and to "how do I win" a shrug. Charming, but it leaves the new player with a stat page and a timer. https://www.nationstates.net/page=faq
- **The interesting systems are invisible or gated.** WA membership needs email verification. Regions, endorsements, delegates, influence, the two WA chambers, R/D, frontiers versus strongholds and governors versus delegates all need a glossary. Community beginner guides open by acknowledging newcomers are overwhelmed by scope. https://www.nationstates.net/page=dispatch/id=1349785 (via search snippet)
- **The real game moved off-site.** Regional government, R/D operations and WA drafting now largely happen on Discord. Unibot's "discordification" essay argues this hollowed out in-game institutions and regional message boards. A newcomer who stays on-site sees an emptier game than the one veterans are playing. https://forum.nationstates.net/viewtopic.php?f=12&t=526266
- **Default placement is poor.** New nations spawn in giant feeder regions or, since 2023, in frontier regions. Unibot argues feeders are full of dead puppets with few people for a newcomer to engage, and that the most engaged newcomers are the ones recruited out.
- **Gated identity.** You cannot name your capital, leader or religion until hundreds of millions of population. You can never rename your nation (the name is effectively the primary key; staff say the handful of manual renames produced badly broken nations) and you cannot delete it, only let it expire. New players who picked a throwaway name are stuck. https://forum.nationstates.net/viewtopic.php?f=15&t=535940 , https://forum.nationstates.net/viewtopic.php?f=15&t=516998
- **Returning players are locked out.** One player on mobile nearly lost a nation simply by forgetting to log in. https://forum.nationstates.net/viewtopic.php?f=15&t=170703

### 3.3 Recruitment telegrams and the first hour

- The FAQ itself tells new players to expect a small flood of recruitment telegrams right after founding. It also tells recruiters that new nations are hit so fast by so many regions that messages are throttled, inboxes overflow, and newer telegrams push older ones out unread.
- The site's own published numbers: 10 to 20% of recruitment telegrams are blocked; 0 to 1% convert. So the first-hour experience is tuned around a channel with a conversion rate at or below one percent. https://www.nationstates.net/page=faq
- **Kolrand** (2015): it is annoying to get an automatic flood on every new nation; you can change telegram preferences, but several arrive before you realise you need to; asked for a setting at creation. https://forum.nationstates.net/viewtopic.php?f=15&t=353588
- Community beginner guides list "block recruitment telegrams" as the first thing to do. (search snippet of https://www.nationstates.net/page=dispatch/id=1349785)
- **The economics drive it.** Mass telegrams cost stamps, which are sold for real money and are one of the site's revenue lines. Regions that do not pay recruit by hand or by API bot. Recruitment is how user-created regions survive, so every region is incentivised to spam, and the site is incentivised to let them. A newcomer's first social contact is therefore a pile of near-identical adverts rather than a person.
- The same channel is used for political campaigning. A player reported being repeatedly mass-telegrammed and dispatch-tagged by a gameplay organisation urging them to unendorse a delegate, after asking them to stop. https://forum.nationstates.net/viewtopic.php?f=16&t=421586

---

## 4. Recurring complaints

### 4.1 UI and mobile

- The codebase is Perl from 2002. Frames were removed only in 2008. The default "Rift" theme dates from 2014/2015; "Century" from 2011. A separate mobile site (m.nationstates.net) launched in 2011. (HISTORY)
- **No official app, by policy.** Admin [violet] said building apps is not worth scarce development time given device fragmentation and store fees; the site will support an app someone else builds but will not build one. https://forum.nationstates.net/viewtopic.php?f=15&t=170703
- Mobile theme changes get picked at in detail (blurry flag banner, awkward notification bubbles). https://forum.nationstates.net/viewtopic.php?f=15&t=419641
- Heavy players rely on third-party extensions and scripts for things the UI does not do (puppet switching, bulk actions, keybinds).
- On the 20th-anniversary post, a UK user was reduced to using Barry's blog comments to report that the site was unreachable for some ISPs, saying it was the only way to reach someone in charge. A support-channel complaint more than a UI one, but telling.

### 4.2 Simulation shallowness

- By design: the FAQ says there is no micromanagement, you make broad policy choices, bureaucrats set taxes, population just grows.
- Refuge Isle's summary: issues are shallow and abrasive, they move stats, WA resolutions move stats by category, and that is where the simulation starts and stops.
- Stats are outputs with almost no feedback into what you can do next. There is no budget to balance, no constraint, no failure state. Players who want a nation simulator rather than a political chat platform bounce off.

### 4.3 Issues: repetition, forced and absurd outcomes

- **Repetition.** The pool is finite, later issues depend on your nation's state, and newer issues are weighted more heavily. Most issues can recur. In 2009 the site had 250 issues; 400 by 2015. Running several nations makes repetition obvious.
- **Extreme outcomes are intentional.** The FAQ states the world is realistic but more so, and everything gravitates to the most extreme outcome. It gives the canonical example of banning skateboards and seeing the insurance industry boom through a chain of knock-on effects, and of outlawing street racing and receiving a postcard about tyranny.
- **No option you agree with.** The FAQ's answer is to dismiss the issue. Options are written as caricatured advocates; moderate positions are usually absent.
- **Opaque stat effects.** A standing megathread exists for unexpected issue effects, with an FAQ covering why civil rights, taxes, inequality and weather move the "wrong" way, and a warning that people who have not read it will be mocked. https://forum.nationstates.net/viewtopic.php?f=13&t=424650
- **Periodic rebalances** ("Grand Rejiggeration" 2011, "Industry/Department Rejiggering" 2015) were needed to fix nonsensical results. (HISTORY)
- **Bias.** The FAQ concedes the simulation is very possibly biased toward the author's politics, though not intentionally. The issues editor quoted in section 1.2 concedes male, Western, tech and left skews in the writing team.
- **Scripted play.** Staff resisted faster or unlimited issues because bots can answer around the clock and humans cannot. https://forum.nationstates.net/viewtopic.php?t=437513&f=15

### 4.4 No real nation-to-nation interaction

- FAQ: nations cannot be damaged or destroyed by foreign powers. On adding war, Barry's long-standing FAQ answer is that he will not, because the rewrite would cost him the time he needs to earn a living and stay sane.
- War was the most requested feature from the start. A "NationStates 2" forum existed from April 2003. A veteran's account says players agreed war was the main thing missing, with trade a distant second. https://forum.nationstates.net/viewtopic.php?f=20&t=115540
- Embassies exist only between regions, and are cosmetic links plus cross-posting.
- Staff have refused region-conquers-region mechanics that would forcibly move players. https://forum.nationstates.net/viewtopic.php?f=4&t=446756
- Counter-view, widely held among veterans: mechanical war would destroy the blank slate (section 2), and NS2 proved it (section 6).
- Middle view: Unibot suggests what is missing is a source of scarcity between regions, such as an economic or trade layer, that would justify conflict, plus tools of aggression short of occupying a region. A poster in the gameplay thread proposed stat-derived resources and trade balance so that negotiation has an object.

### 4.5 Admin-built minigames feel hollow

Refuge Isle: seasonal events like N-Day, Z-Day and the trade fair fall into click, wait, click, with no thought or strategy, and are dominated by players with a thousand scripted puppets. Unibot: recent admin time goes into minigames that are too structured to allow the off-script creativity that made the site, and the best event (the 2012 IPO April Fools) was the one players broke.

### 4.6 Moderation controversies

- **Volunteer mods, ad hoc precedent.** A poster in a 2021 transparency thread says the rules document is not usefully written, that players learn the real rules from individual rulings, that criticising a mod risks being labelled bad-faith posting, and that permanent bans ("delete on sight") are issued without public reasons; they proposed a public list. https://forum.nationstates.net/viewtopic.php?p=38757474
- **Private telegram enforcement.** A 2016 petition (62 signatures) objected to bans for sexual content in private telegrams as a privacy violation. https://www.change.org/p/nationstates-moderating-team-the-moderators-have-gone-too-far-nationstates
- **Line-skating and report-gaming.** A forum regular gives a mixed verdict: strict moderation is justified for a politics forum, but some users stay just under the flamebait line to bait others, and serial reporters skew enforcement. https://forum.nationstates.net/viewtopic.php?t=546279
- **Mod culture complaints** include snark in warnings and a "locker room" private staff forum. **[unverified, search snippet]** https://forum.nationstates.net/viewtopic.php?p=16798151
- **Predator (March 2016).** A raider update tool was ruled to break script rules by design; moderators took the unprecedented step of returning many regions to their prior owners. **[search snippet]** https://forum.nationstates.net/viewtopic.php?f=12&t=465379
- **Jakker.** A former moderator suspected of misusing mod tools to look up IP data; Unibot's essay separately notes Jakker being forced out of a raider organisation in early 2021. **[search snippet; details unverified]**
- **Nazi-glorification policy.** Nations and regions mimicking Nazi Germany are removed on the ground that they inevitably appear to celebrate the Holocaust. Critics in the announcement thread called it a word ban that is trivially evaded, and complained about inconsistency toward far-left equivalents. https://forum.nationstates.net/viewtopic.php?p=38652577
- **Separatist Peoples (2025).** A long-serving moderator was stood down and given a delete-on-sight order for sharing internal staff messages publicly, during a period of personal bereavement; after community protest and an open letter the deletion was reversed as excessive. **[search snippet; exact date unverified]** https://forum.nationstates.net/viewtopic.php?f=9&t=567942
- **Moderators who also play gameplay** is a standing conflict-of-interest topic. https://forum.nationstates.net/viewtopic.php?f=12&t=531074
- A thread claiming Barry announced a shutdown over forum toxicity (April 2019) links to news URLs I could not verify and is dated around April Fools. Treat as a hoax. **[unverified, likely fake]** https://forum.nationstates.net/viewtopic.php?f=20&t=462299

### 4.7 Forum and community culture

- **General forum (NSG)**: real-world politics debate, with the usual consequences. Staff rejected a "like" button partly because it would turn ideological threads into popularity contests **[search snippet]**.
- **Gameplay "toxicity"** is a decade-long self-critique. The 2019 essay argues it is structural: a small invested group, few large events, influence gained by persuasion or attack, and an in-character/out-of-character line that does not hold once people are emotionally invested. It says no gameplayer has escaped an emotional toll. https://forum.nationstates.net/viewtopic.php?f=12&t=462978
- **Unibot's 2021 survey**: half of respondents called the gameplay scene toxic; over 70% agreed it was in a prolonged interregional peace and most thought that was bad; about two-thirds would be excited by a coup in a major region and a similar share said fear of ostracism deters it. His diagnosis: voice-chat intimacy across rival regions produced conformity, dead legislatures, and status competition through exclusion and leaked logs rather than through politics.
- **Historic safety problems.** Unibot states the early site shared the wider internet's problems of catfishing, harassment, manipulation and worse, affecting adolescents, and credits a 2019 player-led accord with improving safety. The search snippet of a "significant forum events" thread also references past paedophilia scandals. **[details unverified]**

### 4.8 Raiding and harassment

- The FAQ is candid that R/D is controversial: some exist for the thrill of conquest, others find it reprehensible, and founders should know about it before starting a region.
- Regions can be emptied and "refounded", erasing their history and handing permanent control to raiders. A WA condemnation draft credits one raider group with destroying over 100 regions. **[search snippet]** https://forum.nationstates.net/viewtopic.php?f=24&t=539308
- The FAQ bans "griefing" (playing chiefly to upset people), but the old natives-versus-invaders griefing rules were unenforceable and were replaced by the Regional Influence mechanic in 2006. A proposed harassment/griefing rule rewrite later went unanswered by staff, per the transparency thread.
- For the casual community that just wanted a clubhouse, being raided is non-consensual PvP. Staff's stock answer is to move or make a new region. https://forum.nationstates.net/viewtopic.php?f=4&t=446756
- **The opposite complaint also exists**: by 2021 raiders were losing, occupations rarely lasted more than a day, and defending had become the prestige side. https://forum.nationstates.net/viewtopic.php?f=12&t=509345 . Unibot notes no feeder coup since October 2019 and a coalition of major regions blacklisting raider organisations from events and media.
- Net: the one PvP system manages to upset its victims and bore its participants.

### 4.9 Frontiers / Strongholds (April 2023)

What it did: regions choose Stronghold (a Governor with a succession line; cannot be raided) or Frontier (no Governor, delegate rules, raidable, but new nations spawn there). Half of all new nations now spawn in Frontiers, split by a "magnetism" score; feeders' share was halved. A new Security Council "Injunction" can block a region switching status. (FAQ)

Reception:
- **Pre-launch support was lukewarm**: Unibot cites a poll with 37.5% plurality support.
- **Unibot's predictions (2022)**: too many frontiers would dilute spawns to insignificance; spawns are mostly dead or departing puppets anyway; frontiers would become rent-seeking fronts for stronghold communities, less interesting than feeders at their worst; it would not fix WA vote concentration; and it presumed an appetite for conflict the community no longer had. He also criticised it for being over-specified, prescribing how communities should behave.
- **Flanderlion** in the design thread: it had drifted from tempting regions to give up founders into making founder replacement easy, with no counterplay for natives once raiders install a governor. Admin Sedgistan said he liked finally having a route to permanent conquest that was not a history-erasing refound. https://forum.nationstates.net/viewtopic.php?p=38949114
- **Opposition at launch** from regions including Thaecia, Europeia and The Communist Bloc **[search snippet]**. The Communist Bloc's own dispatch shows the new Injunction tool immediately used as a weapon between established blocs. https://www.nationstates.net/page=dispatch/id=1868238
- **After 18 months**: The North Pacific's magazine blames the update for its declining WA numbers. The Wellspring, the first frontier, once took half of all spawns and ballooned past 1,500 nations in a day; as more frontiers appeared its share became negligible, endorsement levels left it exposed to raids, and it converted to a stronghold on 5 Oct 2024 after 535 days. Its leaders said manual and API recruitment was enough without spawns. The article says many frontiers have asked what the benefit actually is. https://www.nationstates.net/page=dispatch/id=2590662
- Verdict: the biggest structural update in 17 years largely played out as its critic predicted. It redistributed newcomers into regions less able to receive them and did not revive conflict.

### 4.10 Trading cards (2018)

- Began as the 2018 April Fools event and was kept. Every nation is a card; packs drop from answering issues; cards are explicitly cosmetic (FAQ).
- **Puppet farming** was the core problem from week three. Barry's April 2018 post: owning many decks is fine, but funnelling good cards to a main for almost nothing is corrosive in a game where your position depends on others' holdings. He declined to restrict cards to WA nations and declined to force market-price trades because gifting between friends is the point. His answer was a gift fee and a timed, snipable auction. https://www.nationstates.net/page=news/2018/04/19/index.html
- **It did not work.** A 2024 poster says farms are almost essential for any serious collection, tooling now makes farming easy, farms burden the servers and flood later seasons and minigames with junk nations. https://forum.nationstates.net/viewtopic.php?f=42&t=549353 . Other threads call farming an unfair advantage comparable to WA multi-accounting. https://forum.nationstates.net/viewtopic.php?f=15&t=458519
- Unibot: the card market is intriguing but static, limited to one item type and to whatever admins update.
- Side effect: cards reward mass puppet creation and scripted issue answering, inflating the active-nation count and polluting regions with dead nations.
- Still, cards have a devoted tribe and a deck-capacity upsell. A commenter on Barry's blog offered to pay real money for deck space.

### 4.11 Ads and monetisation

- **Revenue lines**: banner ads (Google Ads since 2009; first sidebar ad added by OMAC in May 2008), one-off upgrades and stamps. Current store: Supporter $2.99 (removes ads, permanent, reserves nation name, doubles deck capacity), Postmaster $4.99, Postmaster-General $9.99 (includes 500 stamps), and telegram stamps sold separately. https://www.nationstates.net/page=store
- Barry says most players never pay, that this is fine, and that the lights would not have stayed on without those who do.
- **Monetisation is gentle and mostly liked.** The complaint is structural: the one consumable is mass-telegram stamps, so the site earns money from the recruitment spam that degrades the new-player experience, and regions with paying members out-recruit those without. Stamps are consumed even when new-nation inboxes overflow (FAQ), which recruiters resent.
- Trading NS store items for anything is prohibited (rules on commercialism). https://forum.nationstates.net/viewtopic.php?f=15&t=546577
- The NS2 experience (section 6) made the community hostile to paywalled features. Custom flags being paid in NS2 is still cited.

### 4.12 Security and reliability

- **January 2026 breach.** A long-standing player with a bug-hunter badge, testing a flaw in the new Dispatch Search feature (added Sept 2025), went beyond authorised bounds and achieved remote code execution on the production server on 27 Jan 2026. Emails, MD5-hashed passwords, IP addresses and possibly telegrams were copied. The site was offline about six days for a rebuild. https://en.wikipedia.org/wiki/NationStates , https://nationstatestimes.blogspot.com/2026/01/jan-2026-site-outage-rolling-coverage.html , https://www.rescana.com/post/nationstates-data-breach-report-technical-analysis-of-the-2026-dispatch-search-vulnerability-and-rc
- MD5 password hashing in 2026 is the legacy-stack risk made concrete.

---

## 5. Long-requested features never delivered

Sourced from the Technical forum and FAQ. The Reddit side of this question could not be researched.

| Request | Status | Stated reason |
|---|---|---|
| War between nations | Refused since 2002 | FAQ: nations cannot be harmed; rewrite cost. Community split on whether it should exist |
| Trade / resources / economy between nations | Never | Same; tried only in NS2 |
| Nation-level diplomacy (embassies, treaties, alliances in mechanics) | Never; only region embassies | All done by roleplay or off-site |
| Region annexation / permanent conquest end-game | Partly via 2023 governor succession; annexation still wanted | Staff will not force players into regions |
| Rename a nation | Never | Name is the storage key; manual renames broke nations |
| Delete or reset a nation | Never | Barry prefers people upset they cannot restart to people upset by accidental deletion |
| Official mobile app | Never | Dev time, device fragmentation, store fees |
| Faster or unlimited issues | Raised from 2 to 4 per day in 2016; further increases resisted | Advantage to bots |
| More issues / less repetition | Ongoing, volunteer-limited | Editorial bottleneck |
| Telegram preferences at nation creation; less first-hour spam | Throttling added; no creation-time choice found | n/a |
| In-game regional government tools (elections, votes, legislatures, treasuries, taxes) | Polls (2014) and Regional Officers (2015) only | Unibot's wish list |
| Structured regional message boards (channels, private or archived sub-boards) | No | Pushed communities to off-site forums, then Discord |
| "Like" button on forum | Rejected | Popularity-contest risk |
| Open-sourcing the code / self-hosted or offline version | No | Barry said in 2009 he would release the source for free if he could no longer host |
| Public record of permanent bans and reasons | No | Staff do not want to give banned players notoriety |
| Fix for card puppet farming | Mitigations only | Barry will not restrict cards to WA nations |
| Making Warzones matter | No | FAQ thread notes they are little used |
| Historical activity charts | A player recalled one existing and could not find it | https://forum.nationstates.net/viewtopic.php?f=15&t=543499 |

Pattern: requests that need a data-model change (rename, delete, nation-to-nation relations) are structurally blocked by a 2002 flat-file-era design. Requests that need sustained engineering are blocked by a part-time owner and volunteer admins. That is the opening for a successor.

---

## 6. NationStates 2: the failed deeper sequel

### 6.1 Timeline

- **Apr 2003**: a "NationStates 2" forum is added to the site. Sequel discussion begins five months after launch. (HISTORY)
- **Jun 2004**: NS moves to Jolt Online Gaming (UK) hosting, including the forums. (HISTORY)
- **21 Apr 2008**: Barry announces NS2. He says the original was built as a passing fancy; NS2 is designed from day one for long-term play, keeps the principles (no micromanagement, diplomacy first, customisation) and greatly expands a nation's ability to affect its world. https://www.nationstates.net/page=news/2008/index.html
- **1 May 2008**: OMAC Industries (Dublin, owner of Jolt; Wikipedia dates the acquisition to June 2008) takes over hosting of NS1 and adds a sidebar ad.
- **10 Aug 2008**: NS1 players can reserve their nation name for NS2. Barry stresses NS2 will not replace NS1.
- **Aug 2008**: closed beta, about 500 invitees. **[search snippet of NSindex]**
- **3 Nov 2008**: open beta. **[search snippet]**
- **18 to 25 Feb 2009**: Barry moves NS1 off Jolt to self-hosting and says the dream of a professional studio delivering a great sequel did not work out, and NS1 now has little to do with NS2.
- **29 Apr to 7 Jun 2009**: NS1 builds its own forum; the Jolt forum is abandoned.
- **20 May 2009**: Jolt emails NS2 players that the game goes offline 1 July for architectural rework with no return date, citing stability problems from the growing economy, diplomatic networks and alliance complexity, and major design flaws, and points them to another Jolt title, Utopia Kingdoms. https://forum.nationstates.net/viewtopic.php?f=20&t=973
- **20 May 2009**: Barry's public statement (below).
- **1 Jul 2009**: NS2 goes offline. It never returns.
- **16 Mar 2012**: Jolt Online Gaming ceases trading. https://en.wikipedia.org/wiki/Jolt_Online_Gaming

### 6.2 What it was

A separate browser game, built by Jolt/OMAC under licence, that added the three things NS1 players had asked for since 2003: war, trade and alliances, plus more customisation, with paid premium features. Structurally:
- **Worlds instead of one shared world.** The trade engine required closed economies, so players were split into "Worlds" capped at roughly 300 nations, with no interaction between worlds.
- **Continents instead of player-made regions.** Nations were randomly assigned to a continent and could not move.
- **Trade** between nations inside a world.
- **War** added after the beta opened; strictly one nation versus one nation.
- **Alliances** as a formal feature.
- **Premium upgrades**, payable by card, SMS or PayPal. Things free in NS1, notably custom flags, cost money.

(Sources: veteran account at https://forum.nationstates.net/viewtopic.php?f=20&t=115540 ; search snippets of NSindex and MMO listing pages.)

### 6.3 Why it failed

**Design**
1. **It broke the social graph.** NS1 communities were regions of hundreds or thousands who had chosen each other. NS2 capped worlds at about 300, assigned continents randomly, and forbade moving, so friends could not play together and large regions and alliances could not transplant. The veteran account names this as what made players from large regions unhappy.
2. **The headline feature shipped late and bad.** The beta opened without war implemented. When war arrived it was one-on-one, which made alliances meaningless; attacking hurt the attacker more than the defender; results were unsatisfying. One poster said it was implemented so badly it was worse than having no war.
3. **Systems punished use.** Trade and war were broken enough that nations did best by using neither. **[search snippet]**
4. **It replaced the blank slate with a conventional game.** A later poster: the plan was to make NS a standard game in the mould of Civilization or SimCity, and that is exactly what NS is not.
5. **Simulation complexity outran the architecture.** Jolt's own shutdown email blamed the growing economy and diplomatic and alliance complexity for instability, and admitted major flaws in the underlying design.

**Execution**
6. **Buggy and unresponsive.** Players saw raw template errors and NULLs that were never fixed. Alpha testers reportedly said it was not ready for beta; the team was described as unresponsive to feedback from alpha onward. **[partly search snippet]** https://forum.nationstates.net/viewtopic.php?f=15&t=21608
7. **Launched against the creator's judgement.** The veteran account says the beta opened against Barry's wishes because he thought it unready.

**Business and trust**
8. **Monetisation before value.** Paid custom flags, billing complaints, and a report of contract terms being reworded unilaterally.
9. **Hostile community management.** The same veteran says a glowing promotional review drew damning comments from players and NS staff, and that he was IP-banned from the NS2 forum by the CEO for complaining.
10. **Owner/licensee breakdown.** Barry said Jolt had for months run NS2 without his authorisation, profiting from his trademark, domain and game design and paying him nothing; that he was told to push NS1 players to NS2; that Jolt's strategy was herding players from less to more profitable games; and that Jolt's flagship titles were reskins of other people's games under bought brand names. He called NS2 partly great but overall a pale, deformed version of his design, and said he had let it run rather than strand its players. https://www.nationstates.net/page=news/2009/05/20/index.html
11. **The acquirer changed the deal.** The relationship soured after OMAC bought Jolt and, per Wikipedia-derived summaries, pressed Barry to close NS1 and stopped royalties.

**It was not hated by everyone.** One player said they quite enjoyed it and that their world was active with a real community until the end. Barry said parts were great. The idea had an audience; the implementation and stewardship failed.

### 6.4 Consequences

- NS1 active nations bottomed at 45k in mid-2009. Self-hosting then triggered the most productive development run in the site's history (Security Council, commend/condemn, liberations, regional flags, custom fields, twice-daily updates, all in 2009).
- Barry concluded the experience had taught him how special the original was, and that games can be more than their revenue.
- The community acquired lasting antibodies: against outside ownership, against paywalled features, and against the idea that mechanical war improves the game.
- The original Jolt-era forum archive was eventually lost. https://forum.nationstates.net/viewtopic.php?f=20&t=75825

### 6.5 Lessons for a successor

1. **Do not shard the community to make the simulation tractable.** If the economy model requires small closed worlds, the model is wrong for this audience. Let people choose who they play with and move freely.
2. **Depth must be opt-in and must not be able to ruin a casual player's nation.** NS1's guarantee that nobody can damage your nation is a retention feature, not a missing feature.
3. **Ship the deep systems working, or not at all.** A bad war system is worse than none, and it retroactively devalues the alliances built around it.
4. **Conflict must be collective.** One-on-one war made the social layer irrelevant. The audience's actual game is coalition politics.
5. **Never make using a system the losing move.**
6. **Do not charge for identity.** Flags and customisation are the product's soul. Charge for convenience and cosmetics beyond the baseline.
7. **Players asked for war for five years and rejected it when it arrived.** Stated demand is not validated demand. Prototype with the real community before committing architecture.
8. **Keep the blank slate.** Add mechanics as scaffolding for player politics (scarcity, things worth negotiating over) rather than as a replacement for it.
9. **Stewardship is part of the product.** Unresponsive developers, banning critics and cross-promoting other titles killed trust faster than bugs did.
10. **Coexist; do not migrate.** Barry promised NS2 would not replace NS1. The moment the operator pushed migration, the community sided with the original.
11. **Control your own hosting, data and brand.** The sequel died in a licensing dispute, and the forum archive was lost with the host.

---

## 7. Other notable history

- **Origin.** Barry began development in August 2002 and launched 13 Nov 2002 as "Jennifer Government: NationStates" to promote his second novel, hoping it would not sink like his first. He was learning to code from a book. It spread by word of mouth, reached newspapers including the New York Times, hit 1,000 nations in two weeks and tens of thousands within two months. He cites an online political quiz as inspiration: he wanted to see what country his politics would produce and live with the consequences. The in-game UN was added in the 0.9 beta because testers said player interaction was missing. Sources: HISTORY, Barry blog, Wikipedia.
- **The Pacific coup (2003).** Francos Spain seized the delegacy of the oldest region, ejected large numbers of nations and founded the New Pacific Order, the template for two decades of regional authoritarianism, coups and resistance. **[search snippet]**
- **Regional Control (Apr 2003)** gave delegates and founders eject/ban powers; **player-submitted issues** (Jul 2003); **Warzones** (2004).
- **Regional Influence (Apr 2006)** replaced unenforceable anti-griefing rules with a mechanic, the biggest gameplay change until 2023.
- **UN cease and desist (2008).** The UN's letter, dated 21 Jan 2008, demanded the game stop using its name and emblem. Barry published it on 31 Mar / 1 Apr 2008 as that year's April Fools announcement, renaming the body the World Assembly, then revealed on 2 April it was real. He considered fighting, but his lawyer told him he was in the wrong (he had used the real name and emblem to signal "this is like the real UN", not as parody), and he says he supports the UN anyway. The NS UN had passed 244 resolutions. Old UN bans were not carried over. https://maxbarry.com/2008/04/02/news.html , https://www.techdirt.com/2008/04/10/un-tells-online-game-it-cant-have-a-fake-united-nations/
- **2009**: the year of the Jolt split, NS2's death, a new forum and the Security Council. Barry's year-end post mentions one new feature that provoked howls of protest still echoing; context suggests the Security Council / commend and condemn mixing gameplay into the WA. **[my inference]**
- **2011 to 2016**: second update, embassies, factbooks, API, store (2012), new telegram system with mass telegrams and stamps (2013), dispatches and polls (2014), Rift theme and regional officers (2015), issues doubled to four a day and live rankings (2016).
- **April Fools tradition**: fake regional moderators (2007), the real UN letter (2008), Nintendo DS port (2009), an IPO (2012, which players subverted), Z-Day zombies (2013, now an annual Halloween event), a fake cryptocurrency (2014), Cards Against NationStates (2015), WA Secretary-General election (2016, now a real feature per the FAQ), trading cards (2018).
- **Predator scandal (2016)**, **Nazi-glorification policy**, **Protecting Our Players Accord (2019)**, **the "Long Peace" from late 2019**, **Frontiers/Strongholds (Apr 2023)**, **Separatist Peoples affair (2025)**, **January 2026 breach**: see section 4.
- **Academic attention**: papers on NS and neoliberalism / the cultural public sphere, and Lars Konzack's reading of it as a philosophical game with a libertarian tilt (Wikipedia).

---

## 8. IP posture

### 8.1 What Barry and the site have said

- **Ownership asserted.** In the 2009 NS2 statement Barry described Jolt as profiting from his trademark, domain name and original game design. The Terms state that non-user-submitted site content is copyright Max Barry, governed by the law of Victoria, Australia. https://www.nationstates.net/page=legal
- **Whether "NationStates" is a registered trademark is unverified.** Searches of general web sources found no registration record; I did not query USPTO or IP Australia directly. Barry may have meant unregistered rights. **Check the registers before choosing a name.**
- **He has licensed the name once, commercially, and regretted it.** That is the only known use of the name by another game.
- **Open-source pledge.** In 2009 he said he had always maintained he would release the source for free if he could no longer host the game, because he is not in it for the money. Not done, since the site is still hosted. Players still ask.
- **Derivative works.** A clause added 1 April 2023 has users grant other users the right to make derivative works of certain labelled content, and submit them back to NationStates. This covers user content on the site, not the game.
- **User-written issues and dispatches** are licensed to the site non-exclusively. The issues corpus is not free to reuse.
- **Third-party apps**: admin has said the site would support a mobile app built by someone else. The API is open with rate limits and user-agent rules.
- **No statement about clones or fan games was found.** I found no instance of Barry or staff commenting on, objecting to, or blessing an NS-like game, and no takedown. **[absence of evidence; unverified]** The forum has an advertising policy and commercialism rules.
- **He has been on the receiving end.** The UN letter is a direct precedent: he used someone else's name and emblem to signal resemblance, was told by his own lawyer he was wrong, and renamed. He also handles copyright complaints about user content (a 2015 post describes one over an image in a dispatch).

### 8.2 What clones and inspired games did about naming

| Game | Year | Relationship | Naming |
|---|---|---|---|
| NationStates 2 | 2008 to 2009 | Licensed sequel by Jolt/OMAC | Used the name under licence; Barry later said the use had become unauthorised |
| Cyber Nations | 2006 | Nation sim with war, trade, alliances; widely seen as NS-descended; alliances reused NS region names (a "New Pacific Order" exists there) | Distinct name |
| Politics and War | 2013/14 | Its creator cites Cyber Nations; "third generation" | Distinct name |
| eRepublik, Simcountry, others | various | Listed as alternatives | Distinct names |
| Country Simulator (countrysimulator.org) | recent | Decision-card nation sim that markets itself as an NS alternative | Distinct name; uses "NationStates alternative" comparatively in SEO pages |
| PolisForge | 2026 | New browser nation builder marketing zero monetisation | Distinct name; comparative marketing |
| "NationStatesClone" (GitHub, mvassilevsky) | hobby | Code clone project | Uses the name descriptively in a repo title; no sign of commercial use or of objection |

Sources: https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/PoliticsAndWar , https://alternativeto.net/software/nationstates , https://countrysimulator.org/alternatives-to-nationstates/ , https://www.polisforge.online/Blog/Browser-Nation-Building-Games , https://github.com/mvassilevsky/NationStatesClone

Observed norm: every commercial or public successor picks its own name and at most says "like NationStates" or "NationStates alternative". Nobody ships under the NationStates name, and nobody copies issue text.

### 8.3 Practical reading (not legal advice)

- Mechanics and genre (answer dilemmas, stats shift, regions, a world legislature) are not protected and have been freely imitated for 20 years.
- Avoid: the name "NationStates" or confusingly similar marks; "World Assembly" and other distinctive coined terms; the issue texts (Barry's and players'); census scale names and the well-known classification names; visual trade dress; "Jennifer Government".
- Do not repeat Barry's UN mistake by naming an in-game body after a real institution or using a real emblem.
- "Spiritual successor to NationStates" as comparative description is how others handle it. A courtesy note to Barry would be cheap: he is reachable through his blog, the community is fiercely loyal, and his stated values (not in it for money, would open-source rather than let it die) suggest goodwill is available and worth having.

---

## 9. Synthesis for a successor

**What to keep**
1. The nation as a safe, permanent, expressive identity that nobody can wreck.
2. A two-minute daily loop with satirical, well-written dilemmas.
3. Real social power: offices that can be won, lost and abused.
4. The blank slate. Give tools, not scripts.
5. Player authorship of content and law, with editorial quality control.
6. An open API from day one.
7. Gentle, non-pay-to-win monetisation and an owner the community trusts.

**What to fix**
1. The cliff after the first week. Surface the social game inside the core loop instead of behind "join a region".
2. First-hour experience. Replace the telegram flood with curated matching, and do not sell the spam channel.
3. Give regions the governance tools they currently borrow from Discord: elections, votes, structured boards, treasuries, roles.
4. Give regions something to negotiate over (scarcity, trade, shared projects) so diplomacy has an object, with conflict that is collective, opt-in, reversible and not history-erasing.
5. Simulation with feedback: choices should constrain later choices, and stat changes should be explainable.
6. Many more issues, less repetition, moderate options, transparent effects.
7. Mobile-first UI; renames, resets and deletions as basic account hygiene; a modern data model keyed on IDs.
8. Puppets: design for them explicitly (first-class alt management, or systems where multi-accounting gives no edge) rather than fighting them after the fact.
9. Moderation with published reasons and an appeals record.
10. Modern security from the start.

**What NS2 says not to do**: shard the world, force placement, paywall identity, ship broken war, make conflict one-on-one, let a publisher own the relationship with players.

---

## 10. Source list

Primary (read directly)
- https://www.nationstates.net/HISTORY
- https://www.nationstates.net/page=faq
- https://www.nationstates.net/page=legal
- https://www.nationstates.net/page=store
- https://www.nationstates.net/page=about
- https://www.nationstates.net/page=news/2008/index.html
- https://www.nationstates.net/page=news/2009/index.html
- https://www.nationstates.net/page=news/2009/05/20/index.html
- https://www.nationstates.net/page=news/2018/04/19/index.html
- https://www.nationstates.net/page=dispatch/id=1868238
- https://www.nationstates.net/page=dispatch/id=2590662
- https://maxbarry.com/2022/11/12/news.html
- https://maxbarry.com/2008/04/02/news.html
- https://maxbarry.com/2015/12/08/news.html
- https://forum.nationstates.net/viewtopic.php?f=12&t=526266 (Unibot, Death and Denial)
- https://forum.nationstates.net/viewtopic.php?f=15&t=536734 (Should NS have more gameplay?)
- https://forum.nationstates.net/viewtopic.php?f=20&t=115540 (What was NS2?)
- https://forum.nationstates.net/viewtopic.php?p=18703656 (Was there an NS2 that failed?)
- https://forum.nationstates.net/viewtopic.php?f=20&t=973 (Jolt closes NS2)
- https://forum.nationstates.net/viewtopic.php?f=15&t=21608 (NS2 memories)
- https://forum.nationstates.net/viewtopic.php?f=15&t=353588 (recruitment telegrams on new nations)
- https://forum.nationstates.net/viewtopic.php?f=13&t=390805 (same issues over and over)
- https://forum.nationstates.net/viewtopic.php?f=13&t=386514 (issue bias)
- https://forum.nationstates.net/viewtopic.php?f=13&t=424650 (unusual issue effects)
- https://forum.nationstates.net/viewtopic.php?t=437513&f=15 (issue frequency)
- https://forum.nationstates.net/viewtopic.php?f=15&t=170703 (app)
- https://forum.nationstates.net/viewtopic.php?f=15&t=419641 (mobile theme)
- https://forum.nationstates.net/viewtopic.php?f=15&t=535940 and t=516998 (renaming)
- https://forum.nationstates.net/viewtopic.php?f=4&t=446756 (player idea list)
- https://forum.nationstates.net/viewtopic.php?f=42&t=549353 (card farms)
- https://forum.nationstates.net/viewtopic.php?p=38949114 (Frontiers design thread)
- https://forum.nationstates.net/viewtopic.php?f=12&t=509345 (Raiding: what now?)
- https://forum.nationstates.net/viewtopic.php?f=12&t=462978 (toxicity in gameplay)
- https://forum.nationstates.net/viewtopic.php?p=38757474 (moderator transparency)
- https://forum.nationstates.net/viewtopic.php?t=546279 (what do you think of the mods)
- https://forum.nationstates.net/viewtopic.php?p=38652577 (Nazi glorification policy)
- https://forum.nationstates.net/viewtopic.php?f=16&t=421586 (telegram spam)
- https://forum.nationstates.net/viewtopic.php?f=15&t=546577 (commercialism rules)
- https://forum.nationstates.net/viewtopic.php?f=12&t=544935 (is NS dying)

Secondary
- https://en.wikipedia.org/wiki/NationStates
- https://en.wikipedia.org/wiki/Jolt_Online_Gaming
- https://www.techdirt.com/2008/04/10/un-tells-online-game-it-cant-have-a-fake-united-nations/
- https://www.superjumpmagazine.com/nationstates-browser-based-games/
- https://nationstatestimes.blogspot.com/2026/01/jan-2026-site-outage-rolling-coverage.html
- https://www.change.org/p/nationstates-moderating-team-the-moderators-have-gone-too-far-nationstates

Known only through search snippets (not opened; treat as leads)
- NSindex / NSWiki NationStates 2 pages; forum threads on Predator, Separatist Peoples, moderator corruption and policy critique, card puppet farms (t=458519), Brotherhood of Malice condemnation, significant forum events; Jody Ewing interview; breach technical write-ups.

Not accessible
- Reddit (all of it), web.archive.org, nswiki.org, nsindex.net, tvtropes NationStates page.
