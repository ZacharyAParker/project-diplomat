# Security

The game is a page served by a small server on your own computer. The server listens on
`127.0.0.1` only, keeps every nation in the `data/` folder, and is the only thing that talks to the
AI. There's no account and no online service of mine. So the risks that matter are another web
page or program reaching the local server, a save or reply that tries to be more than data, and
the keys kept on disk.

## What is in place

- **The server answers only to itself.** It listens on `127.0.0.1`. Every request must carry a Host
  of `127.0.0.1:<port>` or `localhost:<port>`, which stops DNS rebinding, and anything that
  changes the game must come from the game's own origin and not from a cross-site page. It takes
  no cross-origin requests.
- **Headers.** Every response carries a Content Security Policy. The page may run only its own
  scripts plus the one inline theme script, allowed by its hash, and may connect only to its own
  server: no plugins, no base-tag rewriting, no form submissions. The server also sends
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a
  restrictive `Permissions-Policy`, and same-origin opener and resource policies.
- **Text is only ever text.** Names, mottoes, Words, letters and everything the AI writes go
  through React as strings and are never inserted as HTML. There is no `innerHTML`,
  `dangerouslySetInnerHTML`, `eval` or `new Function` in the code. Typed names have control,
  zero-width and bidirectional-override characters stripped and a length limit.
- **Saves and replies are checked before they're trusted.** An imported save is refused over 5 MB
  and otherwise checked for shape and range all the way down. Every AI reply is checked against
  the task's schema and the constitution's rules: a body can only do what its form allows, a court
  can only lift a bar it could have lifted, and the engine, not the model, sets every number.
- **Keys stay on the server.** The Anthropic API key in `data/settings.json` and the Director's
  token in `data/director-token` are never sent to the browser or put in any response. The key is
  stored in plain text; protect the `data/` folder the way you would any file with a key in it.
- **The bodies are sealed in.** With **My own Claude Code**, each body runs with read-only tools
  confined to its own nation's Archive. Other tools, MCP servers, hooks, plugins and project
  instructions are not loaded, `ooc/` is out of reach, and the API key variables are removed from
  its environment.
- **The Director's tools need the token.** The MCP server that gives Claude Code the game's tools
  reaches the local server with the token from `data/director-token`. Cheats are recorded in the
  out-of-character log and can be undone.
- **The admin password** is stored as a salted PBKDF2-SHA-256 hash (210,000 iterations), compared
  in constant time, and a wrong answer costs a second.
- **Dependencies** are few (five at run time) and checked with `pnpm audit`.

## What it does not protect against

- **Anything already on your computer.** A program running as you can read `data/`, including the
  API key, and can call the local server. The game is not a sandbox against your own machine.
- **The admin password** locks the admin page against someone playing the game, nothing more.
  The browser's developer tools can get round it, and so can anyone with the `data/` folder. The
  same goes for the sandbox mark on a nation.
- **Saves aren't signed.** You can edit your own save, and that's your business.
- **The Director in your terminal** is your own Claude Code session. What it can do outside the
  game's tools depends on the permissions you give it.
- **The AI provider.** What you send to Anthropic is handled by Anthropic. See
  [PRIVACY.md](PRIVACY.md).

## Checks I run before a release

```
pnpm audit
pnpm typecheck
pnpm test
pnpm build      # and confirm the policy is in apps/web/dist/index.html
```

Plus a search of the source for `innerHTML`, `dangerouslySetInnerHTML`, `eval(`, `new Function`,
`document.write` and `window.open`, which should find nothing, and a search of what's being
committed for keys and tokens.

## Reporting a problem

Report a vulnerability privately with GitHub's **Report a vulnerability** button on the
repository's [Security tab](https://github.com/ZacharyAParker/project-diplomat/security). Please
don't open a public issue for something that could hurt players before it's fixed, and don't
include real API keys or saves in a report. Anything else can go in an ordinary issue.

---
Project Diplomat v0.7.1 · © 2026 Zachary Parker
