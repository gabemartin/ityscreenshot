---
name: specshot-setup
description: >-
  First-machine SpecShot developer setup: Node, npm install, dock icon,
  packaged app into /Applications, and the first-run walkthrough. Use when
  cloning the repo, onboarding a coworker, starting a new project from this
  repo, or anyone asks how to install the dev environment.
---

# SpecShot developer setup

Read [README.md](../../../README.md) Getting started if you need extra context. Then **do the work** — do not only paste commands for the human.

There is **no `.env`**. SpecShot has no API keys. Do not invent one.

## Walkthrough (run it)

1. Confirm macOS + Node ≥ 20 (`node -v`). If Node is missing, install via Homebrew (`brew install node@20`) and stop with that instruction only if brew itself is missing.
2. If this workspace is empty or is not the SpecShot repo, clone:

```bash
git clone https://github.com/gabemartin/ityscreenshot.git .
```

Use a subfolder only if the user already named one. Repo is **public**.
3. From the repo root:

```bash
npm install
npm run setup -- --yes
```

`npm run setup -- --yes` installs deps if needed, copies the Electron.dev dock icon, builds, and installs `/Applications/SpecShot.app` (see `install-to-applications`).
4. If setup skipped the app copy, follow `.cursor/skills/install-to-applications/SKILL.md`.
5. Smoke-check: `/Applications/SpecShot.app` exists. Optionally `npm run dev` to confirm the Electron window opens.

## Then walk the human (say this)

Numbered, short:

1. **Packaged app** is in `/Applications/SpecShot.app` — open it from Spotlight for daily use.
2. **Dev mode** is `npm run dev` — use that when editing this repo.
3. **⌘⇧2** focuses the window from any app. Closing the window hides it to the menu-bar tray.
4. **⌘V** pastes a screenshot. Drag an image, `.zip`, or `.speck` onto the window.
5. Tools: **N** note, **A** arrow, **S** square, **C** circle. Click the image to place a note.
6. **Save Project** writes a `.zip` bundle (notes + source + rendered export) for LLM intake. **Copy Image** puts a Retina PNG on the clipboard.
7. After any `npm install` that upgrades Electron, re-copy `resources/icon.icns` onto `node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns` (setup does this).

## Scripts

| Command | What |
|---|---|
| `npm run setup` | Interactive walkthrough (TTY). `--yes` for agents |
| `npm run setup -- --yes` | Non-interactive full setup |
| `npm run install:app` | Build if needed + copy to `/Applications` |
| `npm run dev` | Electron + Vite |
| `npm run pack` | Unpacked `.app` in `dist/mac*` |
| `npm run dist` | DMG in `dist/` |

## Done when

- [ ] `node_modules` installed
- [ ] `/Applications/SpecShot.app` exists
- [ ] Human has the first-run checklist above
