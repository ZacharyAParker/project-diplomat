# The web app

The game's screens, in the browser. Vite, React and TypeScript. From 0.6 the nations live on the local
server (`apps/server`), which runs the engine, keeps the saves and the Archive on disk, and calls the AI. The
browser is its client: every action is a request, and the nation comes back in the reply. The engine is still
bundled here, but only to read: forecasts, the agenda, the classification and support are worked out from the
state the server sent. The browser's own storage keeps the theme, and any saves left there by 0.5 until they
are moved.

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

`pnpm dev` serves the screens only. Without the server running they say so ("The server is not answering")
and offer to try again. The tests need no server: they run the app against an in-memory one
(`src/test/fakeServer.ts`) built on the engine.

`#/kit` is a hidden page with every base component on it in both themes. I look at it after changing
any token.

## How it's organised

```
src/api.ts    the client for the server: every request, its body and its reply
src/logic     plain TypeScript, no React, each file with a test beside it
src/store     the game store and the React hooks over it
src/ui        base components, exported from ui/index.ts
src/screens   one file per screen, with the desk's pieces in screens/desk and the government
              website in screens/gov
src/styles    tokens.css, base.css, components.css, screens.css, world.css
src/test      fixtures, the fake server and the mount helper shared by the tests
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
- `docket.ts` reads a docket's standing out in words and maps it onto the Accept buttons (accept, veto with
  reasons, or a Word only). It never works out what the rules allow: the server's `rules.ts` does.
- `forms.ts` is the names and one-line descriptions of the forms of government, the modes and the series.
  The bodies themselves are built by the server.
- `markdown.ts` reads Markdown into a tree; `ui/Markdown.tsx` draws it. See "Documents" below.
- `hemicycle.ts` places the seats of a legislature's chart.
- `legacy.ts` finds the 0.5 saves in the browser's storage.

### The store

`createGameStore(api, content, { kv, pollMs })` in `store/gameStore.ts` is the only thing that changes a
nation. Each action is a request to the server through `api` (an `Api`, from `api.ts`); the reply's
`{ nation, government, census }` is checked against the pack exactly as a save file is (`saves.ts`
`decode`), and only then do the listeners hear. The tests hand it the fake server instead of
`createHttpApi()`. Screens read it through `useGame()`:

- `current` is the open nation, or null: `id`, `state`, `history`, plus `nationClass`, `support`,
  `electionIn` (null for a nation that holds no elections), `agenda`, `dayComplete`,
  `forecastDecision()` and `forecastSituation()`, all straight from the engine; and `government`,
  `census` and `mode`, as the server sent them.
- Every action is async and throws an Error whose message is the server's, ready to show. Screens run
  them through `useAction()`, which gives a busy mark for the button and the reason when it is refused.
- `decide(dilemmaId, course, { text, veto, word })` and `decideSituation(optionId)` return the timeline
  entry. `endDay()` and, in found mode, `run(days)` return the entries the night produced.
- `pollDockets()` asks after the dockets; the desk calls it every `pollMs` (2 s) while any is sitting,
  reconciling, exchanging or deciding, and stops when none is or the desk is left. A docket that the
  executive decided on its own makes the store fetch the nation again.
- `convene`, `giveWord`, `answerQuestion`, `letter`, `moveBill`, `writeFactbook`, `editFactbook`,
  `draftFactbook`, `archive`, `document`, `setMode`, the sandbox's `adjust`, `callUp`, `startCrisis`,
  `skipDays`, and `found`, `open`, `reload`, `close`, `setIdentity`, `remove`, `exportSave`, `importSave`,
  `moveLegacy`, `aiSettings`, `saveAiSettings`, `testAi`.
- `nations`, `loaded` and `offline` are the home screen's list and whether the server answered.
  `problem` is a nation that will not open, `notice` an older pack. `status` is the server's, for the
  AI line in the menu. `legacy` is the 0.5 saves still in the browser.

The app never works out an effect itself. It shows the engine's forecast before a choice and the
timeline entry after it.

### Saves

The server keeps them (`data/nations/<id>/save.json` and the archive beside it). What it sends for a nation
is `{ id, createdAt, updatedAt, state, history }`, where `state` is the engine's own `serialize()` text and
`history` is one snapshot per day ended. The client reads it with the same `decode` that 0.5 used for save
files, so a nation from another pack is refused by name and an older version of the pack opens with a
notice.

0.5 kept saves in `localStorage` (`diplomat:nation:<id>`, and an index). On first load the home screen
offers to move them to the server (`POST /api/nations/import` with each), and removes each from the browser
only once the server has taken it. One the server refuses stays where it is, with the reason.

A nation that will not open is never deleted for the player: its page says what is wrong, offers the
server's export of it, and removes it only when asked.

### Addresses

```
#/                    home
#/found               founding: name, then /flag, /questions, /form, /mode, /founder
#/n/<id>/morning      the first morning
#/n/<id>/desk         the daily loop: paper, agenda with dockets, overnight, election night
#/n/<id>/nation       and /record, /settings, /sandbox
#/n/<id>/gov          the government website: Today
#/n/<id>/gov/library?q=&series=&issuer=&from=&to=&page=
#/n/<id>/gov/doc/<document id>
#/n/<id>/gov/in-force, /executive, /country, /founder
#/n/<id>/gov/body/<body id>
#/ai                  the AI settings, outside a nation
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

### Dockets

A major issue (and a minor one, where the constitution sends minors through the bodies) is a petition with a
docket. Between "The issue" and "The debate" the card shows it: its status and the progress lines while the
bodies sit, the ministries' advice, each sitting (the ladder, the division by party with names beside the
colours, carried and binding in words), each review's ruling per course (permitted or barred, or "advised
against" when it binds nobody, the split, the articles, the markers), the exchanges, and the standing's own
explanation. A body played by the rules-based stand-in says "(sat without the AI)".

The Accept buttons follow the standing, as `logic/docket.ts` reads it. A barred course is disabled, with
"Overrule by the Founder's Word" folded under it: a Word is entered word for word and sent with the decision.
When a vote binds, only that course is enabled. When a carried course may be set aside, accepting another
asks for written reasons first. Dismissal is a course of its own only when the standing allows it. A docket
that failed says why and offers "Convene again".

In found mode there are no Accept buttons: the executive decides, and the desk shows its decision with the
docket. Every course still has the Word under it, and the foot of the desk has "Run the day" and "Run a
week" in place of "End the day".

### The government website

The nation's own official site, inside the game shell, in Claudetopia's register: a navy masthead with the
flag as its seal, closed by a rule in the flag's second colour, ruled sections and tables rather than cards,
and the Founder's page in midnight and gold in both editions. Its colours are the `--gov-*` and
`--founder-*` tokens; the flag's colours come in as `--flag-a` and `--flag-b`.

- **Today**: the order of business, what is before the Founder, the latest divisions and rulings, the bills,
  the almanac's latest opinion and front pages, and the newest documents.
- **Library**: every document, searched and filtered by the server, 25 a page, the filters in the address.
- **A document**: its particulars, its text, its contents, what it cites and what cites it, and a print
  layout that strips the chrome and adds its reference at the foot.
- **In force**: directions owed, rulings, the constitution and statutes, the bills.
- **A body**: a legislature's seat chart (an SVG half-circle, with a table of the same figures beside it),
  parties and leaders, members and divisions; a court's or council's members, how each reads the law, and
  how they split on each petition.
- **Executive**, **Country** (census, opinion, the press by outlet, matters arising) and the **Founder's
  page** (questions to answer, with No answer and Ask me later; letters with the office's draft to adopt or
  change, No reply and Mark read; the Words given, to confirm; and a form to give a Word, with what it
  overrules and Silence).

### Documents

Documents and factbooks are Markdown, and are drawn by `ui/Markdown.tsx` from the tree `logic/markdown.ts`
reads: headings, paragraphs, lists, tables, emphasis, block quotes, code and links. Nothing is ever turned
into an HTML string. A tag in the text is printed as the characters of a tag. A link goes only somewhere in
the game: an address starting `#/` that the router knows, or a document id, which goes to that document. Any
other link (another site, `javascript:`, `data:`) is printed as its words.

### The server API

`api.ts` speaks the API in `docs/design/government.md`. Every request that changes anything carries
`X-Diplomat: 1`. An error is `{ error }`, thrown with that message. Beyond the design doc, the client relies
on these shapes (the server should send them):

- `GET /api/nations` → `Summary[]` or `{ nations: Summary[] }` (the 0.5 home-screen line).
- `GET /api/nations/:id` → `{ nation, government, census }`, with `census: CensusFigure[]` worked out by the
  server. The client computes no census.
- Every action that changes a nation (`decide`, `situation`, `end-day`, `run`, `convene`, `sandbox`,
  `identity`, `mode`, `words`, `questions/:qid`, `letters/:lid`, `bills`, `factbooks`) → at least
  `{ nation, government }`, and `census` when it moved. `decide` and `situation` add `entry`; `end-day` and
  `run` add `entries`.
- `decide` takes `veto` and `word` as plain strings: the reasons, and the Word's text.
- `GET …/dockets` → `{ dockets: Docket[] }` (or a list, or a record by dilemma id).
- `GET …/archive` → `{ documents: DocumentHead[], total }`, with `from` and `to` as engine days.
- `GET …/archive/:docId` → `{ document, citedBy }`, or the document with `citedBy` beside its fields.
- `POST …/factbooks/draft` `{ title, category, notes }` → `{ title, body }`.
- `GET /api/settings` → `{ backend, apiKeySet, models, minorsThroughBodies }`; `POST /api/settings/test` →
  a `ProviderStatus`, or `{ status }`.
- `POST /api/nations/import` → `{ id, name?, notice? }`. `GET …/export` is read as text and downloaded.

## Design rules

It is meant to look like the nation games I grew up on: a parchment-grey menu down the left, a
landscape strip across the top with the flag set into it, Georgia for anything read, Helvetica or
Verdana for anything worked, green links and green buttons. The look lives in `styles/world.css`,
loaded last. These are the rules I hold myself to.

1. **Tokens only.** Every colour, type size and gap comes from `styles/tokens.css`, and there are no
   colour values anywhere else, apart from the banner and the bevels on buttons and pills. The night
   edition is the same names with different values. Flag colours and party colours are the other exception (data, drawn only through `flagShapes` and `safeHex`), because a
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

React, Vite and Vitest with jsdom and Testing Library. `@diplomat/engine` and, for its types only,
`@diplomat/government`; nothing from the government package is bundled, so the page needs none of its code
at run time. The local server, `apps/server`, at run time. The typefaces are system fonts, so nothing is
bundled and nothing is loaded from a CDN. No UI kit, no CSS framework, no router, no state library.
