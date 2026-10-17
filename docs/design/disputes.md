# Disputes, on paper

Not built, and for single player now replaced: 0.7 built the world, wars, claims and the Assembly
of Nations differently, in [world.md](world.md). This note stays as the first idea, and as the
starting point for conflict between players in multiplayer worlds, where postures and bounded
stakes matter more.

This is the first draft of how nations come into conflict, written down so it can be
played by hand before any of it turns into code. It's the part of the design I trust least, so the
point of this page is to be specific enough to be proven wrong.

## What it has to satisfy

From the blueprint:

- Nobody can destroy a nation, delete its history or lock it out of play.
- Conflict is opt-in.
- Losses are bounded and temporary.
- Blocs matter. One against one is the NationStates 2 mistake.
- Being in a dispute must never be worse than staying out of everything.

## Building blocks

**Posture.** Each nation picks one. Changing takes 14 days and can't happen mid-dispute.

| Posture | Can be targeted | Can start disputes | Largest stake |
|---|---|---|---|
| Neutral | No | No | - |
| Engaged | Yes | Yes | Tier 2 |
| Contender | Yes | Yes | Tier 3 |

**Standing.** A number from -100 to 100 between each pair of nations. Treaties kept, projects
shared and disputes settled fairly raise it. Broken treaties and escalation lower it.

**Dependencies.** A nation has a few needs (energy, food, capital, markets) and a few surpluses,
derived from its indicators and policies. A trade treaty matches one nation's surplus to another's
need. Whoever supplies a need holds **leverage** over whoever has it.

**Political capital.** Each nation gets a daily allowance of 1 to 4 points, from legitimacy and
support. Unspent capital banks up to 6. It is the only thing a dispute spends.

## A dispute

1. **Claim.** One nation names a grievance against another (a tariff, fishing rights, a river, an
   extradition, an insult in an anthem) and declares a stake from the menu below. The respondent's
   posture caps the stake.
2. **Five days.** Each day, each side commits one move in secret. Both are revealed together.
3. **Settlement.** Either an offer is accepted, or after day five the side ahead on the track wins
   the stake, scaled by how far ahead it is.

The track runs from -10 (respondent winning) to +10 (claimant winning) and starts at the difference
in leverage, capped at 3 either way.

| Move | Cost | Effect |
|---|---|---|
| Press | 2 capital | Track moves 2 your way |
| Hold | 0 | Track moves 1 against you |
| Rally | 1 capital | Ask your bloc. Each ally who answers moves the track 1 your way and becomes a party |
| Escalate | 3 capital | Stake goes up one tier (if posture allows). Both sides' daily costs rise by 1 |
| Offer terms | 0 | Propose a settlement. If the other side also offers or accepts, it ends there |

Allies who answer a rally share in the outcome at half weight, win or lose. That's what makes a
bloc worth having and a rally worth thinking about.

## Stakes

All temporary. Nothing here outlasts 30 days.

| Tier | Loser gets |
|---|---|
| 1 | A formal apology (legitimacy -2), standing with the winner's bloc -10 |
| 2 | Tier 1, plus one treaty clause suspended for 30 days, or a tariff (capacity -2 for 30 days) |
| 3 | Tier 2, plus loss of a regional project share for 30 days, or an embargo on one need (the matching indicator -4 for 30 days) |

Hard caps per dispute: no more than 6 points off any one indicator in total, nothing permanent, no
effect on ownership, timeline or the ability to play. The winner gains the mirror image at half
size, plus standing with everyone who watched.

## Why bother being Engaged

A Neutral nation can't be touched, so it needs a reason to give that up:

- Only Engaged and Contender nations can hold regional offices.
- Regional projects pay out more to nations that can be held to their commitments.
- Trade treaties with dispute clauses give better terms, because the other side has recourse.

If playtesting shows Neutral is simply the best choice, the rewards are wrong and need raising
before anything else is changed.

## Things I expect to be wrong

- Five days may be too long for a player-paced solo game and too short for a real-time world.
- Secret simultaneous moves are fun at a table. Against scripted nations they may just feel random.
- Leverage from dependencies could make the richest nation unbeatable. The cap of 3 is a guess.
- A rally that costs allies nothing to refuse will always be refused. It may need a standing cost.
- "Insult in an anthem" is a joke grievance. Whether disputes need real causes or whether flimsy
  ones are funnier is a tone question I haven't settled.

## How to test it

With two people and a sheet of paper: two blocs of three nations, invented dependencies, ten
disputes. I'm watching for whether anyone ever chooses Escalate, whether rallies get answered, and
whether the loser wants another go or wants to quit.
