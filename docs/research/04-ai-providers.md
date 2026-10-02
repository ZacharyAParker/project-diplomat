# AI providers: running generation on the player's own Claude or ChatGPT subscription

Written 2026-10-01. Covers Anthropic (Claude Code, Claude Agent SDK) and OpenAI (Codex CLI, Codex SDK, app-server, Sign in with ChatGPT).

The idea: the game can call a model for dilemmas, news and NPC diplomacy, and I'd like players to be able to point it at a subscription they already pay for instead of a metered API key. This is me working out what each provider actually allows and how I'd wire it up.

## 0. How to read this

- **Source quality.** Quotes from `code.claude.com` and `platform.claude.com` are copied straight from the page. Quotes from Anthropic's consumer terms, Anthropic's support site and the OpenAI pages are from my notes and I haven't double-checked every word, so re-read them at the URL before relying on exact wording.
- **OpenAI docs domain.** `developers.openai.com/codex/*` now 308-redirects to `learn.chatgpt.com/docs/*`. The URLs below are the ones that actually served content.
- **Not legal advice.** Where the terms don't answer the question I say so and don't pick the convenient reading.
- **None of this has been run yet.** Everything technical here is from documentation. Latency and rate-limit numbers are unmeasured.

## 1. Bottom line

| Case | Anthropic (Claude Code / Agent SDK) | OpenAI (Codex / Sign in with ChatGPT) |
|---|---|---|
| (a) Developer uses own subscription for development and offline pre-generation | Allowed for development. Bulk content pre-generation is grey: limits "assume ordinary, individual usage". | Allowed for development. Bulk scripted extraction is grey against the Terms of Use "programmatically extract ... Output" clause (the terms page wouldn't load for me, so that wording is second-hand). |
| (b) Each player runs the game locally with their own logged-in harness | **Grey, leaning against without Anthropic's approval.** Docs say product developers "should use API key authentication" and may not "offer claude.ai login or rate limits for their products"; but they also say nothing prevents "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". | **Clearly allowed through Sign in with ChatGPT** if the game is open source or a personal local project. Paid or remotely hosted apps must join a waitlist first. Driving `codex exec` instead is technically supported but not explicitly addressed for third-party products. |
| (c) Hosted server, one subscription, many players | **Prohibited.** | **Prohibited.** |

The two providers have diverged. OpenAI now has an official, documented route for exactly this use (plan usage in third-party local/open-source apps). Anthropic does not, and has enforced against third-party use of subscription credentials twice in 2026.

## 2. What is permitted: Anthropic

### 2.1 The governing text

**Consumer Terms of Service** (effective October 8, 2025; https://www.anthropic.com/legal/consumer-terms). Prohibited uses include:

> "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, to access the Services through automated or non-human means, whether through a bot, script, or otherwise."

> "To develop any products or services that compete with our Services, including to develop or train any artificial intelligence or machine learning algorithms or models or resell the Services."

> "You may not share your Account login information, Anthropic API key, or Account credentials with anyone else. You also may not make your Account available to anyone else."

**Claude Code legal and compliance page** (https://code.claude.com/docs/en/legal-and-compliance), verbatim:

> "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK."

> "**OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."

> "**Developers** building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider. Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow."

> "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code as described under *Can customers offer Claude Code in their products?* above."

> "Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice."

> "For questions about permitted authentication methods for your use case, please contact sales."

The same page, on running Claude Code inside a product:

> "Unless we've mutually agreed otherwise, preinstalling or running Claude Code in your products or services (e.g. in hosted sandboxes or other agent infrastructure) requires agreeing to our Commercial Terms of Service and complying with the conditions below: **The Claude Code binary must not be modified.** ... customers may not remove, disable, or restrict any authentication method built into it ... **Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf.** Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential ... That usage is billed directly to the end user under their own agreement with Anthropic".

**Agent SDK overview and quickstart** (https://code.claude.com/docs/en/agent-sdk/overview, https://code.claude.com/docs/en/agent-sdk/quickstart), verbatim:

> "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead."

> "Use of the Claude Agent SDK is governed by Anthropic's Commercial Terms of Service, including when you use it to power products and services that you make available to your own customers and end users".

**Automation by the subscriber is explicitly documented.** `claude -p` is documented for scripts and CI (https://code.claude.com/docs/en/headless), and `claude setup-token` is described as: "Generate a long-lived OAuth token for CI and scripts. ... Requires a Claude subscription." (https://code.claude.com/docs/en/cli-reference). That is the "where we otherwise explicitly permit it" exception to the automation clause, for the subscriber's own scripting.

**Billing status of headless use** (https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan). Anthropic announced that from June 15, 2026, Agent SDK and `claude -p` usage would move off plan limits onto a separate monthly credit (Pro $20, Max 5x $100, Max 20x $200), covering Agent SDK projects, `claude -p`, GitHub Actions and "third-party apps using Agent SDK authentication". That change was paused on June 15, 2026: "Agent SDK usage still draws from your subscription's usage limits", and "When we have an update, we'll share it before anything takes effect." Expect this to change again.

### 2.2 Case by case

**(a) Developer's own subscription.** Using `claude -p` or the Agent SDK on your own machine under your own login, for building and testing the game, is plainly within the documented use. Bulk pre-generation of shipped content (thousands of dilemmas) is grey: nothing forbids it, but limits "assume ordinary, individual usage" and OAuth is "designed to support ordinary use of Claude Code". A content pipeline is not obviously "ordinary use of Claude Code". The safe route for large batches is an API key with the Batch API (50% off). I did not verify what the consumer terms say about ownership and commercial use of outputs; check that before shipping generated content.

**(b) Each player's own logged-in Claude Code.** This is genuinely ambiguous and I will not call it allowed.

- For it: the player signs in to the unmodified binary through Anthropic's own flow; the game never sees credentials; usage is billed to the player; the legal page says nothing prevents an end user doing exactly that.
- Against it: the game is a "product ... that interact[s] with Claude's capabilities", and such developers "should use API key authentication". The Agent SDK note bars offering "claude.ai login or rate limits for their products" without prior approval, and a game whose selling point is "runs on your Claude subscription" is arguably offering claude.ai rate limits for its product. Whether shelling out to the user's CLI counts as "rout[ing] requests through ... plan credentials on behalf of their users" is not answered by the text. The "preinstalling or running Claude Code in your products" section requires the Commercial Terms.
- The paused credit plan named "third-party apps using Agent SDK authentication" as a recognised category of subscription usage, which shows Anthropic knows such apps exist; it is not a grant of permission to build one.

Practical reading: do not use the Agent SDK with subscription auth in a distributed game. If you offer a Claude subscription mode at all, make it shell out to the Claude Code the player installed and logged in to themselves, never bundle or modify the binary, never touch `.credentials.json` or tokens, do not market it as a subscription feature, and ask Anthropic first (the docs invite exactly this question). Treat the API-key path as the supported Anthropic integration.

**(c) Hosted server on one subscription.** Prohibited by three separate provisions: the account-sharing clause, "route requests through Free, Pro, or Max plan credentials on behalf of their users", and "may not pay for, resell, or intermediate Claude usage on their end users' behalf".

### 2.3 Enforcement history (secondary sources; I found no primary Anthropic post)

- January 9, 2026: Anthropic blocked subscription OAuth tokens from working outside official apps, without notice, affecting OpenCode and similar tools; partly walked back after backlash. (https://www.zbuild.io/resources/news/opencode-blocked-anthropic-2026, https://dev.to/mcrolly/anthropic-kills-claude-subscription-access-for-third-party-tools-like-openclaw-what-it-means-for-3ipc)
- February 2026: terms and docs revised to state the third-party restriction explicitly (the "Authentication and credential use" text quoted above).
- April 4, 2026: Pro and Max access blocked for third-party agentic tools (OpenClaw, OpenCode, Cline, RooCode); users moved to "extra usage" billing or API keys. Boris Cherny, head of Claude Code, is quoted: "Anthropic's subscriptions weren't built for the usage patterns of these third-party tools." (https://thenextweb.com/news/anthropic-openclaw-claude-subscription-ban-cost)

Those tools extracted the OAuth token and called the API directly, which is different from invoking the official binary. The reports do not mention action against apps that shell out to `claude -p`. I found no reliable account of how many accounts were banned.

## 3. What is permitted: OpenAI

### 3.1 The governing text

**Sign in with ChatGPT** (reported as expanded at DevDay, September 29, 2026). Docs: https://developers.openai.com/siwc, https://developers.openai.com/siwc/quickstart, https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt, https://learn.chatgpt.com/docs/sign-in-with-chatgpt.

> "ChatGPT plan usage is available to open-source projects, personal projects that run locally, and selected private apps."

> "If you're building a paid or remotely hosted app, join the waitlist to request access before offering it to users."

> "Sign in with ChatGPT is currently available to selected commercial partners through a limited trial. ChatGPT plan usage is available to all open-source partners and selected private clients."

User side: plan usage "uses your Codex / ChatGPT work usage included in your plan", the user can "set a weekly limit as a percentage of your overall weekly plan usage" per app, and an "app's limit is a cap, not a separate allowance." Requires "an eligible ChatGPT Plus or Pro plan." The open-source flow "needs neither a client secret nor a partner API key"; tokens stay on the user's device with no hosted relay. The summarised docs list prohibited uses as competing services, unauthorised resale and circumventing platform policies; I did not see the full policy text.

The three eligibility phrasings above differ slightly ("open-source projects" vs "open-source partners"). Whether an unlisted open-source hobby game can self-register through dynamic client registration, or must be accepted as a partner, is not settled by what I could read.

**Codex authentication** (https://learn.chatgpt.com/docs/auth, https://learn.chatgpt.com/docs/non-interactive-mode):

> "API keys are still the recommended default for automation"

> "If you use file-based storage, treat `~/.codex/auth.json` like a password: it contains access tokens. Don't commit it, paste it into tickets, or share it in chat."

ChatGPT-managed auth in CI is described as an advanced workflow, with "Do not use this workflow for public or open-source repositories."

**App-server** (https://learn.chatgpt.com/docs/app-server): "Use it when you want a deep integration inside your own product: authentication, conversation history, approvals, and streamed agent events." This shows OpenAI contemplates third-party products embedding Codex; the page does not say which auth mode such products may rely on.

**Terms of Use** (https://openai.com/policies/terms-of-use/ and the ROW variant returned HTTP 403 to me). Via search snippets only: users may not "automatically or programmatically extract data or Output", and "You may not share your account credentials or make your account available to anyone else". Unverified at source.

### 3.2 Case by case

**(a) Developer's own subscription.** `codex exec` under your own ChatGPT login is documented and fine for development. Large scripted pre-generation sits uneasily with the "programmatically extract ... Output" clause and with "API keys are still the recommended default for automation". Grey; use an API key with batch pricing for bulk runs.

**(b) Each player's own plan.** Clearly allowed through Sign in with ChatGPT if the game is open source or a personal local project and free. If the game is sold, or any part is remotely hosted, you must be accepted from the waitlist first. Driving the player's installed `codex exec` instead is technically supported and never touches credentials, but no document I read addresses third-party apps doing so; grey, and inferior to the sanctioned route.

**(c) Hosted server on one subscription.** Prohibited: credential-sharing clause, the "treat like a password" guidance, the no-hosted-relay design of the open-source flow, and the waitlist requirement for remotely hosted apps.

### 3.3 Enforcement history

I found no reports of OpenAI enforcing against third-party tools using ChatGPT-plan Codex auth; the direction in 2026 has been to formalise it. Absence of reports is not evidence of permission.

## 4. Technical integration: Claude Code

Sources: https://code.claude.com/docs/en/headless, https://code.claude.com/docs/en/cli-reference, https://code.claude.com/docs/en/authentication, https://code.claude.com/docs/en/model-config, https://code.claude.com/docs/en/agent-sdk/structured-outputs.

### 4.1 Recommended invocation (subscription mode)

```
claude -p \
  --output-format json \
  --json-schema "<schema json>" \
  --system-prompt-file <game>/prompts/dilemma.txt \
  --model sonnet --effort low \
  --tools "" --disallowedTools "mcp__*" --strict-mcp-config \
  --disable-slash-commands --safe-mode \
  --permission-mode dontAsk --no-session-persistence
```

Prompt on stdin (capped at 10MB). Run with the working directory set to an empty folder the game owns.

| Concern | Mechanism |
|---|---|
| Structured output | `--output-format json` returns `result`, `session_id`, `total_cost_usd`, usage; with `--json-schema` the validated object is in `structured_output`. Invalid schema exits with an error. `format` keywords are not enforced. Schemas are validated as JSON Schema draft-07 in the SDK. |
| Streaming | `--output-format stream-json --verbose --include-partial-messages`; last line is a `result` message. |
| System prompt | `--system-prompt` / `--system-prompt-file` replace the default entirely; `--append-system-prompt[-file]` add to it. Replace for a game: the default prompt is a coding-agent prompt and costs tokens. |
| Model | `--model` with alias (`haiku`, `sonnet`, `opus`, `fable`) or full ID. Always pass it: the plan default is Opus 5.5 on Pro and Max, which burns quota fast. `fable` "may bill to usage credits on some plans". |
| Effort | `--effort low|medium|high|xhigh|max`. |
| No tools | `--tools ""` disables built-in tools; it "doesn't affect MCP tools", so add `--disallowedTools "mcp__*"` and `--strict-mcp-config`. |
| Isolation | Without `--bare`, `-p` "runs the hooks in a project's `.claude/settings.json` and connects the servers in its `.mcp.json`, even in a folder you've never trusted", and loads the user's CLAUDE.md, skills and plugins. Use an empty cwd plus `--safe-mode` (disables customisations; "Authentication ... work normally, which differs from `--bare`"). |
| Session reuse | `--resume <session_id>` or `--continue`; `--fork-session` to branch. For a long-lived process, `--input-format stream-json --output-format stream-json` keeps one process open across turns and avoids per-call startup. |
| Limits | `--max-turns`, `--max-budget-usd` (print mode). Cost figures are client-side estimates. |
| Exit codes | 0 success, non-zero failure; 143 on SIGTERM. In-run failures such as missing auth are printed "as the result on stdout". |

**Do not use `--bare` for subscription mode.** "In bare mode, Claude Code never reads OAuth credentials or the system keychain", and it does not read `CLAUDE_CODE_OAUTH_TOKEN` either. The docs add: "`--bare` is the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release." If that ships, `claude -p` will stop using subscription login unless a flag opts out. This is the largest technical risk to the Claude subscription path; pin behaviour with a startup self-test.

### 4.2 Detecting login and credential source

- `claude auth status` prints JSON and "Exits with code 0 if logged in, 1 if not". `authMethod` is one of `none`, `claude.ai`, `oauth_token`, `api_key`, `api_key_helper`, `third_party`. Only `claude.ai` and `oauth_token` mean subscription.
- Precedence matters: `ANTHROPIC_API_KEY` outranks subscription login, and "In non-interactive mode (`-p`), the key is always used when present." If the player has that variable set, a "subscription" call silently bills their API account. Remove it from the child environment in subscription mode, and tell the player which credential is active.
- In `stream-json`, `system/api_retry` events carry an `error` category: `authentication_failed`, `rate_limit`, `billing_error`, `overloaded`, `account_on_hold` and others. Map these to provider states.
- Expired login: requests fail with "Login expired · Please run /login". `/login` is not available in `-p`; send the player to a terminal.
- Credentials live in the macOS Keychain, `~/.claude/.credentials.json` on Linux, `%USERPROFILE%\.claude\.credentials.json` on Windows. The game must never read them.

### 4.3 Concurrency, rate limits, latency

- No numeric subscription limits are published in the pages I read. Usage is shared: "all activity in both tools counts against the same usage limits" (https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan). Game calls compete with the player's own Claude use.
- No documented concurrency cap for parallel `claude -p` processes. Assume one or two at a time and back off on `rate_limit`.
- Startup latency is not documented and I did not measure it. Each `-p` call starts a process and, without `--bare`, loads configuration. Plan for seconds, not milliseconds; generate ahead of need and never block a turn on a call.

### 4.4 Claude Agent SDK

`@anthropic-ai/claude-agent-sdk` (TypeScript) and `claude-agent-sdk` (Python) run the Claude Code binary as a subprocess and bundle their own copy. Options include `systemPrompt`, `allowedTools`, `permissionMode`, `mcpServers`, `outputFormat: { type: "json_schema", schema }` (result in `structured_output`; failure subtype `error_max_structured_output_retries`; a `success` with no `structured_output` must also be treated as failure), and `pathToClaudeCodeExecutable`.

It is the better engineering fit (typed messages, streaming, sessions) but the worse terms fit: it is governed by the Commercial Terms and its docs tell product developers to use API keys. Use the SDK for the API-key back end. For any subscription mode, shell out to the player's own installed CLI instead, so that the "unmodified Claude Code binary" sentence is the one that applies.

For plain text generation with an API key, neither harness is needed: call the Messages API directly with structured outputs (`output_config.format`). It is cheaper, faster and has no agent prompt overhead.

## 5. Technical integration: OpenAI

Sources: https://learn.chatgpt.com/docs/non-interactive-mode, https://learn.chatgpt.com/docs/cli/reference, https://learn.chatgpt.com/docs/auth, https://learn.chatgpt.com/docs/app-server, https://github.com/openai/codex/blob/main/sdk/typescript/README.md, https://learn.chatgpt.com/docs/pricing.

### 5.1 Preferred: Sign in with ChatGPT, direct Responses API

For a game that only needs text and JSON, this is the right route and the sanctioned one. The DevKit flow: `createChatGPT` with `sendHostId: true`; `chatgpt.signIn()` opens the browser (PKCE, loopback redirect on `http://127.0.0.1:<port>/callback`, `client_id=dynamic_agent_client` on first registration, returning an `oaiapp_...` client ID); scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`; then `chatgpt.listModels()` and `chatgpt.streamResponse()` against the Responses API. Check that `chatgpt.tokens.use.direct` was granted: "a successful identity sign-in alone does not grant permission to use the user's ChatGPT plan." Store tokens with owner-only permissions and never log them.

No agent harness, no tools to disable, native structured outputs, per-app weekly cap set by the user. I did not confirm the npm package name of the DevKit, its licence, or which models `listModels()` returns on Plus.

### 5.2 Alternative: `codex exec`

```
codex exec --json --output-schema schema.json -o last.txt \
  --sandbox read-only --skip-git-repo-check --ephemeral \
  --cd <empty dir> -m gpt-6-luna -
```

| Concern | Mechanism |
|---|---|
| Structured output | `--output-schema <path>` constrains the final message; `-o/--output-last-message <path>` writes it to a file. |
| Events | `--json` emits JSONL: `thread.started`, `turn.started`, `turn.completed`, `item.started`, `item.completed`, `error`. |
| Model | `-m/--model`; IDs seen in docs include `gpt-6.1-sol`. `-c key=value` overrides config. |
| Sandbox | `read-only` (the default for exec), `workspace-write`, `danger-full-access`. |
| Isolation | `--cd`, `--skip-git-repo-check`, `--ephemeral` (no session files), `--ignore-user-config`, `--ignore-rules`. |
| Session reuse | `codex exec resume <SESSION_ID>` or `resume --last`. |
| Prompt | Argument, or `-` to read stdin. |
| Login check | `codex login status` exits 1 and prints "Not logged in" when unauthenticated (from third-party reports and GitHub issues, not the official reference). It reportedly reports not-logged-in for non-OAuth providers. |
| Auth | ChatGPT login cached in `~/.codex/auth.json` or the OS keyring; `CODEX_API_KEY` for key auth; device-code login for headless machines. |

Gaps I could not close: there is no flag I could verify that removes all tools (read-only sandbox blocks writes, but the model can still run read commands and inspect the working directory, so use an empty directory); the config keys for replacing the system prompt (`developer_instructions`, `model_instructions_file`) and for disabling web search are unverified because the config reference returned 404; and I do not know whether `--ignore-user-config` affects auth.

### 5.3 Codex SDK and app-server

- **Codex SDK** (`@openai/codex-sdk`, Node 18+): "wraps the `codex` CLI", spawning it and exchanging JSONL over stdin/stdout. `new Codex()`, `codex.startThread({ workingDirectory, skipGitRepoCheck })`, `thread.run(prompt, { outputSchema })` returning `finalResponse`, `runStreamed()`, `resumeThread(id)`. A convenience over `codex exec`, with the same auth.
- **App-server**: JSON-RPC 2.0 over stdio (JSONL), experimental WebSocket. `initialize`, `thread/start`, `thread/resume`, `turn/start` (accepts `outputSchema`), `turn/interrupt`, `model/list`. One long-lived process, so no per-call startup. The docs say "If you are automating jobs or running Codex in CI, use the Codex SDK instead." I did not find the account and rate-limit methods.
- **MCP server mode** (`codex mcp-server`): exists per the CLI reference; I have not looked into it. Not needed here.

### 5.4 Limits under subscription

Codex is included in Free, Go, Plus, Pro, Business, Edu and Enterprise. Local messages per five hours on Plus: GPT-6 Astra 5 to 45, GPT-6.1 Sol 15 to 160, GPT-6 Sol 15 to 150, GPT-6 Luna 350 to 3,000. "Weekly limits may apply." Pro currently has no five-hour limit. At the limit, Plus and Pro users can buy credits. Luna is the only tier with headroom for bulk generation on Plus.

## 6. Models and prices

### 6.1 Lineups and API prices (USD per million tokens)

Anthropic (https://platform.claude.com/docs/en/about-claude/pricing):

| Model | ID | Input | Output | Cache read | Batch in / out |
|---|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | $10 | $50 | $0.25 | $5 / $25 |
| Claude Opus 5.5 | `claude-opus-5-5` | $4 | $20 | $0.20 | $2 / $10 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 | $10 | $0.20 | $1 / $5 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1 | $5 | $0.10 | $0.50 / $2.50 |

Opus 5, Opus 4.8 and Sonnet 5 remain served. Opus 5.5 and Sonnet 5.5 cannot have thinking disabled; control cost with effort.

OpenAI (https://developers.openai.com/api/docs/pricing):

| Model | Input | Cached input | Output |
|---|---|---|---|
| GPT-6 Astra | $10.00 | $1.00 | $50.00 |
| GPT-6.1 Sol | $2.00 | $0.10 | $10.00 |
| GPT-6 Sol | $2.00 | $0.20 | $10.00 |
| GPT-6 Luna | $0.10 | $0.01 | $0.50 |

Batch is 50% off. `omni-moderation-latest` is free.

### 6.2 Model per task

These are my recommendations from tier positioning and price, not from benchmarks on this workload. Run a small eval before fixing them.

| Task | Claude | OpenAI | Notes |
|---|---|---|---|
| Bulk flavour text (news blurbs, headlines) | Haiku 4.5 | GPT-6 Luna | High volume, low stakes. Luna is 10x cheaper than Haiku. |
| Structured dilemma authoring with stat effects | Sonnet 5.5, low or medium effort | GPT-6.1 Sol | Needs schema adherence and coherent trade-offs. Always validate and clamp effects in code. |
| Long-horizon NPC nation strategy | Opus 5.5, medium effort | GPT-6.1 Sol; Astra only for offline authoring | Infrequent calls with a compact state summary. Fable 5.1 and Astra are not worth 2.5x to 5x per call here. |
| Diplomacy text | Sonnet 5.5 | GPT-6 Sol | Tone and consistency matter more than depth. |
| Moderation and validation | Haiku 4.5 | `omni-moderation-latest` plus Luna | Schema and range checks belong in deterministic code; the model only judges content. |

Under subscription limits, prefer the cheaper tier one step earlier than you would with an API key: quota, not dollars, is the constraint, and it is shared with the player's other use.

## 7. Recommended provider abstraction

### 7.1 Interface

```ts
type Capability = "text" | "json_schema" | "streaming" | "session";
type Tier = "bulk" | "standard" | "strategic" | "moderation";

interface GenRequest {
  task: string;                 // "dilemma", "news", "npc_turn", ...
  tier: Tier;                   // mapped to a model per provider
  system: string;
  prompt: string;
  schema?: object;              // JSON Schema draft-07 subset
  maxOutputTokens?: number;
  timeoutMs: number;
  sessionKey?: string;          // optional conversation reuse
}

type GenResult =
  | { ok: true; text?: string; json?: unknown; usage?: Usage; model: string }
  | { ok: false; reason: "not_logged_in" | "rate_limited" | "quota_exhausted"
        | "timeout" | "refused" | "invalid_output" | "unavailable"; retryAfterMs?: number };

interface AiProvider {
  id: string;                               // "claude-cli", "siwc", "codex-exec", "anthropic-api", "openai-api", "none"
  capabilities(): Set<Capability>;
  probe(): Promise<ProviderStatus>;         // installed? logged in? which credential? version?
  generate(req: GenRequest): Promise<GenResult>;
  dispose(): Promise<void>;
}
```

### 7.2 Back ends

| Back end | Transport | Status |
|---|---|---|
| `siwc` | Sign in with ChatGPT DevKit, Responses API | Recommended OpenAI subscription path |
| `openai-api` | Responses API with the player's key | Fallback |
| `anthropic-api` | Messages API with the player's key, structured outputs | Recommended Anthropic path |
| `claude-cli` | Player's installed `claude -p` | Opt-in, experimental, pending Anthropic's answer |
| `codex-exec` | Player's installed `codex exec` | Optional; only if SIWC is unavailable to you |
| `none` | Authored and pre-generated packs | Always present |

Rules for the subscription back ends: locate the binary on PATH and never bundle it; never read, copy or transmit credential files; run in an empty game-owned directory; strip `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CODEX_API_KEY` and `OPENAI_API_KEY` from the child environment unless the player chose key mode; show the player which account and credential type is in use; one concurrent call by default; exponential backoff on rate limits; a per-session budget the player can set.

### 7.3 Degradation

1. **The simulation never depends on a model.** All state changes come from the hand-designed rules. Model output is a proposal: validated against the schema, effects clamped to designer-set ranges, rejected on any failure.
2. **Generate ahead, never inline.** Keep a queue of ready dilemmas and news items per nation; refill in the background. A turn never waits on a call.
3. **Fallback chain per request:** live provider, then the local cache of earlier generations, then the shipped pre-generated pack, then authored templates with slot filling.
4. **AI-run rival nations** fall back to a scripted utility AI. The model, when present, chooses among moves the scripted AI has already scored as legal.
5. **Persist everything generated** in the save, keyed by seed and state hash, so a save replays identically with no provider.
6. **Surface state plainly:** "AI content: on (ChatGPT plan) / paused (limit reached, resumes 14:00) / off". Never fail silently into worse content.
7. **Startup self-test** per provider: one tiny schema-constrained call, checking that the credential type is what the player selected. This catches the `--bare` default change and login expiry.

## 8. Not verified

- OpenAI Terms of Use text (HTTP 403); the quoted clauses come from search snippets.
- OpenAI help articles on plan usage in other apps and Codex with ChatGPT plans (HTTP 403).
- Codex config reference (HTTP 404): system prompt override keys, disabling tools and web search.
- Exact eligibility mechanics for an unlisted open-source game under Sign in with ChatGPT, the DevKit package name and licence, and available models.
- Codex Python SDK existence; app-server account and rate-limit methods; `codex mcp-server` details.
- `codex login status` behaviour (from non-official sources).
- Whether `--safe-mode` and an empty `--setting-sources` combine cleanly with `-p`; whether `--json-schema` needs more than one turn under `--max-turns`.
- Numeric Claude subscription limits, concurrency caps, and startup latency for either CLI.
- Anthropic consumer terms on output ownership and commercial use.
- Primary-source confirmation of the January and April 2026 enforcement events and of the DevDay announcement date.
- Whether the paused Agent SDK credit plan has been rescheduled.
