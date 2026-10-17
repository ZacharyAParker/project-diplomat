# Privacy policy

Effective October 17, 2026. Applies to Project Diplomat 0.7.0 as distributed in this repository.

## The short version

The game runs on your computer and keeps everything there. There's no account, no analytics, no
crash reporting, no ads and no tracking, and the maintainer receives nothing from it. The only
thing that leaves your computer is the work you send to Anthropic when you switch the AI on, and
that can include whatever you type into the game.

## What stays on your computer

The game's server keeps its files in the `data/` folder of your copy (or the folder you give it
with `--data` or `DIPLOMAT_DATA`):

- `data/nations/<nation>/save.json`: the nation's state
- `data/nations/<nation>/archive/`: its record as Markdown files, including everything the bodies,
  the world and you have written into it, such as Founder's Words and your replies to letters
- `data/nations/<nation>/ooc/`: the out-of-character log of cheats, the bodies' and the
  Director's Claude Code session ids, and the transcript of your conversations with the Director
- `data/settings.json`: the AI settings, including your Anthropic API key if you entered one. The
  key is kept in plain text in this file and is never sent to the browser
- `data/director-token`: a random token the game's MCP tools use to reach the local server

The browser keeps a little in its local storage for the game's page: display settings, the
hashed admin password, and any saves left there by version 0.5 until you move them.

If you use **My own Claude Code** or the Director, Claude Code keeps its own records of those
conversations on your computer, in its own folders and under its own settings. The game doesn't
read or manage them.

Exported saves are files you choose to download, and they go wherever you save them.

## What leaves your computer

Nothing, while the AI is off.

With the AI on, the game sends prompts to Anthropic, either directly with your API key or through
the Claude Code you installed. A prompt is made of what the body or task needs, which can include:

- the nation's name, form of government, figures, laws, parties, people and recent history
- the petition or bill in front of the body, and what the other bodies said about it
- text you wrote: Founder's Words, replies to letters, things you typed when founding the nation
- with **My own Claude Code**, the documents in that nation's Archive the body chooses to read

The other nations, played once a week, receive the same kind of brief about your nation, plus the
state of the world beyond its borders (the other nations, wars, pacts, claims and the Assembly's
business).

The Director receives what you type to it and what it reads through the game's tools, which can
be anything in that nation's save, Archive and out-of-character log.

Anthropic also receives ordinary network information, such as your IP address, and your API key
or Claude Code sign-in, which authenticates the request. Anthropic handles that data under its
own [privacy policy](https://www.anthropic.com/legal/privacy) and the terms of your account. The
game can't promise what Anthropic keeps or how long for, so don't type anything into the game you
wouldn't want sent to it.

The game's page loads nothing from anywhere else. Its fonts are the ones already on your
computer, and its Content Security Policy only lets it talk to its own local server.

## Deleting things

Delete a nation from its Settings page, or remove its folder from `data/nations/` while the game
is stopped. Delete `data/settings.json` to forget the API key and AI settings. Clear the site data
for `127.0.0.1:8150` in your browser to remove what the page kept. Back up anything you want to
keep first; the maintainer doesn't have a copy and can't restore it.

Deleting files here doesn't delete what Anthropic or Claude Code already holds. Use Anthropic's
own controls for that.

## Children

The game isn't directed at children, and the AI features need an Anthropic account, which has its
own age requirements.

## Changes and contact

When these practices change, this page gets a new effective date. The copy in a release describes
that release; the repository may describe a newer one. Questions go to the
[repository](https://github.com/ZacharyAParker/project-diplomat/issues). Report security problems
privately as described in [SECURITY.md](SECURITY.md), and don't post API keys, saves or other
private material in public issues.

---
Project Diplomat v0.7.0 · © 2026 Zachary Parker
