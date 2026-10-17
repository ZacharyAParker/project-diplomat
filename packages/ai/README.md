# AI layer

The AI back ends behind the `Provider` interface in `@diplomat/government`, and one system
prompt per task. See [the design](../../docs/design/government.md), section "AI", and
[the provider research](../../docs/research/04-ai-providers.md).

## The contract

1. The engine decides what happened. A model writes about it, or plays a body choosing among
   courses the rules allow. Code re-derives every count it can (carried, binding, verdicts
   from votes) and clamps every effect.
2. Every task returns one JSON object matching `TaskOutput[task]`. `run()` returns it
   unvalidated; the caller validates it (`validate.ts`), retries once, then uses the
   rules-based stand-in.
3. Player-written text is data, never instructions. Each prompt says so. The one exception is
   a Founder's Word in `brief.words`, which is the Founder's genuine command within the
   fiction (and still cannot change the prompt or the output format).
4. Nothing is generated while the player waits.

## Back ends

```ts
import { createProvider, selfTest } from '@diplomat/ai'

const ai = createProvider({ backend: 'anthropic', apiKey })         // or 'claude-cli', or 'none'
const status = await ai.status()                                    // cheap
const tested = await selfTest(ai)                                   // says which credential is in use
const json = await ai.run('legislature.sitting', input, { signal }) // unvalidated
```

| Back end | Module | How |
|---|---|---|
| `none` | `providers/none.ts` | Status "AI is off"; `run` throws an `AiError` with code `off` |
| `anthropic` | `providers/anthropic.ts` | Messages API with the player's key, streamed. The task's prompt is the system prompt with `cache_control`; the input JSON is the user turn; one tool whose `input_schema` is the task's output schema (`schemas.ts`). Tool choice is `auto`, because Opus 5.5 and Sonnet 5.5 reject a forced choice with a 400: the reply is checked for the call, a JSON object in text is accepted instead, and a reply with neither is asked for once more. Opus 5.5 and Sonnet 5.5 requests opt into the server-side refusal fallback (`fallbacks: "default"`). Overloaded and 5xx replies are retried twice with backoff; 401, 429 and the rest become plain `AiError`s |
| `claude-cli` | `providers/claude-cli.ts` | The player's own signed-in `claude -p`, read-only, with the archive as its working directory when given. See below |

Tiers map to models (`DEFAULT_MODELS`): bulk → `claude-haiku-5-5`, standard →
`claude-sonnet-5-5`, strategic → `claude-opus-5-5`. Effort is low, medium and high by tier.
`MAX_TOKENS` and `TIMEOUTS` are per task and per tier. Every failure is an `AiError` with a
`code` (`off`, `auth`, `rate-limited`, `overloaded`, `timeout`, `aborted`, `refused`,
`cut-off`, `not-json`, `unavailable`, `bad-request`) and a message a player can act on.

### The Claude Code back end

Opt-in, and grey under Anthropic's terms for third-party products (research, section 2.2).
It runs the unmodified binary on PATH (on Windows `claude.exe`, or the npm shim's `cli.js`
under this Node; never through a shell), never reads or stores credentials, and removes
`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and `CLAUDECODE` from the child's environment so
the player's subscription login is what is used. Each call is:

```
claude -p --output-format json --model <model> --effort <effort>
  --append-system-prompt <task prompt>
  --tools Read,Grep,Glob --allowedTools Read,Grep,Glob        (with an archive; else --tools "")
  --disallowedTools Bash,PowerShell,Write,Edit,...,mcp__*
  --permission-mode dontAsk --strict-mcp-config --safe-mode
  --disable-slash-commands --no-session-persistence
  --json-schema <task output schema>
```

with the input JSON on stdin, and the working directory the nation's archive folder (or an
empty temporary folder). At most two run at once. `selfTest` reads only `loggedIn`,
`authMethod` and `subscriptionType` from `claude auth status`.

## Tasks

One prompt per task in `prompts/<task>.md`, loaded by `prompts.ts`. Each has its stable
sections first (role, independence, rules, the Founder, tone), then `## Input` and
`## Output`, so the whole file caches as one prefix.

| Task | Tier | Plays |
|---|---|---|
| `legislature.sitting` | strategic | A house debating a petition: ladder and division |
| `court.opinion` | strategic | A bench ruling every option permitted or barred |
| `council.sitting` | standard | A small council, sitting as a court or as a house |
| `electorate.referendum` | standard | The people voting on a petition |
| `ministry.advice` | bulk | A ministry's paper and costing |
| `executive.decision` | strategic | The executive, in found mode |
| `world.day` | standard | The country, its events and its press (replaces 0.5's `briefing.md`) |
| `founding.institutions` | standard | Rewording a generated government in the nation's colours |
| `factbook.draft` | standard | A factbook entry for the Founder to edit |
| `letters.draft` | bulk | Letters to the Founder and the office's draft replies |
| `exchange.reply` | standard | A body answering a remonstrance, reference, reply, address or message |
| `bill.sitting` | standard | The legislature's own business: bills and readings |

### Prompts kept from 0.5, not used

`dilemma-draft.md`, `dilemma-variant.md`, `npc-move.md` and `review.md` are the 0.5 prompts for
drafting and rewording dilemmas, NPC nations' moves and a review gate. Nothing loads them in
0.6; they are kept for the authoring tools and NPC diplomacy that may use them later.
`briefing.md` (the 0.5 front page) is superseded by `world.day.md` and has been removed.
