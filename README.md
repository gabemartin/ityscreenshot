# SpecShot

**Paste or drop a screenshot, annotate it with notes, arrows, and shapes, then copy a Retina PNG — or save a `.zip` / `.speck` bundle for LLM intake.**

Built to communicate UI feedback or bug context to an LLM, a designer, or a teammate.

![Electron](https://img.shields.io/badge/Electron-36-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/platform-macOS-000000?logo=apple)
![License](https://img.shields.io/badge/license-private-lightgrey)

---

## What it does

1. **Paste or drop** a screenshot — `⌘V` from the clipboard, or drag an image (or a `.zip` / `.speck` project) into the window.
2. **Place markup** — notes (click), arrows, squares, and circles. Dots and boxes stay draggable.
3. **Write the note** in the colored sidebar card. Cards grow as you type.
4. **Copy Image** for a pixel-perfect Retina PNG of the live UI, or **Save Project** for a structured bundle (`README.md`, `project.json`, source image, rendered export).

The exported PNG is a capture of the actual rendered window (sidebar, arrows, dots), not a re-drawn canvas.

---

## Features

| Feature | Detail |
|---|---|
| **⌘V paste** | Clipboard image; session image is restored on relaunch |
| **Drag-and-drop** | Images onto the canvas; `.zip` / `.speck` hydrates a project |
| **Multi-image canvas** | Drop more screenshots as new rows or extra columns |
| **Note / arrow / square / circle** | Tools in the title bar; shortcuts `N` `A` `S` `C` |
| **Draggable dots + boxes** | Reposition after placing; boxes resize |
| **Dashed card arrows** | Viewport SVG from each sidebar card to its anchor |
| **Crop** | Single-image crop (notes outside the crop are removed) |
| **Auto-cycling colors** | Pink → Blue → Teal → Orange |
| **Copy Image** | Live UI at native Retina via `webContents.capturePage` |
| **Save / Open Project** | `.zip` default (chat-upload friendly); `.speck` also opens |
| **Global hotkey** | `⌘⇧2` shows/focuses the window |
| **Tray** | Close hides to the menu bar; Dock icon follows visibility |

---

## Getting started (new developer)

**macOS only.** Node **20+**. No `.env`, no API keys.

### 1. Prerequisites

```bash
# Xcode command-line tools (once per machine)
xcode-select --install

# Node 20+ if needed
brew install node@20
node -v   # expect v20 or newer
```

### 2. Clone and install

```bash
git clone https://github.com/gabemartin/ityscreenshot.git
cd ityscreenshot
npm install
```

`npm install` prints a reminder to run setup. **Do that next.**

### 3. Walk through setup (required once)

```bash
npm run setup
```

Setup will:

1. Confirm you are on macOS with Node 20+
2. Run `npm install` if `node_modules` is missing
3. Ask to copy `resources/icon.icns` onto the Electron.dev Dock icon (macOS caches the Electron binary icon; `app.dock.setIcon()` is not enough)
4. Ask to **build SpecShot and install `SpecShot.app` into `/Applications`**
5. Print the first-run checklist (hotkey, tray, paste, tools, Save Project vs Copy Image)

Agents / CI: `npm run setup -- --yes` accepts every default.

### 4. Two ways to run

| You want | Command |
|---|---|
| **Daily use** (Launchpad / Spotlight) | `npm run install:app` then open **SpecShot** — this is the packaged app in `/Applications` |
| **Edit the product** | `npm run dev` — Electron window opens from the repo |

`⌘⇧2` focuses the window from anywhere. Closing it hides to the tray; it does not quit.

### Install / refresh the app in `/Applications`

Cursor skill: `.cursor/skills/install-to-applications` (also triggered by “put it in Applications”).

```bash
npm run install:app
```

Equivalent: `npm run pack` then copy `dist/mac-arm64/SpecShot.app` (or `dist/mac/`, `dist/mac-x64/`) to `/Applications/SpecShot.app`.

Shareable disk image (optional):

```bash
npm run dist    # writes dist/SpecShot-*.dmg
```

App ID: `com.gabemartin.ityscreenshot`.

### First-run checklist

1. Open **SpecShot** from `/Applications` (or Spotlight).
2. Paste a screenshot with `⌘V`, or drop a file on the window.
3. Click the image to add a note; switch tools with `N` / `A` / `S` / `C`.
4. **Copy Image** → clipboard PNG. **Save Project** → `.zip` bundle for an LLM.
5. When coding: `npm run dev`. After an Electron upgrade, re-run `npm run setup` so the Dock icon is replaced again.

---

## Agent onboarding

This repo ships two project skills. A new-clone agent should follow them instead of improvising:

| Skill | When |
|---|---|
| `.cursor/skills/specshot-setup` | Clone, first machine, coworker onboard |
| `.cursor/skills/install-to-applications` | Put the built app in `/Applications` |

A workspace rule (`.cursor/rules/specshot-setup.mdc`) tells the agent to run that walkthrough on a fresh clone.

---

## Tech stack

- **[Electron](https://www.electronjs.org/)** — desktop shell
- **[electron-vite](https://electron-vite.org/)** — Vite renderer, esbuild main/preload
- **[React 18](https://react.dev/)** — renderer UI
- **[TypeScript 5.6](https://www.typescriptlang.org/)** — throughout
- **[lucide-react](https://lucide.dev/)** — icons
- **[electron-builder](https://www.electron.build/)** — `pack` (dir) and `dist` (DMG)
- No CSS framework — plain CSS with CSS custom properties

Dev renderer port is **3000** (pinned for Ship Studio). `scripts/dev.mjs` maps `--port` onto `SHIPSTUDIO_DEV_PORT`.

---

## Project structure

```
src/
├── main/
│   ├── index.ts           # Window, tray, IPC, global hotkey, zip/speck I/O
│   └── contextMenu.ts
├── preload/
│   ├── index.ts           # window.electronAPI
│   └── index.d.ts
└── renderer/src/
    ├── App.tsx            # State, arrows, export, DnD, project hydrate
    ├── types.ts
    ├── components/        # TopBar, Sidebar, Canvas, cards, layers, crop
    └── utils/

scripts/
├── setup.mjs              # First-run walkthrough (npm run setup)
├── install-app.sh         # Build if needed → /Applications/SpecShot.app
├── postinstall.mjs        # Reminder after npm install
└── dev.mjs                # electron-vite wrapper (accepts --port)

.cursor/skills/
├── specshot-setup/
└── install-to-applications/

resources/                 # App + tray icons
```

---

## Project bundle (`.zip` / `.speck`)

Every **Save Project** zip contains:

| File | Role |
|---|---|
| `README.md` | LLM instructions + annotation table |
| `project.json` | Versioned manifest (authoritative) |
| `source-image.*` | Original screenshot(s) |
| `rendered-export.*` | Composed view with markup (optional) |

Default save format is `.zip` (chat-upload compatible). The app also opens `.speck`.

Target projects often store bundles at `/specks/`, `/speck/`, or `/spec/` relative to the repo root.

---

## How the export works

1. `isExporting = true` hides the sidebar “+ Add note” footer.
2. A double `requestAnimationFrame` waits for the repaint.
3. `captureContent()` → `webContents.capturePage({ x: 0, y: 44, … })` crops the 44 px title bar.
4. Returns a Retina PNG data URL (2× on Retina).
5. `isExporting = false` restores the footer.

---

## How card arrows work

A `position: fixed` full-viewport `<svg>` in `App.tsx` connects each sidebar card to its image anchor via `getBoundingClientRect()`.

The `AnnotationCard` ref callback **must** be wrapped in `useCallback`. An inline function creates a new identity each render and loops (old ref `null` → `setTick` → render).

---

## Annotation data model

```typescript
interface Annotation {
  id: string
  point?: { x: number; y: number }  // 0–1 fractions; omit = sidebar-only
  text: string
  color: string                     // #E91E8C → #2979FF → #00BFA5 → #FF6D00
  rect?: { x: number; y: number; w: number; h: number }
  imageId?: string                  // which canvas image (v2)
}
```

---

## IPC bridge (`window.electronAPI`)

| Method | Description |
|---|---|
| `readClipboardImage()` | Clipboard image as a data URL, or `null` |
| `writeClipboardImage(dataUrl)` | Write a PNG data URL to the clipboard |
| `saveImage(dataUrl)` | Native Save dialog → PNG |
| `captureContent()` | Capture below the top bar |
| `writeDragTemp` / `dragOut` | Native drag-out of the PNG |
| `writeDragProjectTemp` / `dragOutProject` | Native drag-out of the project zip |
| `saveSessionImage` / `loadSessionImage` | Persist last image across restarts |
| `saveSessionState` / `loadSessionState` | Persist multi-image layout |
| `saveProject` / `openProject` / `openProjectFromPath` | `.zip` / `.speck` bundles |
| `getPathForFile(file)` | Native path of a dropped file (`webUtils`) |

---

## Known caveats

- **`AnnotationOverlay.tsx`** and **`utils/export.ts`** are unused leftovers. Safe to delete.
- **Dev Dock icon** — replace `node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns` with `resources/icon.icns` after Electron upgrades. `npm run setup` does this.
- **Autofill DevTools errors** — harmless `Autofill.enable failed` in dev; gone when packaged.
- **Unsigned local builds** — `install-app.sh` runs `xattr -cr`. If Gatekeeper still blocks, right-click → Open once.
- **Speech-to-text** — removed (`webkitSpeechRecognition` needs a Google key Electron does not ship).

---

## License

Private. All rights reserved.
