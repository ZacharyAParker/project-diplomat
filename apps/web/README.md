# The web app

The whole game, in the browser. Vite, React and TypeScript, with the engine running client-side.
There is no server, nothing is fetched at runtime, and saves live in `localStorage`.

## Running it

From the repo root:

```
pnpm install
pnpm dev         # dev server with hot reload
pnpm build       # production build into apps/web/dist
pnpm start       # serve that build locally
pnpm test        # the engine and content tests, then the web tests
pnpm typecheck   # the root project, then this one
```

All of them except `start` first run `scripts/build-pack.ts`, which validates `packs/core` and writes it to
`src/generated/pack.json`. If the pack has a problem the script prints all of them and stops, so the
app can't be built or tested against a broken pack. The generated folder is not checked in.

`#/kit` is a hidden page with every base component on it in both themes. I look at it after changing
any token.

## How it's organised

```
src/logic     plain TypeScript, no React, each file with a test beside it
src/store     the game store and the React hooks over it
src/ui        base components, exported from ui/index.ts
src/screens   one file per screen, with the desk's pieces in screens/desk
src/styles    tokens.css, base.css, components.css, screens.css
src/test      fixtures shared by the tests
```

The rule is that components stay thin. If something can be worked out without the DOM, it goes in
`logic` and gets a unit test.

- `saves.ts` is the save file, the storage keys, the index, export and import.
- `changes.ts` turns a `Change` into words: direction, size, good or bad, and the clause the paper prints.
- `frontpage.ts` builds the morning paper from the timeline. The lead prints every reason, in short
  paragraphs; a brief prints only what moved most. The record has the rest.
- `flags.ts`, `identity.ts`, `suggest.ts` are the founding screens' logic.
- `router.ts` parses and builds hash addresses. `settings.ts` is theme and motion.
- `desk.ts` turns the agenda into cards and a forecast into what a card prints, and decides when to
  say the pack has run out.
- `term.ts` reads how a term ended and builds the term report from the timeline and the snapshots.
- `nation.ts` is the rows of the nation page: movement since yesterday, trend lines, policy groups.
- `record.ts` groups the timeline by day, newest first, and filters it.

### The store

`createGameStore(kv, content)` in `store/gameStore.ts` is the only thing that changes a nation. Each
action asks the engine for the new state, writes it to storage, then tells its listeners. Screens
read it through `useGame()`:

- `current` is the open nation, or null: `id`, `state`, `history`, plus `nationClass`, `support`,
  `electionIn`, `agenda`, `dayComplete`, `forecastDecision()` and `forecastSituation()`, all straight
  from the engine.
- `decide(dilemmaId, optionId)` and `decideSituation(optionId)` return the timeline entry they wrote.
- `endDay()` returns the entries the night produced.
- `found`, `open`, `close`, `setIdentity`, `remove`, `exportSave`, `importSave`, `dismissNotice`.
- `nations` is the list for the home screen. `problem`, `notice` and `saveError` are the three kinds
  of bad news.

The app never works out an effect itself. It shows the engine's forecast before a choice and the
timeline entry after it.

### Saves

One key per nation (`diplomat:nation:<id>`) and an index (`diplomat:index`). A save is
`{ format, id, createdAt, updatedAt, state, history }`, where `state` is the engine's own
`serialize()` text and `history` is one snapshot per day ended, with day 0 being the nation as
founded. The index is only a convenience: if it is missing or disagrees with the saves it is rebuilt.

A save that can't be read is never deleted. It shows up on the home screen with the reason, and its
page offers the raw text as a download. A save from a different pack is refused by name. A different
version of the same pack loads with a notice, once.

### Addresses

```
#/                    home
#/found               founding: name, then #/found/flag, then #/found/questions
#/n/<id>/morning      the first morning
#/n/<id>/desk         the daily loop: paper, agenda, overnight, election night
#/n/<id>/nation       and /record, /settings
#/kit                 the component kit
```

### The desk

The desk is one screen that turns into three. In the morning it is the paper beside the agenda. After
"End the day" it is the night: an election or a fall first, on its own, then everything else the night
produced. Then it is the next morning. None of that is in the address, so reloading during the night
lands on the morning paper, which reports the same entries.

A card is replaced by its result in the same place on the page, and the result is the timeline entry
as the engine wrote it. The one thing added is the policy line from the forecast, because an entry
does not record policy changes. A paper left on the desk is only a mark in the screen's own state: the
engine has no such thing, it just lets the day end.

The term report is worked out from the timeline and the daily snapshots whenever it is asked for, so
it can be read again from the next morning's paper and from the record.

## Design rules

It is meant to look like the nation games I grew up on: a parchment-grey menu down the left, a
landscape strip across the top with the flag set into it, Georgia for anything read, Helvetica or
Verdana for anything worked, green links and green buttons. The look lives in `styles/world.css`,
loaded last. These are the rules I hold myself to.

1. **Tokens only.** Every colour, type size and gap comes from `styles/tokens.css`, and there are no
   colour values anywhere else, apart from the banner and the bevels on buttons and pills. The night
   edition is the same names with different values. Flag colours are the other exception, because a
   flag is the same in both.
2. **Two voices.** Georgia (`--font-text`, `--font-display`) for headings and everything read. The
   UI stack (`--font-ui`) for menus, buttons, labels and figures.
3. **An issue is an issue.** Title, "The issue", "The debate", numbered positions, the forecast
   under each, and an Accept button under that. One click decides.
4. **Green means yes.** Accept, End the day and the main action on a screen are green. Red is for
   bad news and crises.
5. **No section kickers.** A heading speaks for itself. A small line under a title is allowed only
   when it carries information, like which country an issue is about.
6. **Never colour alone.** A change is an arrow, a name, a size in words, blocks, and "for the
   better" or "for the worse" in text. Debt going up reads as worse because `changes.ts` says so, not
   because someone picked a colour. Use `ChangeLine` and `ChangeList` and don't rebuild them.
7. **No raw numbers for effects.** The player sees "up a little", never "+2". Levels (support,
   an indicator's bar) are numbers. Movements are words.
8. **Every screen is a `Screen`.** It owns the `h1`, sets the tab title, and takes focus after
   navigation. A link goes somewhere (`LinkTo`, `TextLink`), a button does something (`Button`).
9. **Phone first.** Everything works at 360 px. Under 48rem the menu becomes a bar along the top.
   Tap targets are at least `--tap` high. Long names wrap.
10. **Motion goes through `--turn`.** It is zero under reduced motion, whether the system or the
    setting asks for it, so nothing needs its own media query.
11. **Player text is text.** Names go through React as strings and nowhere else. Flags from a save
    are drawn through `flagShapes`, which trusts neither the layout nor the colours.
12. **Copy is dry and short.** British spelling, no exclamation marks, and an error says what is
    wrong and what can be done about it.
13. **Our own furniture.** The layout follows the genre's conventions, but the wordmark, icons,
    banners and colours are ours. Nothing is taken from NationStates.

## Dependencies

React, Vite and Vitest with jsdom and Testing Library. The typefaces are system fonts, so nothing is
bundled and nothing is loaded from a CDN. No UI kit, no CSS framework, no router, no state library.
