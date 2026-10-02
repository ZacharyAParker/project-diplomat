# NationStates: how the existing game works (mechanics reference)

Written 2026-10-01. I wanted one place that explains every system well enough that someone who has never played could rebuild it.

## How to read this document

- **[P]** = primary source (nationstates.net page, official API doc, News post, or staff forum post), read directly on 2026-10-01.
- **[C]** = community source (player dispatch, player forum post, third-party site). Usually right, but reverse-engineered.
- **[U]** = could not verify; treat as a lead, not a fact.
- nswiki.org was down and the Fandom wiki was paywalled when I looked, so neither is used here. I also didn't go through r/NationStates for this one.
- Live numbers were read from the public API on 2026-10-01.

The game changed substantially in 2023 (Frontiers/Governors) and again in 2026 (General Assembly reset, opt-in adoption, WA Secretariat). Most older guides, including Wikipedia, describe the pre-2026 World Assembly.

---

## 1. Snapshot

| Item | Value | Source |
|---|---|---|
| Launched | 13 Nov 2002 by novelist Max Barry, to promote *Jennifer Government* | [Wikipedia](https://en.wikipedia.org/wiki/NationStates), [About](https://www.nationstates.net/page=about) [P] |
| Active nations | 332,799 | API `q=numnations` [P] |
| Regions | 33,781 | API `q=numregions` [P] |
| Nations ever created | passed 10,000,000 on 3 Sep 2026 | [News](https://www.nationstates.net/page=news) [P] |
| WA members / Delegates | 15,485 / 715 | API `wa=1&q=numnations+numdelegates` [P] |
| Issues in game | "over 1,850 ... with a combined total of over 7,000 choices" (Aug 2026) | [News](https://www.nationstates.net/page=news) [P] |
| World Census scales | 90 (IDs 0-89) | API [P] |
| API version | 13 | API `a=version` [P] |

Only about 4.7% of active nations are in the World Assembly. Most of the population plays the single-player issues game, and many nations are "puppets" (extra nations run by one player).

Design stance, from the [FAQ](https://www.nationstates.net/page=faq) [P]: no win condition; nations cannot be attacked, damaged or destroyed by other players; no micro-management ("You control your nation's destiny by making broad policy decisions, not tweaking numbers"); regions, unlike nations, *can* be captured and destroyed.

---

## 2. Nation creation

Source: the live [create-nation page](https://www.nationstates.net/page=create_nation) [P].

- **Ideology presets** ("Freedom"): Anarchic, Libertarian, Capitalist, Liberal, Centrist, Conservative, Socialist, Authoritarian, Tyrannical, plus "Surprise Me!". These pre-fill the questionnaire.
- **Eight statements**, each answered Strongly Disagree / Disagree / Agree / Strongly Agree:
  1. A country should be judged by how it treats its worst-off citizens.
  2. Corporations are good for society.
  3. Marijuana should be legal.
  4. The world needs to rediscover its spirituality.
  5. Young people should perform a year's compulsory military service.
  6. Capitalism is on the way out.
  7. Without democracy, a country has nothing.
  8. It's better to deter criminals than rehabilitate them.
- **"History" flavour pick**, e.g. "Violent Segregationists", "Recently Discovered Undiscovered Tribe", "Plucky, Malnourished Pioneers", "Civil Bloodbath Survivors".
- The form is two pages. Page 2 (name, flag, motto, currency, animal, pretitle) I didn't write down.
- Since July 2016 the form previews "the likely effects of your ideological choices" before founding, and has a random name generator ([News 2016](https://www.nationstates.net/page=news/2016)) [P].
- Starting population is 5 million ([News 2016](https://www.nationstates.net/page=news/2016) [P]: "five million people have to live there forever").
- New nations spawn in a Feeder or a Frontier region (see section 6).

**Seeding formula [U].** Player guides say the questionnaire "determine[s] the initial ratings of the country's civil, economic, and political rights" ([dispatch 444406](https://www.nationstates.net/page=dispatch/id=444406)) [C]. The mapping from eight answers to starting values is not published. Whether the "History" pick affects stats is unknown.

**Custom fields unlock by population** ([FAQ](https://www.nationstates.net/page=faq)) [P]:

| Population | Unlock |
|---|---|
| 250 million | Capital City issue (#241); also the minimum to submit an issue |
| 500 million | Custom pretitle in Settings |
| 750 million | Leader issue (#242) |
| 1 billion | Faith issue (#243) |

The unlock issues arrive immediately on reaching the threshold. Not every option unlocks the field; dismissing leaves it locked and the issue returns later ([Got Issues FAQ](https://forum.nationstates.net/viewtopic.php?f=13&t=424657)) [P].

**Purely cosmetic:** name, pretitle, motto, flag, currency name, national animal, demonyms, leader, capital, religion, banner. They appear in text (issue macros such as `@@CURRENCY@@`, `@@ANIMALPLURAL@@`) but nothing found suggests they alter stats. There are keyword "easter eggs" on nation fields that award badges [C].

**Lifecycle** ([FAQ](https://www.nationstates.net/page=faq), [Store](https://www.nationstates.net/page=store)) [P]:
- Nations cannot be deleted by their owner.
- 28 days without login: the nation "ceases to exist" (CTE). Vacation Mode extends this to 60 days and stops issues.
- A CTE'd nation can be restored with its password; ex-nations are listed in the "Boneyard".
- After five years of inactivity, names of nations under 1 billion population may be released for re-use; the old nation becomes permanently "Ancient". Supporter nations are exempt.

---

## 3. Classification: the 27 categories

The World Census classifies each nation "according to the amount of personal, economic, and political freedom" ([FAQ](https://www.nationstates.net/page=faq)) [P]. Three axes, three bands each, 27 names.

The API exposes each axis as a 0-100 score (`FREEDOMSCORES`) and as a word (`FREEDOM`). Example, Testlandia: Civil Rights 57 "Average", Economy 90 "Powerhouse", Political Freedom 71 "Excellent", category "Inoffensive Centrist Democracy" [P].

Category table, assembled from two player sources that agree ([forum t=50482](https://forum.nationstates.net/viewtopic.php?f=5&t=50482), [dispatch 1251219](https://www.nationstates.net/page=dispatch/id=1251219)) [C]:

| Civil rights | Political freedom | Economic freedom HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| High | High | Anarchy | Civil Rights Lovefest | Left-wing Utopia |
| High | Medium | Capitalizt | Left-Leaning College State | Scandinavian Liberal Paradise |
| High | Low | Benevolent Dictatorship | Libertarian Police State | Iron Fist Socialists |
| Medium | High | Corporate Bordello | New York Times Democracy | Liberal Democratic Socialists |
| Medium | Medium | Capitalist Paradise | Inoffensive Centrist Democracy | Democratic Socialists |
| Medium | Low | Compulsory Consumerist State | Father Knows Best State | Corrupt Dictatorship |
| Low | High | Free-Market Paradise | Conservative Democracy | Tyranny by Majority |
| Low | Medium | Right-wing Utopia | Moralistic Democracy | Authoritarian Democracy |
| Low | Low | Corporate Police State | Iron Fist Consumerists | Psychotic Dictatorship |

Caveats:
- **Band thresholds [U].** One search snippet gave roughly 0-35 / 35-72 / 72-100 for civil and political, and about ±67 for economic freedom. I could not open the underlying page.
- **Which economic axis [U].** The category appears to use *Economic Freedom* (census scale 48), not *Economy* (scale 1, economic strength). Testlandia has Economy 90 yet is "Centrist", which fits that reading, but I did not find a primary statement.
- Each axis has a 15-step descriptor ladder. Economy runs Imploded, Basket Case, Fragile, Weak, Struggling, Developing, Reasonable, Fair, Good, Strong, Very Strong, Thriving, Powerhouse, All-Consuming, Frightening. Civil and political run Outlawed, Unheard Of, Rare, Few, Some, Below Average, Average, Good, Very Good, Excellent, Superb, World Benchmark, Excessive, then Frightening / Widely Abused / Corrupted at the top ([dispatch 246464](https://www.nationstates.net/page=dispatch/id=246464)) [C].

---

## 4. Issues

### 4.1 Delivery

- Four issues per day, one every six hours, if the setting is "No Throttle". Before March 2016 it was two per day ([Got Issues FAQ](https://forum.nationstates.net/viewtopic.php?f=13&t=424657)) [P].
- A nation holds at most five unanswered issues; new ones stop until space frees up ([FAQ](https://www.nationstates.net/page=faq)) [P].
- Since Feb 2016, legislation is enacted immediately on answering, with instant newspaper headlines and before/after census values. Previously answers resolved at the next update ([News 2016](https://www.nationstates.net/page=news/2016)) [P].
- Staff give three reasons for not going faster than four per day: how many descriptors fit on a nation page, fairness of census rankings, and avoiding repetition [P].
- Issues repeat. Nations eventually re-receive issues they have answered [P].
- Players cannot review their full answer history; only recent effect lines show on the nation page [P].

### 4.2 Anatomy

From the [Submission Guidelines](https://www.nationstates.net/pages/submit_issue_guidelines.html) and [Got Issues FAQ](https://forum.nationstates.net/viewtopic.php?f=13&t=424657) [P]:

- **Title**: a tabloid-style headline, usually a pun.
- **Description**: a neutral sentence or two.
- **Validity**: which nations may receive it.
- **Options**: typically 2-5, record 11. Each is a short speech by a named advocate. Standard shapes are for / against / compromise or absurd "third way".
- **Effect line** per option: a lower-case clause that slots into "Following new legislation in X, ..." on the nation page.
- **Stats** per option: written by editors, hidden from players.
- **Macros**: `@@NAME@@`, `@@CURRENCY@@`, `@@RANDOMNAME@@`, `@@HE@@`/`@@HIS@@`, `@@CAPITAL@@`, `@@MAJORINDUSTRY@@`, `@@ANIMALPLURAL@@` and others.
- **Dismiss**: always available, does "absolutely nothing" to the nation. Staff explicitly deny the myth that it slows population growth [P].

House style rules worth copying [P]:
- Every option must have pros and cons; no "right" answer.
- "Player autonomy": never tell the player what their leader thinks, does or has done.
- Effect lines must never contradict the direction of the choice.

### 4.3 Validity and policies

- A validity is a predicate on nation state. "Nearly anything that shows up as a policy for your nation can end up as a validity" [P].
- Examples named by editors: Atheism, Autarky, Metricism, No Aircraft, No Automobiles, No Capitalism, No Computers, No Judiciary, No Internet, No Marriage, No Sports, Vat-Produced Infants.
- Validity can apply to a whole issue or one option. "Doppelganger options" are two variants of one option, shown either/or depending on validity.
- **Policies** (added Nov 2017) are named boolean flags on a nation, grouped as Government, Society, Law & Order, Economy, International. Issue results report policies gained or removed ([News 2017](https://www.nationstates.net/page=news/2017)) [P]. Eight more were added in Sep 2026, e.g. Compulsory Vote, Gold Standard, Referendums.
- **Postcards** (formerly "banners") unlock when a nation reaches a particular state; a small step can tip a nation over the line ([FAQ](https://www.nationstates.net/page=faq)) [P].
- Special options: some remove the nation from the WA, and issues #110 and #192 have an option that "dissolves the government" with drastic effects. Both show a confirmation pop-up [P].

### 4.4 Chains

- A chain is "three or more issues ... coded to run sequentially, often but not always with divergent paths" ([forum search result for t=436957](https://forum.nationstates.net/viewtopic.php?f=13&t=436957)) [C]. I read only the search snippet, not the thread.
- How follow-ups are scheduled or how chain state is stored is not documented [U].

### 4.5 Authoring pipeline

All from the [Got Issues FAQ](https://forum.nationstates.net/viewtopic.php?f=13&t=424657) [P]:

1. Players with 250 million+ population submit through an in-game form.
2. Authors are urged to draft publicly in the "Got Issues?" forum for at least two weeks. About 49 of 50 undrafted submissions are rejected.
3. Volume is "a hundred or more" submissions per week. Rejections are silently deleted with no notice.
4. Accepted submissions wait in a "Pool" until an editor rewrites them and codes stats. Multiple editors review each one.
5. On publication the author gets the issue regardless of validity, plus an "Issues Author" badge.
6. An annual Issues Contest (June, 10 winners, one entry each) guarantees publication. A themed contest ran in autumn 2026.

The team is 22 volunteer Issues Editors under a Content Director. Editors are invited, not hired by application.

### 4.6 The hidden effects model

What is officially stated:
- "Is there an official list of all the statistical effects of the issues? No. These are deliberately kept secret." [P]
- Effects depend on the nation's current state. Reaffirming the status quo may change nothing; a sharp reversal changes a lot ([FAQ](https://www.nationstates.net/page=faq)) [P].
- Second-order effects are intended: banning skateboards leads to unhappy teens, youth crime, public fear, and insurance sales [P].
- "Everything tends to gravitate to the most extreme outcome", which also makes decisions easy to reverse [P].
- The answer response (API `c=issue`) returns `DESC`, `RANKINGS`, `UNLOCKS`, `RECLASSIFICATIONS`, `NEW_POLICIES`, `REMOVED_POLICIES` ([API docs](https://www.nationstates.net/pages/api.html)) [P].
- Since 24 Sep 2026 results are shown as a sectioned "Decision Impact Report"; clicking a scale gives "a deeper analysis" of why it moved ([News](https://www.nationstates.net/page=news)) [P].

What the community has reverse-engineered:
- [NationStates Issue Results](http://www.mwq.dds.nl/ns/results/) (maintained by Trotterdam) lists issues #0 to #1869 with observed per-option census changes, crowd-sourced from players [C].
- Its data shows how state-dependent effects are. Issue #0 option 1 ("voting is voluntary") has a mean Political Freedom change of +2.80 but an observed range of -12.56 to +16.33, and touches dozens of scales [C].
- The same site catalogues policies and "notabilities".
- A megathread collects [unusual issue effects](https://forum.nationstates.net/viewtopic.php?f=13&t=424650) for editors to fix [P].

Inference: options modify hidden base variables, and census scales are derived functions of those variables. That is why one option moves 60+ scales and why results vary by nation. The base variables and formulas are not public [U].

---

## 5. World Census and the stat model

### 5.1 Scales

90 scales, each with a joke unit, a title and a ranking name ("Most X"). Full list read from the API (`q=censusname+censusscale+censustitle;scale=N`) [P]:

| Group | IDs and titles |
|---|---|
| Core freedoms | 0 Civil Rights, 1 Economy, 2 Political Freedom, 48 Economic Freedom, 53 Authoritarianism, 45 Ideological Radicality, 67 Averageness |
| Demographic | 3 Population, 5 Death Rate, 44 Lifespan, 39 Health, 61 Obesity, 56 Employment |
| Economy | 76 Economic Output, 72 Average Income, 73 Income of Poor, 74 Income of Rich, 85 Disposable Income, 4 Wealth Gaps, 33 Income Equality, 49 Taxation, 50 Freedom From Taxation, 79 Black Market, 31 Business Subsidization |
| Industries | 10 Automobile Manufacturing, 11 Cheese Exports, 12 Basket Weaving, 13 Information Technology, 14 Pizza Delivery, 15 Trout Fishing, 16 Arms Manufacturing, 18 Beverage Sales, 19 Timber Woodchipping, 20 Mining, 21 Insurance, 22 Furniture Restoration, 23 Retail, 24 Book Publishing, 25 Gambling; sectors 17 Agriculture, 26 Manufacturing |
| Government | 27 Government Size, 28 Welfare, 29 Public Healthcare, 30 Law Enforcement, 46 Defense Forces, 57 Public Transport, 75 Public Education, 78 Foreign Aid, 51 Corruption, 52 Integrity |
| Society | 6 Compassion, 7 Eco-Friendliness, 8 Social Conservatism, 9 Nudity, 32 Religiousness, 62 Secularism, 34 Niceness, 35 Rudeness, 36 Intelligence, 37 Ignorance, 38 Political Apathy, 40 Cheerfulness, 54 Youth Rebelliousness, 55 Culture, 59 Weaponization, 60 Recreational Drug Use, 47 Pacifism, 71 Inclusiveness, 87 Patriotism, 88 Food Quality, 89 Accessibility |
| Safety and environment | 42 Compliance, 77 Crime, 43 Safety, 41 Weather, 63 Environmental Beauty, 58 Tourism, 64 Charmlessness |
| Development | 68 Human Development Index, 69 Primitiveness, 70 Scientific Advancement |
| Non-issue (gameplay) | 65 Influence, 66 WA Endorsements, 80 Residency (days in region), 86 International Artwork (trading-card deck value, unit "Bank") |
| Z-Day only | 81 Survivors, 82 Zombies, 83 Dead, 84 Percentage Zombies |

Many scales come in mirrored pairs (Niceness/Rudeness, Corruption/Integrity, Crime/Compliance), so every nation ranks well on something.

Scales are revised over time. Changes are previewed on a "World Census Beta" page before going live ([News 2019](https://www.nationstates.net/page=news/2019)); whole-model refactors happened in 2011 and Jan 2015 ([News 2015](https://www.nationstates.net/page=news/2015)) [P].

### 5.2 Rankings and badges

- Each scale has a world rank and a region rank, available as absolute or percentile (API modes `rank`, `rrank`, `prank`, `prrank`) plus score history [P].
- One scale is "featured" each day.
- Regions have their own rankings per scale (`censusranks`).
- Top-percentile placement gives nation-page trophies; players describe tiers at top 1%, 5% and 10% ([Challenge page](https://www.nationstates.net/page=challenge) mentions "top 1%, 10%, etc") [P]. Exact tier list not confirmed [U].
- WA badges (`wabadges`) mark Commended/Condemned nations and resolution authors.
- "Notables" are short descriptors on the nation page derived from extreme stats.

### 5.3 Derived economy

Shown in the standard nation API [P]:
- `TAX` (average income tax, e.g. 86.9%), `PUBLICSECTOR`, `MAJORINDUSTRY`, `GOVTPRIORITY`.
- `GOVT`: budget share across 12 departments (Administration, Defence, Education, Environment, Healthcare, Commerce, International Aid, Law & Order, Public Transport, Social Equality, Spirituality, Welfare).
- `sectors`: economy split into black market, government, private industry, state-owned industry.
- `gdp`, `income`, `poorest`, `richest`, `DEATHS` (causes of death by percentage), `crime`, `sensibilities`, `legislation`.

Taxes are never set by the player: "Bureaucrats will automatically adjust your taxes as necessary to fund whatever government spending you've authorized" ([FAQ](https://www.nationstates.net/page=faq)) [P].

The formulas for GDP, incomes and tax are not published. The third-party [NSEconomy](https://www.nationstates.net/pages/api.html) calculator (linked from the API docs) derives extra economic figures; I did not examine its method [U].

### 5.4 Population

- "Your national population grows steadily over time no matter what you do." ([FAQ](https://www.nationstates.net/page=faq)) [P]
- Community figures: start at 5 million; growth ramps from 1 million/day to a random 5-7 million/day after about three weeks; applied at the major update ([dispatch 444406](https://www.nationstates.net/page=dispatch/id=444406), [forum t=229862](https://forum.nationstates.net/viewtopic.php?f=12&t=229862)) [C].
- Sanity check: Testlandia, founded at launch, has 50.2 billion people. Over roughly 8,700 days that is about 5.8 million/day, consistent with the community figure.
- Population is therefore a pure account-age counter. It gates unlocks, WASec voting (30 million) and issue submission (250 million).

### 5.5 Daily updates

- Two updates per day. The **major** update starts at 00:00 US Eastern; the **minor** at 12:00 Eastern ([forum t=229862](https://forum.nationstates.net/viewtopic.php?f=12&t=229862)) [C].
- Both recount endorsements, change Delegates and recalculate influence. Only the major grows population and refreshes census rankings [C].
- Regions are processed one at a time in a fixed order, so each region has its own update moment. The API exposes `lastupdate`, `lastmajorupdate`, `lastminorupdate` per region [P].
- Observed 2026-10-01: The Pacific's major update was at 05:38:05 UTC and minor at 17:00:38 UTC. If updates start at 04:00/16:00 UTC (midnight/noon EDT), major runs at least about 1h40 and minor about 1h. Durations quoted in older guides vary from 45 to 90 minutes [U].
- WA resolutions pass or fail, and Delegates change, only when updates run ([News 2024](https://www.nationstates.net/page=news/2024)) [P].
- Daily data dumps are generated around 22:30 PST, after the major update [P].

---

## 6. Regions

Every nation is in exactly one region and can move "whenever and as often as you like" ([FAQ](https://www.nationstates.net/page=faq)) [P]. Anyone can found a region.

### 6.1 Region types

| Type | What it is | Source |
|---|---|---|
| Feeders | Game-created Pacific regions where half of new nations spawn (The Pacific and the North, South, East and West Pacific) | [FAQ](https://www.nationstates.net/page=faq) [P] |
| Sinkers | Where restored (refounded) nations appear: Lazarus, Osiris, Balder. "Restorers" appears as a separate term in the FAQ | [FAQ](https://www.nationstates.net/page=faq) [P], [dispatch 968137](https://www.nationstates.net/page=dispatch/id=968137) [C] |
| Ejection sinkers | Ejected nations land in The Rejected Realms or, since Nov 2024, the Plains of Perdition or the Outback | [News 2024](https://www.nationstates.net/page=news/2024) [P] |
| Warzones | Six game-created regions where bans are temporary and ejections cost no influence | [Basics of Military Gameplay](https://forum.nationstates.net/viewtopic.php?p=4941650) [C] |
| Strongholds | Player regions with a Governor. The default for all regions existing in April 2023 | [News 2023](https://www.nationstates.net/page=news/2023) [P] |
| Frontiers | Player regions with no Governor; the Delegate is executive; new nations can spawn there | [FAQ](https://www.nationstates.net/page=faq) [P] |

Game-created regions have no founder or governor. The Pacific's API record shows `FOUNDER 0`, `GOVERNOR 0`, tag "Governorless", 3,224 nations, 453 WA nations, Delegate with 336 votes [P].

### 6.2 Roles and authorities

- **Founder**: since April 2023 only a historical record with no powers [P].
- **Governor**: appointed, may hold the role for life, acts with no influence cost, can strip or grant the Delegate's powers. May name **Successors** who inherit if the Governor ceases to exist, and may abdicate to a Successor [P].
- **WA Delegate**: the WA nation with the most endorsements in the region, minimum one. Changes only at update. A tie involving the incumbent favours the incumbent [C].
- **Regional Officers** (Oct 2015): up to 12, custom titles, any subset of authorities. Appointing costs no influence. Officers pay double influence for border actions ([News 2015](https://www.nationstates.net/page=news/2015)) [P].
- **Authority codes** ([API docs](https://www.nationstates.net/pages/api.html)) [P]: X Executive, W World Assembly, S Succession, A Appearance, B Border Control, C Communications, E Embassies, P Polls. Only Governors and Delegates can hold Executive.
- The Delegacy itself can be given a specific subset of authorities.

### 6.3 Region features

- **World Factbook Entry** (WFE), flag, banner, pinned dispatches: Appearance authority.
- **Regional Message Board** (RMB): a flat post stream per region. Posts can be suppressed by officers (suppressor's name shown), self-deleted or mod-suppressed. Searchable. `@nation` mentions and BBCode-style formatting [P].
- **Embassies** (2011): mutual links between two regions. After both agree there is a three-day construction timer [C]. Since June 2014 a region can grant RMB posting rights to embassy regions at five levels: none, delegates and founders, officers, communications officers, or everyone [P].
- **Polls** (Jan 2014): one regional poll, with configurable voter eligibility (e.g. WA members only, large nations, whole world) [P].
- **Password**: restricts entry. Visible or secret. A passworded Frontier receives no spawns [P].
- **Ban list**: banned nations cannot enter or post. Cap of 200 reported in 2011 [C].
- **Tags** (May 2011): self-applied descriptors (e.g. Role Player, Defender, Anti-Fascist) plus system tags (Feeder, Gargantuan, Governorless, Featured). Searchable via a tag cloud and API `regionsbytag` [P].
- **Welcome telegram**: automatic TG to arrivals, free of stamps [P].
- **Regional census rankings**, a regional happenings feed, and one "featured region" per day.
- **Maps** (April 2023) and **Wonders** (April 2024) are newer regional/collaborative features that began as April events [P]. Not researched in depth.
- **Regional Power**: a label for the region's share of world influence: Low under 0.01%, Moderate, High, Very High, Extremely High at 1%+ ([dispatch 968137](https://www.nationstates.net/page=dispatch/id=968137)) [C].

### 6.4 Frontiers and Strongholds (April 2023)

Released 18 April 2023 ([News 2023](https://www.nationstates.net/page=news/2023)) [P]. Designed by Site Director Sedgistan; the design thread dates from July 2021 ([forum t=507257](https://forum.nationstates.net/viewtopic.php?t=507257)) [P].

Stated goals: shrink oversized Feeders, dilute Feeder influence, give regions a lasting opt-out from invasion, reduce "refounding" (which wipes regional history), and create a supply of invadable regions with a reason to hold them.

Rules:
- Half of new nations spawn in Feeders and half in Frontiers ([FAQ](https://www.nationstates.net/page=faq)) [P].
- A Frontier's share is set by its **magnetism**, shown on its admin page and in the API. Magnetism rises with: age (at least a week, ideally a year); having a Welcome telegram; Delegate endorsements (at least 5, ideally 50); Delegate tenure (at least 2 days, ideally under 6 months); an RMB post in the last 12 hours [P].
- A Frontier gets no spawns if it has a password, has no Delegate, has over 5,000 residents, is mid-transition, or has had no RMB post in 72 hours [P].
- Switching either way takes two weeks. Frontier to Stronghold makes the WA Delegate the Governor [P].
- Per the design thread: a Delegate starting a switch pays influence at least equal to a secret password; any executive can cancel for free; a change of Delegate mid-transition adds three days; spawns stop during transition [P for design intent; live values not rechecked].
- **Annexation** (Oct 2025): the Delegate of one Frontier can absorb all nations of another Frontier "after a set period of time" ([News 2025](https://www.nationstates.net/page=news/2025)) [P]. Detailed rules not found [U].

---

## 7. World Assembly

Originally the "United Nations"; renamed after a UN cease-and-desist dated 21 Jan 2008, announced 1 April 2008 ([Wikipedia](https://en.wikipedia.org/wiki/NationStates)). Split into two chambers in 2009 ([SC guide](https://forum.nationstates.net/viewtopic.php?f=24&t=531501)) [C].

### 7.1 Membership and the one-nation rule

- Joining is optional and requires a verified email ([FAQ](https://www.nationstates.net/page=faq)) [P].
- A player may have unlimited nations but only **one WA member at a time**. This single rule is what makes endorsements scarce and regional politics meaningful.
- Enforcement: "sophisticated pattern-matching software" combining many signals expels suspected "WA multies"; repeat offenders are deleted. Sharing a computer is risky; sharing an IP is "usually fine" [P].
- Players may resign and re-apply on a different nation. Military players do this constantly ("switchers").

### 7.2 Endorsements and Delegates

- Two WA nations in the same region can endorse each other [P].
- The nation with the most endorsements becomes Delegate at the next update.
- A Delegate's WA vote counts as 1 plus one per endorsement [P].
- Only Delegates can approve proposals.
- Leaving the region or the WA drops all endorsements.

### 7.3 Proposal flow (both chambers)

From the [FAQ](https://www.nationstates.net/page=faq) [P] and [SC guide](https://forum.nationstates.net/viewtopic.php?f=24&t=531501) [C]:

1. A WA member with at least two endorsements submits a proposal.
2. Delegates approve it. At 6% of all Delegates it reaches quorum and queues for vote; otherwise it expires.
3. Moderators can mark a proposal illegal under chamber rules; it is then discarded.
4. At vote for four days. Each chamber can have one resolution at vote at a time.
5. Simple majority of votes cast passes it. Authors and co-authors get a badge.
6. Resolutions cannot be amended, only repealed and replaced.

Proposals cannot change game mechanics or reference the real world [P].

### 7.4 General Assembly (as of July 2026)

The GA was rebuilt on 2 July 2026 ([News](https://www.nationstates.net/page=news)) [P]:

- All 862 prior resolutions were archived; the GA restarted at zero. API council IDs: 3 = General Assembly, 2 = Security Council, 1 = Legacy GA.
- **Before**: each resolution had a category and strength, and its fixed stat effect was applied automatically to every WA member on passage.
- **Now**: Issues Editors write custom stat effects for each proposal before it goes to vote. Resolutions can also set or cancel policies. A "World Census analysis" previews likely effects on a typical nation.
- **Adoption is opt-in**: each nation chooses which passed resolutions to adopt; effects apply only on adoption. There is an "adopt all" button, and adoption cannot be undone.
- **Compliance threshold**: a nation must have adopted at least 75% of active resolutions to vote or approve (0% at launch, 75% from 19 Aug 2026; 80% had been planned). Falling below does not affect Delegate status or endorsements.
- Repeals have no stat effect; they remove the resolution from the adoptable list and from the compliance count.
- **Tranches** (1 Sep 2026): any nation can publish a bundle of resolutions; WA members can follow a tranche to adopt its recommendations in one action and keep receiving them.

### 7.5 Security Council

Concerned with gameplay rather than law ([FAQ](https://www.nationstates.net/page=faq)) [P]. Resolution types:

| Type | Effect |
|---|---|
| Commendation / Condemnation | Badge on a nation or region. No mechanical effect. Condemnations are often worn as trophies |
| Liberation (2009) | Removes a Delegate-imposed password and blocks the Delegate from setting one. Used against invaders trying to lock and refound a region |
| Declaration (July 2021) | Statement of opinion. No mechanical effect |
| Injunction (April 2023) | Prevents a region's Delegate from changing Frontier/Stronghold status |
| Repeal | Removes an earlier resolution |

Liberations and Injunctions do not bind a Governor, only a Delegate [P design thread].

### 7.6 WA Secretariat (2026)

- Five elected nations: Secretary-General, Deputy, three members. They attach public "Opinions" (voting recommendations) to proposals and resolutions in both chambers [P].
- Elected every six months. Candidates need WA membership, five endorsements and a campaign dispatch.
- Voters: WA members with 30 million+ population, one vote per round, each round 24 hours. Top 25 from round 1 go to round 2; top five win [P].

---

## 8. Regional influence and military gameplay

### 8.1 Influence

Introduced 11 April 2006 to replace moderator-enforced "griefing" rules that depended on judging who was a "native" ([Basics of Military Gameplay](https://forum.nationstates.net/viewtopic.php?p=4941650)) [C]. Official description: nations earn influence in a region "the longer they remain there and the more endorsements they have"; it declines after leaving; more influence makes a nation costlier to eject ([FAQ](https://www.nationstates.net/page=faq)) [P]. The exact formula is officially withheld.

Community-derived numbers ([dispatch 968137, "About Influence"](https://www.nationstates.net/page=dispatch/id=968137), last updated July 2021) [C]:

| Rule | Value |
|---|---|
| Gain per update | 1 for a non-WA nation; 1 + endorsements for a WA nation. Two updates per day |
| Inactivity | No gain if not logged in for a week |
| Delegate eject | one third of target's influence |
| Delegate eject and ban | one half of target's influence |
| Regional Officer | double the Delegate's cost |
| Governor | free |
| Visible password | 20 per resident nation, minimum 200 |
| Secret password | 40 per resident nation, minimum 400 |
| Removing a password | free |
| Decay after leaving | 4 lost after day 1, 9 after day 2, 14 after day 3, then growing by 8 per day |
| Feeders and sinkers | Influence expires after about six months; floor of 4,015 |
| Ceasing to exist | Rapid decay; influence held in other regions is erased |

The displayed label (Minnow, Envoy, Powerbroker, Hegemony ...) is a 31-step ladder based on the nation's share of the region's total influence, not the absolute number [C]. The absolute number is census scale 65 and API `influencenum`.

A search snippet also mentioned a square-root formula involving the SPDR score; I could not reconcile it with the linear rule above [U].

### 8.2 Raiding and defending

- An **invasion** is WA nations moving into a region and endorsing a "point" nation so it becomes Delegate at update [P FAQ].
- **Raiders** then "tag" (change the WFE and flag), or hold the region, eject natives, password it, and sometimes empty and **refound** it. **Defenders** move in to keep or restore native control [C].
- Targets are regions where the Delegate is executive: Frontiers, governorless regions, and Strongholds whose Governor granted the Delegate power.
- Since influence replaced the griefing rules, "any military gameplay activities that are still possible are now also legal" [C]. The system, not moderators, limits destruction.

**Timing is the skill.** Because Delegates change only when a region's turn comes in the update:
- **Update raiding**: jump in seconds before the target updates so defenders cannot react. Being moved too late is being "caught in update".
- **Triggers**: watch a region that updates shortly before the target; when its happenings show it has updated, jump.
- **Tag raids**: hit many small regions in one update with reusable puppets, changing only the WFE and flag.
- **Switchers**: pre-made puppets that the player's WA membership is moved onto between jumps.
- **Pre-endorsing / update surfing**: positioning endorsements ahead of the region's update.

All from [Basics of Military Gameplay](https://forum.nationstates.net/viewtopic.php?p=4941650) and search snippets of player guides [C]. I did not read the detailed tactics section in full.

**Tooling** [C, from search snippets]:
- *Spyglass*: builds a spreadsheet of every region in update order with estimated update times, from the daily dump.
- *Breeze++*: browser extension with keybinds for move, endorse, tag.
- *WebTrigger* and similar: trigger-watching tools.
- The Live Happenings SSE API (buckets `move`, `endo`, `member`, `eject`, `admin`) now serves this use directly [P].

**Script rules** shape the whole meta ([One Stop Rules Shop](https://forum.nationstates.net/viewtopic.php?p=16394966)) [P]:
- Moving, endorsing, ejecting, posting, card actions and event mini-game actions are "restricted": one user keypress or click per request, never automatic, never simultaneous (wait for the response before the next).
- Creating nations, answering issues and sending telegrams are "prohibited" for HTML-side scripts in all cases (use the API).
- Automatic non-restricted requests to the HTML site: 10 per minute.

---

## 9. Communication features

### 9.1 Telegrams

Private messages between nations ([FAQ](https://www.nationstates.net/page=faq)) [P]. System rebuilt in 2013.

- Up to 8 recipients free. More than 8 requires one **stamp** per recipient.
- Exception: Governors, Delegates and Communications officers can telegram their own region free.
- Addressing supports `region:Name`, `tag:delegates`, `tag:WA`, `tag:all`, `tag:newN` (next N new nations), `tag:refoundedN`, `tag:newdelegatesN`, `tag:welcome`, with `+`/`-` filters processed left to right.
- Mass telegrams get delivery reports, recruitment reports (who clicked through and moved), and macros `%NATION%` and `%TOKEN%`.
- Recruitment and WA-campaign telegrams must be flagged as such. Recipients can filter or block each type.
- Recruitment telegrams to new nations are throttled and delivered in random order from a shared queue; a new nation's inbox is small, so many never arrive.
- Official expectation: 10-20% blocked, 0-1% conversion.
- Inbox folders hold 20 telegrams, or 100 with Postmaster.

### 9.2 Dispatches and factbooks

- Factbooks added June 2012; generalised into Dispatches in Jan 2014 ([News 2014](https://www.nationstates.net/page=news/2014)) [P].
- Top-level categories in the site menu: Factbooks, Bulletins, Accounts, Meta, each with subcategories.
- Players upvote/downvote; lists sort by "new" or "best".
- Regional executives can pin dispatches to the region page.
- Dispatch search was added 2 Sep 2025 (and was the vector for the 2026 breach, per [Wikipedia](https://en.wikipedia.org/wiki/NationStates)).
- Used heavily for roleplay worldbuilding and regional laws.

### 9.3 Forum

A separate phpBB board at forum.nationstates.net, with roleplay, WA, gameplay, technical and general sections. About 33 million posts as of Jan 2024 ([Wikipedia](https://en.wikipedia.org/wiki/NationStates)). A forum/RMB overhaul has been planned for years; Testlandia's motto is currently "New forum when?" [P API].

### 9.4 Dossier and happenings

- Nations keep a private dossier of watched nations and regions (API `dossier`, `rdossier`).
- Every notable action generates a public "happening" line on the nation, region and world feeds. Categories: law, change, dispatch, rmb, embassy, eject, admin, move, founding, cte, vote, resolution, member, endo [P].

---

## 10. Trading cards

- Began as the April Fools' 2018 event with timed "loot boxes"; became permanent on 21 Dec 2018 ([News 2018](https://www.nationstates.net/page=news/2018)) [P].
- Every active nation at the start of a **season** gets a card. Cards are permanent snapshots. Season 4 launched 31 Dec 2024 with a 14-day "inscription period" for nations to tidy their card [P].
- **Packs** of five random current-season cards drop by chance when answering an issue. Players put the chance at about 20% ([search snippet of dispatch 2701424](https://www.nationstates.net/page=dispatch/id=2701424)) [C].
- **Rarity tiers**: Common, Uncommon, Rare, Ultra-Rare, Epic, Legendary. Assigned by hidden criteria; players believe census badges, WA status, delegate/founder roles and staff roles drive it, with tiers as fixed percentages of nations [C].
- **Bank** is the card currency. It comes only from junking or selling cards. It is separate from nation stats [P].
- **Actions**: junk for a small bank amount, gift for a small fee, sell, bid.
- **Timed double auction** ([FAQ](https://www.nationstates.net/page=faq)) [P]:
  - A bid at or above an ask creates a match and starts a 60-minute countdown.
  - Others may outbid or undercut during the countdown; each match change adds one minute.
  - Execution price is the midpoint of the matched bid and ask.
  - Highest bid and lowest ask win; ties go to the earliest.
  - Matched offers cannot be withdrawn. Minimum price 0.01.
  - Designed to stop puppets feeding cards to a main nation at fake prices.
- **Fee**: 10% of the amount above 10.00 bank, paid by the seller (Nov 2022) [P].
- **Deck capacity**: starts at 250 cards, 500 for Supporters; more can be bought with bank [P].
- **Collections**: named sub-sets of a deck.
- Deck value is census scale 86, so cards do feed one ranking.
- Cards are otherwise "cosmetic. They grant no benefits" [P]. Players can opt out.
- "Card farming" with many puppets is the main card meta; tools such as the [RCES userscripts](https://github.com/dithpri/RCES) serve it [C].

---

## 11. Challenge

A stat-comparison duel ([Challenge page](https://www.nationstates.net/page=challenge)) [P]:
- A nation's starting Level is its number of world census trophies.
- Games are best of five rounds. The higher-level nation starts with a points lead equal to the level gap; the game extends so the underdog can still win by taking every round.
- Nations have a "specialty" census scale.
- Wins earn Championship points on a ladder (top nation: 10.6 million points, 189,195 wins).
- I don't know how each round is decided [U].

---

## 12. Events

| Event | When | Mechanics | Source |
|---|---|---|---|
| **Z-Day** | Around 31 Oct, yearly since 2012 (14th in 2025) | Zombie outbreak. Each nation's population splits into survivors, zombies, dead. Nation picks: exterminate (zombies become dead), research a cure (lowers regional infection, can cure), or embrace zombies (raises regional infection). Infection spreads within regions. Executives can close borders free. Ran 36 hours in 2015. Adds census scales 81-84 | [News 2015](https://www.nationstates.net/page=news/2015) [P] |
| **N-Day** | Twice a year (Feb/Mar and late Sep); began as April Fools' 2017; 15th in Sep 2026 | 24-hour nuclear war. Regional Officers found Factions. Nations earn Production each 2-minute tick (15 non-WA, 150 WA; caps 750 / 2,500), buy Nukes and Shields, target (10 minutes to ready), launch (3-5 minutes flight). Strikes add Radiation (0.25% each), cutting production; 100% is destroyed. Four random specialties: Military, Strategic, Economic, Cleanup. Faction score = radiation given minus 0.25 x radiation taken | [News](https://www.nationstates.net/page=news) [P] |
| **Global Trade Fair** | April 2022, May 2023, May 2026 | Item search, "stashing" and "inspecting" with regional leaderboards. Rules not captured | [News](https://www.nationstates.net/page=news) [P] |
| **Valentine's / "Best Nation in the World"** | February | Voting-style social event tied to Wonders in recent years. Rules not captured | News 2021-2025 [P] |
| **April Fools'** | 1 April | 2008 UN renamed to WA; 2011 "Haxx0rs"; 2012 fake IPO; 2014 "ByteCoin"; 2015 Cards Against NationStates; 2016 and 2020 WA Secretary-General elections; 2017 nuclear war (became N-Day); 2018 trading cards (became permanent); 2019 trivia challenge; 2021 Best Nation in the World; 2022 Global Trade Fair; 2023 regional maps; 2024 wonders; 2026 banner photo contest | News archive headlines [P]; individual posts mostly not read |

Pattern worth noting: April Fools' events are the game's prototype pipeline. N-Day, trading cards, maps and wonders all started there.

In N-Day, WA nations produce 10x faster. Staff tolerate players moving WA membership between puppets for this.

---

## 13. Public API and third-party ecosystem

All from the [API documentation](https://www.nationstates.net/pages/api.html) [P].

- **Endpoint**: `https://www.nationstates.net/cgi-bin/api.cgi`, XML responses.
- **Shards**: request only the fields wanted, e.g. `?nation=x&q=motto+census+policies`. About 70 public nation shards, about 45 region shards, world shards and WA shards.
- **Rate limit**: 50 requests per 30 seconds per IP, as a fixed window. Headers `RateLimit-Policy: 50;w=30`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`. Exceeding it returns 429; repeated abuse locks out for 15 minutes or more.
- **User-Agent** identifying the operator is mandatory; missing gives 403.
- **Versioning**: `&v=N`; the two most recent versions are supported.
- **Private shards** (issues, telegram notices, dossier, packs, ping) authenticate with `X-Password`, then `X-Autologin` (encrypted password) and `X-Pin` (session id, expires after two hours idle). A second login within seconds returns 409.
- **Private commands**: `issue` (answer or dismiss with option -1), `gaadopt`, `giftcard`, `junkcard`, `dispatch` (add/edit/remove), `rmbpost`. All except `issue` use a two-step prepare/execute with a one-time token.
- **Telegrams API**: needs a per-region client key plus a template ID and secret. One call per recipient. Limits: one recruitment TG per 180 seconds, one other TG per 30 seconds.
- **Live Happenings**: Server-Sent Events at `/api/(buckets)/(filters)`. Not rate-limited; 5 concurrent connections per IP; replay buffer of 1,000 events via `Last-Event-ID`.
- **Verification API**: a third-party site asks the user for a one-time code from `page=verify_login`, then calls `a=verify`. Supports a site-specific token.
- **Trading Cards API**: card info, markets, owners, trades, decks, collections, auctions.
- **Daily dumps**: `nations.xml.gz` (about 40 MB), `regions.xml.gz` (about 7 MB), plus a per-season card list (about 12 MB). Archived historically.

Third-party ecosystem:
- Named in the official docs: NSEconomy, NSDossier, NationStates++ (browser extension, [source](https://github.com/NationStates/NationStatesPlusPlus)), Stately and NSDroid (Android apps), and wrappers in Node, Java, Python, Haskell [P].
- Community: Issue Results site; Spyglass, Breeze++ and trigger tools for military play; RCES card userscripts; telegram and login managers; Discord bots that use the verification API; recruitment bots on the Telegrams API [C].
- Much regional government (forums, elections, citizenship) lives off-site on Discord and regional forums. "Offsite Chat" and "Offsite Forums" are region tags [P].

---

## 14. Monetisation, staff and technology

### 14.1 Money

From the [Store](https://www.nationstates.net/page=store) [P]:

| Product | Price (USD) | Gives |
|---|---|---|
| Supporter | $2.99 once, per nation, permanent | No ads, trophy, double card deck capacity, permanent name reservation |
| Postmaster | $4.99 | Supporter, plus 100-telegram folders, custom folders |
| Postmaster-General | $9.99 | Both, plus unlimited telegram storage and 500 stamps |
| Telegram stamps | $1.00 base unit; price per stamp not shown when logged out | One stamp delivers one mass telegram to one nation; refunded if undelivered |

- Payments by Stripe or PayPal. Purchases can be gifted.
- Ads show to non-supporters. The ad network was not identified [U].
- Policy stated in 2012: "we will never sell better stats or gameplay bonuses" ([News 2012](https://www.nationstates.net/page=news/2012)) [P].
- Stamps are the one purchase with gameplay weight: they buy recruitment reach.
- Revenue and costs are not public [U]. A 2015 post credits "stamp dollars" for a new database server [P].

### 14.2 People

From the [staff roster](https://forum.nationstates.net/viewtopic.php?f=16&t=85133) [P]:
- Owner: Max Barry. Executive Director: "[violet]". Site Director: Sedgistan.
- Technical team: 2 Directors of Technology, 2 Senior Administrators, 2 Administrators, 7 Techs.
- Moderation: about 28 across senior, game and forum tiers.
- Issues and Content: 1 Content Director, 2 senior editors, 17 editors.
- Events Manager, Development Managers per feature area, Community Leads.
- Roughly 50-60 distinct people, with overlap between teams. Moderators and admins are described as volunteers. Whether anyone is paid is not stated [U].
- Development model, in Barry's words: "Excite the admin" - features get built when a volunteer admin wants to build them ([News 2021](https://www.nationstates.net/page=news/2021)) [P].

### 14.3 Technology

- Written in Perl ([Wikipedia](https://en.wikipedia.org/wiki/NationStates)); the API path is `cgi-bin/api.cgi`. Staff refer to "20-year old code" [P].
- MySQL: a 2024 staff ad describes "a vast MySQL database" ([News 2024](https://www.nationstates.net/page=news/2024)) [P].
- Forum is phpBB (identifiable from its URL structure).
- Initial architecture credited to Geoff Wong; code contributions from Gregory Rubin and Mark Tiefenbruck ([About](https://www.nationstates.net/page=about)) [P].
- Self-managed hardware: a 2015 post mentions adding a dedicated database server. Hosting provider unknown [U].
- A beta site exists at `page=beta`, and the July 2026 News post thanks "NS3 beta testers". What NS3 is was not established [U].

Operational history a successor should learn from:
- April 2024: nine days offline and significant data loss after failure of the one disk out of ten not in a redundant array ([News 2024](https://www.nationstates.net/page=news/2024)) [P].
- Jan-Feb 2026: server breach via a bug in dispatch search; about 11 days offline; forced password reset for all nations ([News](https://www.nationstates.net/page=news/2026)) [P].
- Dec 2022: another outage ("We Were Offline And It Was Dark And Cold").

---

## 15. Not verified

1. How the eight creation answers map to starting stats, and whether the "History" pick matters.
2. Category band thresholds, and confirmation that the economic axis is Economic Freedom.
3. The hidden base variables and the formulas behind census scales, GDP, income and tax.
4. Exact influence formula; the list in 8.1 is a 2021 player dispatch.
5. Update start times and durations today; one region's timestamps were observed.
6. Live values for Frontier transition costs; Annexation rules.
7. Issue chain scheduling.
8. Card pack drop rate, rarity criteria, junk values, deck-capacity pricing.
9. Census badge tiers.
10. How a Challenge round is scored.
11. Current Z-Day rules (2015 post used); Trade Fair, Valentine's, Maps and Wonders mechanics.
12. Embassy timer, ban-list cap, region founding requirements.
13. Ad network, revenue, hosting, whether any staff are paid, what "NS3" is.
14. GA rules after the 2026 reset (the simplified proposal rules were not read).
15. Reddit and nswiki were not consulted.
