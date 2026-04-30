# SpecShot

**Paste or drop a screenshot, annotate it with notes and arrows, copy it back to your clipboard — pixel-perfect, at Retina resolution.**

Built for quickly communicating UI feedback or bug context to an LLM, a designer, or a teammate.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/platform-macOS-000000?logo=apple)
![License](https://img.shields.io/badge/license-private-lightgrey)

---

## What it does

1. **Paste or drop** a screenshot — press `⌘V` to paste from the clipboard, or drag any image file straight into the window.
2. **Click** anywhere on the image to drop an annotation dot. A colored card appears in the sidebar.
3. **Type** a note in the card describing what you want to say about that point.
4. **Drag** the dot on the image to reposition it at any time.
5. **Copy** the fully annotated view back to your clipboard (or save it as a PNG, or drag it straight into another app).

The exported image is a pixel-perfect, full-Retina screenshot of the actual rendered UI — sidebar, arrows, dots, and all.

---

## Features

| Feature | Detail |
|---|---|
| **⌘V paste** | Reads image from clipboard; auto-loaded on launch |
| **Drag-and-drop** | Drag any image file into the window — works whether the canvas is empty or has an existing image; a frosted overlay appears while hovering |
| **Click-to-annotate** | Drops a colored dot + matching sidebar card |
| **Draggable dots** | Reposition any annotation point after placing it |
| **Dashed arrows** | A fixed viewport-level SVG connects each card to its dot in real time |
| **Auto-cycling colors** | Pink → Blue → Teal → Orange, then repeats |
| **Auto-expanding textarea** | Cards grow as you type |
| **Copy to Clipboard** | Captures the live UI at native Retina resolution via `webContents.capturePage` |
| **Save as PNG** | Native save dialog |
| **Drag out** | Hover the image and drag the handle to drop a PNG into any app |
| **Global hotkey** | `⌘Shift+2` shows/focuses the window from anywhere |
| **Tray icon** | Window hides to tray instead of closing; Dock icon follows window visibility |

---

## Screenshots

> _Add screenshots here once the UI is finalized._

---

## Tech stack

- **[Electron 33](https://www.electronjs.org/)** — desktop shell
- **[electron-vite](https://electron-vite.org/)** — build tooling (Vite for renderer, esbuild for main/preload)
- **[React 18](https://react.dev/)** — renderer UI
- **[TypeScript 5.6](https://www.typescriptlang.org/)** — throughout
- **[lucide-react](https://lucide.dev/)** — icons
- No CSS framework — plain CSS with CSS custom properties

---

## Project structure

```
src/
├── main/
│   └── index.ts          # Electron main process — window, tray, IPC handlers, global hotkey
├── preload/
│   ├── index.ts          # Exposes window.electronAPI to the renderer
│   └── index.d.ts        # TypeScript types for the preload bridge
└── renderer/src/
    ├── App.tsx            # Root component — all state, arrow SVG overlay, export logic
    ├── types.ts           # Annotation interface
    ├── main.tsx           # React entry point
    └── components/
        ├── TopBar.tsx     # Draggable title bar, Save + Copy buttons
        ├── Sidebar.tsx    # 280px panel, scrollable stack of AnnotationCards
        ├── AnnotationCard.tsx  # Colored card with auto-expanding textarea
        └── Canvas.tsx     # Image display, crosshair click-to-annotate, drag handle

resources/
├── icon.icns             # App icon (macOS)
├── app_1024.png          # App icon source assets
└── taskbar_*.png         # Tray/taskbar icon assets
```

---

## Getting started

### Prerequisites

- **Node.js** ≥ 20
- **macOS** (the app uses macOS-specific Electron APIs — tray, Dock, `capturePage`)

### Install & run

```bash
git clone https://github.com/gabemartin/ityscreenshot.git
cd ityscreenshot
npm install
npm run dev
```

The app window opens automatically. Press `⌘Shift+2` at any time to bring it back if you close it.

### Build a distributable DMG

```bash
npm run dist
```

The `.dmg` is written to `dist/`. App ID: `com.gabemartin.ityscreenshot`.

---

## How the export works

Rather than an offscreen canvas pipeline, export captures the actual rendered Electron window:

1. `isExporting = true` is set in React state — this hides the sidebar footer ("+ Add note") so it doesn't appear in the output.
2. A double `requestAnimationFrame` ensures the DOM has repainted before capture fires.
3. `captureContent()` IPC call triggers `webContents.capturePage({ x: 0, y: 44, … })` in the main process, cropping out the 44 px title bar.
4. Returns a full Retina-resolution PNG data URL (2× on Retina displays).
5. `isExporting = false` restores the footer.

The result looks exactly like the live UI — no re-rendering, no font substitution, no layout differences.

---

## How arrows work

A `position: fixed` full-viewport `<svg>` sits at `z-index: 10` in `App.tsx`. Each `AnnotationCard` registers its DOM element into a `cardElsRef` Map via a `useCallback` ref. On every render (and after resize/scroll), arrow coordinates are recalculated from `getBoundingClientRect()` on both the card and the image element.

> **Important:** the ref callback in `AnnotationCard` must be wrapped in `useCallback`. An inline arrow function creates a new function identity each render, which causes React to call the old ref with `null` on every cycle — triggering an infinite re-render loop.

---

## Annotation data model

```typescript
interface Annotation {
  id: string
  point: { x: number; y: number }  // 0–1 fractions on the image
  text: string
  color: string  // cycles through: #E91E8C → #2979FF → #00BFA5 → #FF6D00
}
```

---

## IPC bridge (`window.electronAPI`)

| Method | Description |
|---|---|
| `readClipboardImage()` | Returns the clipboard image as a data URL, or `null` |
| `writeClipboardImage(dataUrl)` | Writes a PNG data URL to the clipboard |
| `saveImage(dataUrl)` | Opens a native Save dialog and writes the PNG |
| `captureContent()` | Captures the rendered window below the top bar; returns a data URL |
| `writeDragTemp(dataUrl)` | Writes a temp PNG to disk for native drag-out |
| `dragOut()` | Initiates a native file drag from the precomputed temp file |

---

## Known caveats & loose ends

- **`AnnotationOverlay.tsx`** — still in the file tree but unused (arrows moved to the App-level SVG). Safe to delete.
- **`utils/export.ts`** — unused offscreen-canvas pipeline, kept for reference. Safe to delete.
- **Dev dock icon** — macOS caches the icon from the Electron binary. `app.dock.setIcon()` alone isn't enough; you must also replace `node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns` with `resources/icon.icns`. Redo this after any `npm install` that upgrades Electron.
- **Autofill DevTools errors** — harmless `Autofill.enable failed` messages in the dev console; they disappear in a packaged build.
- **Speech-to-text** — removed. `webkitSpeechRecognition` fails in Electron (no bundled Google API key). A Swift `SFSpeechRecognizer` subprocess was explored and removed for complexity; revisit later.

---

## License

Private. All rights reserved.
