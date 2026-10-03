# Security

The game runs entirely in the browser. There is no server of mine, no account, and nothing is
sent anywhere: saves live in the browser's local storage and leave it only when a player
exports one. So most of the usual web risks do not apply, and the ones that do are about
what a page loaded into someone's browser is allowed to do with what it is given.

## What is in place

- **Player-written text is only ever text.** Nation names, capitals, mottoes and the names typed
  into identity issues go through React as strings and are never inserted as HTML. There is no
  `innerHTML`, `dangerouslySetInnerHTML`, `eval` or `new Function` anywhere in the code.
- **Typed names are cleaned.** Control characters, zero-width characters and bidirectional
  overrides are stripped, whitespace is collapsed, and each field has a length limit
  (`cleanName` in the engine).
- **Saves are checked all the way down before they are trusted.** An imported file is refused if
  it is over 5 MB, and otherwise every part of it is checked for shape and range before the game
  will open it (`deserialize` in the engine). A save from another pack is turned away.
- **A Content Security Policy** is added to the built page: scripts only from the page's own
  origin plus the one inline theme script, allowed by its hash; no plugins, no base-tag
  rewriting, no form submissions, no connections anywhere else.
- **The local server sends** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy` and
  `Cross-Origin-Opener-Policy: same-origin`.
- **The admin password** is stored as a salted PBKDF2-SHA-256 hash (210,000 iterations), never as
  the password. It is compared in constant time, and a wrong answer costs a second.
- **Dependencies** are checked with `pnpm audit`.

## What it does not protect against

- The admin password locks the admin page against someone playing the game. Anyone with the
  browser's developer tools can read or change local storage, so it is not, and cannot be,
  protection against them. The same goes for the sandbox mark on a nation.
- Saves are not signed. A player can edit their own save file, and that is their business.

## Checks I run before a release

```
pnpm audit
pnpm typecheck
pnpm test
pnpm build      # and confirm the policy is in apps/web/dist/index.html
```

Plus a search of the source for `innerHTML`, `dangerouslySetInnerHTML`, `eval(`, `new Function`,
`document.write` and `window.open`, which should find nothing.

## Reporting a problem

Open an issue on the repository, or tell me directly if it is something that should not be public
yet.
