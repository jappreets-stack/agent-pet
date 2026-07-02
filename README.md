# agent-pet

A small desktop pet that floats over your screen and shows your AI coding agent's
status at a glance — so you can stop babysitting the terminal.

- 🔴 **red** (gently pulsing) — needs you (a permission prompt is waiting)
- 🟡 **yellow** — working in the background
- 🟢 **green** — just finished
- _no glow_ — idle

It floats on top of every app and Space, roams slowly around the edges, and you can
switch its look from a right-click menu. Currently integrates with **Claude Code**.

## Quick start

```bash
npm install      # get Electron
npm run setup    # install the status hooks into ~/.claude/settings.json
npm start        # launch the pet
```

After `npm run setup`, reload Claude Code's hooks once — open `/hooks`, or restart
Claude Code — so the "needs you" (red) trigger registers.

## How it works

`npm run setup` adds a few [Claude Code hooks](https://docs.claude.com/en/docs/claude-code)
to your global `~/.claude/settings.json`. On each lifecycle event they write one word
(`working`, `blocked`, `done`, …) to a state file; the Electron app reads it and colors
the pet. Installing globally means the status light works in every project.

The pet won't sleep while a turn is active, and a "needs you" signal is never hidden —
so you won't miss a red.

## Uninstall

```bash
npm run unsetup   # removes only its own hooks; the rest of your settings are untouched
```

## Notes

- macOS today (uses always-on-top-over-fullscreen + system idle detection).
- Personal use. Skins that resemble real-world brands are not included in this repo.

## License

MIT
