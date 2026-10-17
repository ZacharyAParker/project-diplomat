# The world: other nations, the Assembly of Nations, war

Status: built in 0.7. This replaces the dispute track in [disputes.md](disputes.md) for
single player; that note stays as a record of the first idea.

## What the player asked for

- Twenty other nations that act on their own, so the world moves between the player's days.
- An international body. NationStates' name for theirs is off limits (blueprint §7), so ours is
  **the Assembly of Nations**.
- Issues that only exist because there is more than one country: border disputes, humanitarian
  aid, war, war crimes.
- War with real stakes: who you ally with matters, defeat costs things that last, and AI nations
  can be conquered, though not often. **The player's own nation can be beaten but never
  destroyed or taken.**
- All of it lighter than the petition pipeline: no Assembly sitting, Court opinion and
  ministry advice for every foreign note.
- Minor nations played cheaply: one shared Sonnet session a week, and only for the nations with a
  choice worth a model's time. Nations that matter to the player each get their own Sonnet session.

## The nations

The pack's `neighbours.yaml` keeps the five nations the player borders, and `nations.yaml` adds
fifteen further off. Every one has the old fields (needs, surpluses, likes, dislikes, standing
with the player) plus:

- `near`: whether it borders the player. Border claims and invasions need it, or a shared
  border with an ally the player is defending.
- `borders`: the other nations it borders, for claims and wars between them.
- `temperament`: ambition, aggression, loyalty and charity, 0 to 100. These score its moves.
- `strength` and `wealth`, 0 to 100: its army and its economy, as it starts.
- `form`: what kind of state it is, in a word, for the papers.

What changes during play lives in `state.world` (engine, `packages/engine/src/world.ts`):

| Field | What it is |
|---|---|
| `nations[id]` | strength, wealth, stability, relations with every other nation, a short memory, whether it is still free, and who rules it if not |
| `wars` | sides (any number on each), the cause, a front from −100 to 100, weeks fought, war-weariness per side, crimes reported, how it ended |
| `pacts` | alliances. A member is expected to join a war when another member is attacked |
| `claims` | border disputes: who claims which named borderland from whom, and how it was settled |
| `assembly` | its members, the motion before it, past resolutions, sanctions in force |
| `matters` | foreign matters waiting for the player's decision |
| `home` | the player's war footing: mobilisation, weariness, borderlands lost |

Standing between the player and each nation stays in `state.neighbours`, where it always was,
so every abroad dilemma and treaty keeps working; it now covers all twenty.

## The world week

Once a week (the same night the treaties pay out) the engine runs the world:

1. **Plan.** For every free nation the planner lists the moves it may legally make and scores
   them from its temperament, its needs, its relations and the balance of strength: court a
   nation, offer a pact, press a claim, declare war, send aid, appeal for aid, sue for peace,
   annex a beaten enemy, rearm, or wait.
2. **Choose.** The server asks the AI to choose among the top-scored moves (below). With the AI
   off, or for any answer that fails validation, the top-scored move is taken. A model can only
   ever pick a legal move.
3. **Apply.** Moves happen in a fixed order. Then every war fights its week: the front moves with
   the strength of each side (allies included) against its weariness, plus some luck. Crimes may
   be reported, more often from aggressive, unstable, desperate sides. A war ends in a ceasefire
   when one side is exhausted, or in victory at the end of the front. A beaten AI nation that
   stands alone may be annexed (one time in four, and only then): it stops being a nation and
   its ruler grows.
4. **The Assembly** sits every other week (below).
5. **Matters** for the player are raised from whatever touched them, and old ones lapse.

Every move that touches the player, every war, every sitting and every annexation goes on the
timeline and into the Archive.

## Why nations go to war

War comes from how a nation feels, not from the arithmetic alone. Before a nation may choose war
against a neighbour, its **grievance** against that neighbour has to run high. The grievance adds
up:

- how it feels about the country: its relations with it, the plainest part;
- its government: an autocracy resents a free neighbour as a standing insult, and a free nation
  thinks less of a junta;
- its people: what the other nation prizes is what this one despises (their likes against its
  dislikes);
- its wealth: an ambitious, poorer nation envies a much richer neighbour;
- a claim to a borderland, and more when the claim has been left to fester a month;
- an old defeat at that neighbour's hands, within three years;
- votes in the Assembly to try or sanction it.

Strength only shifts the odds: an edge encourages, a disadvantage discourages but never forbids.
Each week a government's temper rolls too. So a weak nation in a fury will now and then attack a
stronger one, and usually regret it (about one war in six begins that way). A move to war is
always shown to the AI, however poor its odds, with the grievance as its reason, and the prompts
say a government may make that mistake, rarely.

A nation that has just fought cannot start another war for nine months, nor attack the same
enemy for a year and a half. In simulation the world sees four or five wars a year; a peaceful
player is rarely attacked, a hawkish one every two or three years.

## Who plays which nation

A nation is **important** to the player when any of these holds: standing 60 or more (a close
friend) or −40 or less (an enemy); a pact with the player; a war with or alongside the player; a
claim against the player or by the player.

- **Important nations** each keep their own Claude Code session (`foreign:<id>`) on the
  **standard tier (Sonnet)**, task `nation.move`. They remember their own grudges between weeks.
  A nation that stops being important loses its session; one that becomes important starts one.
- **Every other nation** shares one session (`world-nations`), task `world.nations`, one call a
  week for all of them together. It runs on the **standard tier (Sonnet)** by default, so fifteen
  nations keep fifteen distinct voices; Settings can drop it to the bulk tier (Haiku) if a busy
  world ever makes it slow or costly. And only the nations with a real
  choice are sent: a nation whose best move clearly beats the rest, and isn't war, a pact, a claim
  or aid, just takes it with no model call.

Both tasks are given only legal moves to choose from, and a note to write in the nation's voice.

## The Assembly of Nations

Every free nation is a member; the player is a member from founding and may leave or rejoin from
the World page. It sits every fourteen days. The week before, the motion is set from what is most
pressing: a tribunal on war crimes, a call for a ceasefire, sanctions on an aggressor, arbitration
of a border claim, a fund for a nation in need, or, on a quiet fortnight, routine business. The
player's vote is a foreign matter (aye, no or abstain); every other member votes by its relations
and temperament. A simple majority of the votes cast carries.

| Motion | If it carries |
|---|---|
| Ceasefire | both sides of the war tire faster, and a side that fights on loses standing with the ayes |
| Sanctions | the target's wealth and stability fall for eight weeks; members' treaties with it are suspended |
| Tribunal | the accused loses standing and stability. If it is the player: legitimacy −6 and standing with the ayes falls |
| Arbitration | the claim is settled one way or the other, binding on members |
| Aid fund | the nation in need recovers; members pay a little in |
| Routine | a line in the record and nothing else |

## The Security Council

Five permanent members, the strongest nations when the world began, each with a veto; and four
elected by the Assembly for six months, two seats at a time every three months. Each member of
the Assembly votes for the candidates it likes best; the player stands only by putting itself
forward from the World page, and is elected if enough members like it.

The Council sits a week after each sitting of the Assembly, and only when there is something
worth its time: a war that has gone on, war crimes, an aggressor already under sanctions. Its
resolutions bind:

| Resolution | If it carries |
|---|---|
| A binding ceasefire | the war ends there and then |
| Hard sanctions | twice as deep as the Assembly's, for twelve weeks; members' treaties with the target are suspended |
| Peacekeepers | the front freezes and both sides tire faster |
| Force authorised | Council members who dislike the aggressor join the war against it; the player is asked to join the coalition |

Five votes carry a resolution, and any permanent member's vote against it is a veto. In
simulation the permanent five veto about half of what comes before them.

## Proposals

The player may put a motion down: to the Assembly (a ceasefire, sanctions, a tribunal,
arbitration of a claim, an aid fund, a condemnation, an embargo on one resource, admitting a
nation, expelling a member, which takes two thirds), or, while it holds a Council seat, a
resolution to the Council. It names its kind and target, and may give its own wording, which is
read out, kept in the record and shown to the other nations' AI. One of the player's motions
waits per body, taken at the next sitting with room. Votes stay with the rules, but nations that
like the player lean its way and nations that dislike it lean the other.

## Foreign matters

Light decisions: one card, two to four options, decided directly by the executive (or the AI
executive in found mode). The Foreign Ministry's view is shown, from rules, not a model call.
They lapse after seven days to the option marked as what happens if nobody decides. Kinds:

- **Border claim**: a neighbour claims a borderland. Negotiate, refer to the Assembly, stand firm,
  or give it up.
- **Appeal for aid**: a nation at war or in want asks for help. Send aid, send a token, refuse.
- **Called to war**: an ally is attacked. Join the war, send arms, or stay out and lose the ally.
- **Attacked**: a nation invades. Fight, ask the Assembly for a ceasefire and fight meanwhile, or
  seek terms at once.
- **War crimes**: reports from a war. Condemn, call for a tribunal, or say nothing. If the
  player's own forces are accused: open an inquiry, deny it, or court-martial.
- **An offered pact**: accept or decline.
- **Terms offered** in a war with the player: accept, or fight on.
- **Victory**: impose reparations, annex (only an AI nation, only if it stands alone), or make a
  generous peace.
- **The Assembly's vote**: aye, no or abstain on the motion.

The player can also act from the World page at any time: offer a pact, declare war (on a nation
it borders or holds a claim against, or that is at war with an ally), sue for peace, mobilise or
stand down, and leave or rejoin the Assembly. **A declaration of war goes to the legislature
when the constitution gives the legislature the deciding vote**; the division follows the
parties' factions and the public mood.

## Stakes

The player's nation is never destroyed or annexed. Everything else is on the table:

- **At war**, each week costs money (fiscal, then debt), living standards and, as the war drags,
  legitimacy. Mobilising makes the army stronger and the economy weaker.
- **Defeat**: a borderland is ceded (counted for good), the economy and living standards take a
  lasting hit, reparations are paid for eight weeks, and legitimacy collapses, which can bring the
  government down.
- **Victory**: reparations come in, legitimacy rises, and an AI enemy that stands alone may be
  annexed. An annexed nation adds to the economy, and costs legitimacy and liberty while it is
  held down.
- **Alliances** cut both ways: a pact brings its members to your side, and drags you into their
  wars.

## The map

The World page opens with a map of all twenty-one nations. It is the Voronoi diagram of a point
per nation (`map:` in `packs/core/world.yaml`, drawn by `packages/engine/src/map.ts`): each nation
is the land nearer its point than any other, with a ring of sea round the coast and a few
straits. The borders the rules use are the borders the map draws: `scripts/map-fit.ts` writes
who touches whom back into the pack, and the validator refuses a pack whose map and borders
disagree. Nations are shaded by how they stand with the player, the player's own in gold, its
allies outlined, every front of every war in red, annexed nations hatched. Picking a nation
opens its row below.

## Declaring war, and changing the world by hand

When the constitution gives a legislature (or the people, or a council) a vote that binds, a
declaration of war is put to it as a motion: the declaration as the one course and refusal as
the other. The legislature sits on it as on a petition, with the AI playing the members (or the
rules-based stand-in, by the parties' factions: a provoked war rallies them, an unprovoked one
does not). The debate and the division go into Hansard, and the division decides.

The Director's `cheat_world` tool, and the Sandbox, can start a war between any two nations, end
one with a winner or a ceasefire, set relations between two nations, annex or free a nation, and
make or break a pact. What happens then is real: the war is fought and reported, allies join.
The player's nation can never be annexed this way either. Every such cheat can be undone.

## Not yet

Trade between AI nations; AI nations with their own governments and elections; the
player's own regional offices from the blueprint. The neighbours' notes are as long as a
paragraph; a full diplomatic exchange of letters is for later.
