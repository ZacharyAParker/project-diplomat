# AI layer

Nothing here runs yet. This folder holds the prompts and the contract they're written against. The
provider code (API key, ChatGPT plan, the opt-in CLI modes) comes later; see section 8 of
[the blueprint](../../docs/blueprint.md).

## The contract

1. The engine decides what happened. A model is only ever asked to write about it, or to pick from
   moves the engine has already ruled legal.
2. Every prompt returns JSON matching a schema. Output is validated, and anything that fails is
   thrown away and replaced by authored text. A model's numbers are never trusted: effects in a
   drafted dilemma go through the same validator as a human's.
3. Nothing is generated while the player waits. Text is produced ahead of need and stored with the
   save.
4. Player-written text never goes into a prompt as instructions. Where it has to appear (a nation's
   name), it is passed as data and the prompt says so.

## Tasks

Each task asks for a tier, and the provider maps the tier to a model. On a subscription, where the
limit is the player's quota, everything drops one tier.

| Task | Prompt | Tier | Claude | OpenAI | Why this tier |
|---|---|---|---|---|---|
| Front page for the day | `briefing.md` | bulk | Haiku 4.5 | gpt-6-luna | High volume, short, facts are supplied |
| Reword an authored dilemma for this nation | `dilemma-variant.md` | standard | Sonnet 5.5 | gpt-6.1-sol | Has to keep the meaning exactly while changing the voice |
| Draft a new dilemma for an author | `dilemma-draft.md` | strategic | Opus 5.5 | gpt-6.1-sol | The hardest writing job, run rarely, always reviewed by a person |
| Pick and word an NPC nation's move | `npc-move.md` | standard | Sonnet 5.5 | gpt-6-sol | Needs a consistent character across many turns |
| Check generated text before it's used | `review.md` | bulk | Haiku 4.5 | gpt-6-luna | A strict yes/no with reasons |

These pairings are my best guess from price and positioning. They need a small evaluation set
before I trust them.

## Prompt layout

Each file is the system prompt. The `## Input` section describes the JSON the game sends as the user
message, and `## Output` is the schema the reply must match. Sections above those are stable, so
they cache well.
