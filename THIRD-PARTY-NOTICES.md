# Third-party notices

Project Diplomat's own code, writing and media are covered by [LICENSE](LICENSE) and
[LICENSE-SCOPE.md](LICENSE-SCOPE.md). The components below belong to their authors and are used
under their own licenses. Nothing in Project Diplomat's licenses or terms changes those licenses,
and where they conflict for a component, that component's license wins.

None of these packages is committed to this repository. `pnpm install` downloads them from the npm
registry, and each one's license text comes with it in `node_modules/`.

## In the game

These run when you play: the web page is built with the first three, and the server uses the
last two.

- react 19.3.0 — MIT — © Meta Platforms, Inc. and affiliates
- react-dom 19.3.0 — MIT — © Meta Platforms, Inc. and affiliates
- scheduler 0.28.0 — MIT — © Meta Platforms, Inc. and affiliates
- zod 4.6.5 — MIT — © Colin McDonnell
- yaml 2.9.1 — ISC — © Eemeli Aro

The game bundles no fonts, icons or images from anyone else. Its text is set in Georgia, or
whichever serif your system has, from your own computer.

## Used to build and test it

Not part of what you play. TypeScript (Apache-2.0), Vite (MIT), @vitejs/plugin-react (MIT),
Vitest (MIT), jsdom (MIT), the Testing Library packages (MIT) and @types/node, @types/react and
@types/react-dom (MIT), with their own dependencies. Counting the five above, that's 98 packages
at the time of this release, under MIT, MIT-0, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, CC0-1.0 and
MPL-2.0. `pnpm licenses list` prints the current list.

## Used to make the trailer

`motion/` is a separate project that makes the trailer and the README loop. It isn't part of the
game.

- Remotion 4.0.536 (remotion, @remotion/cli, @remotion/google-fonts) — Remotion License — ©
  Remotion. Free for individuals, for-profit organisations with up to 3 employees, and
  non-profits; larger companies need a company license from remotion.dev before rendering with
  it. See `motion/node_modules/remotion/LICENSE.md` after installing
- IBM Plex Mono — SIL Open Font License 1.1 — © 2017 IBM Corp., with Reserved Font Name "Plex".
  Loaded from Google Fonts while rendering, and drawn into the trailer's labels
- the trailer's score is synthesised by `motion/music.mjs` and uses no samples or recordings
- ffmpeg, if you have it, cuts the README loop. It isn't bundled

## Programs the game can use

None of these is bundled. You install them yourself, under their own licenses and terms.

- Node.js — MIT, with the licenses of its bundled components
- pnpm — MIT
- Claude Code — Anthropic's software, under Anthropic's terms. The game runs the `claude` command
  you installed only if you choose **My own Claude Code** or use the Director
- the Anthropic API — an online service under Anthropic's terms, used only with your own key

## The core pack's license text

[packs/core/LICENSE](packs/core/LICENSE) is the Creative Commons Attribution-ShareAlike 4.0
International legal code, published by Creative Commons. Creative Commons is not a party to that
license and is not affiliated with Project Diplomat.

---
Project Diplomat v0.6.1 · © 2026 Zachary Parker
