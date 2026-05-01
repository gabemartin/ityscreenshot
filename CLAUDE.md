# ityscreenshot — Project Context

A macOS desktop app for annotating screenshots to communicate with LLMs. Paste an image, click points on it to create notes, then copy the annotated result back to clipboard as a pixel-perfect screenshot of the UI itself.

**Repo:** https://github.com/gabemartin/ityscreenshot  
**Local:** `/Users/gabemartin/Projects/ityscreenshot/ityscreenshot`  
**Run:** `npm install && npm run dev`

---

## Agent Communication Style

Use concise, low-token language in internal agent communication: subagent prompts, tool call descriptions, task breakdowns, and reasoning steps. Cut filler words. Be direct. Keep code, paths, and commands exact.

User-facing replies should be normal, clear, professional prose.

---

## Tech Stack

- Electron 33 + electron-vite + React 18 + TypeScript
- No CSS framework — plain CSS with CSS variables
- `electron-builder` configured for DMG packaging (not yet used)

---

## Architecture

### Main process — `src/main/index.ts`
- `Cmd+Shift+2` global hotkey → shows/focuses window
- Tray icon (menubar) with Show / Quit — window never closes, always hides to tray
- Dock hidden while window is hidden, shown when window appears
- Window: 1100×720 min 800×600, `titleBarStyle: 'hiddenInset'`
- IPC handlers: `clipboard:read-image`, `clipboard:write-image`, `dialog:save-image`, `capture-content`, `dialog:save-project`, `dialog:open-project`, `project:open-path`

### Preload — `src/preload/index.ts`
Exposes `window.electronAPI` with:
- `readClipboardImage(): Promise<string | null>`
- `writeClipboardImage(dataUrl: string): Promise<void>`
- `saveImage(dataUrl: string): Promise<void>`
- `captureContent(): Promise<string | null>` — captures the rendered window below the top bar
- `writeDragTemp(dataUrl: string): Promise<string | null>` — writes temp PNG to disk for drag-out
- `dragOut(): void` — initiates native OS drag from the temp file
- `saveSessionImage(dataUrl: string): Promise<void>` — persists the image to `<userData>/session-image.txt`
- `loadSessionImage(): Promise<string | null>` — reads back the persisted image on startup
- `saveProject(payload): Promise<string | null>` — saves a `.zip` project bundle via native save dialog
- `openProject(): Promise<OpenProjectResult | null>` — opens a bundle via native open dialog
- `openProjectFromPath(filePath): Promise<OpenProjectResult | null>` — opens a bundle from a known path (drag-drop)
- `getPathForFile(file: File): string` — wraps `webUtils.getPathForFile`; required to get the native path of a dropped file when `contextIsolation: true`

### Renderer — `src/renderer/src/`

| File | Role |
|---|---|
| `App.tsx` | All state: `imageUrl`, `annotations[]`, `isExporting`, arrow SVG overlay, export handlers, drag-and-drop, project save/open/hydrate |
| `TopBar.tsx` | Draggable title bar, Open Project + Save Project + Copy to Clipboard + Save (PNG) buttons |
| `Sidebar.tsx` | 280px left panel, scrollable stack of AnnotationCards. Hides footer when `isExporting` |
| `AnnotationCard.tsx` | Colored left border, auto-expanding textarea, delete button |
| `Canvas.tsx` | Screenshot display, crosshair cursor, click-to-annotate |
| `utils/export.ts` | Unused canvas pipeline — kept but no longer called |

### Annotation data model
```typescript
interface Annotation {
  id: string
  point: { x: number, y: number }  // 0–1 fractions on the image
  text: string
  color: string  // cycles: #E91E8C → #2979FF → #00BFA5 → #FF6D00
}
```

### Arrow rendering (live UI)
A `position: fixed` full-viewport SVG in `App.tsx`. Each `AnnotationCard` registers its DOM element via a stable `useCallback` ref into a `cardElsRef` Map in App. Arrows are calculated each render via `getBoundingClientRect()` on the card + image elements. A `ResizeObserver` on the image bumps a `tick` state to re-trigger on window resize.

**Critical:** the ref callback in `AnnotationCard` must be wrapped in `useCallback`. Inline arrow functions cause an infinite re-render loop — React detects the new function identity, calls the old ref with `null`, which calls `setTick`, which triggers another render.

### Image loading
There are two ways to load an image — both call the shared `loadImage(dataUrl)` helper in `App.tsx` which sets `imageUrl`, clears annotations, and resets `newestId`.

- **Clipboard paste** — `loadFromClipboard()` calls the `clipboard:read-image` IPC handler. Triggered on mount (as fallback) and by `⌘V` (skipped when focus is in a TEXTAREA/INPUT).
- **Drag-and-drop** — `dragenter`/`dragover`/`dragleave`/`drop` handlers on the root `<div>`. A `dragDepthRef` counter prevents the overlay from flickering as the cursor moves across child elements. On drop, the first image file is read via `FileReader.readAsDataURL` and passed to `loadImage`. A full-screen frosted overlay (`isDroppingFile` state) is shown while an image file is hovering over the window.

Every call to `loadImage` also fires `window.electronAPI.saveSessionImage(dataUrl)`, which writes the data URL as plain text to `<userData>/session-image.txt` in the main process. On mount the renderer calls `loadSessionImage()` first; if the file exists it restores directly from there (no clipboard read needed). Only if the file is absent does it fall back to `loadFromClipboard()`. This ensures both pasted and dragged images survive a refresh or full restart.
Export no longer uses the offscreen canvas pipeline. Instead:
1. `isExporting = true` is set in App state — this hides the "+ Add note" footer in Sidebar
2. A double `requestAnimationFrame` ensures the DOM has repainted before capture
3. `captureContent()` IPC call hits `webContents.capturePage({ x: 0, y: 44, width, height - 44 })` in main — skips the 44px top bar
4. Returns a full Retina-resolution PNG dataURL (2x on Retina displays)
5. `isExporting = false` restores the footer

The exported image is pixel-perfect — it looks exactly like the live UI (sidebar with annotation cards + screenshot with dots and arrows), captured at native device resolution.

---

## Project Bundle Format (`.zip` / `.speck`)

### Save / Open flow
- **Save Project** button → `handleSaveProject()` in `App.tsx` → `dialog:save-project` IPC → `writeProjectBundle()` in main
- **Open Project** button → `dialog:open-project` IPC → `parseProjectBundle()` → `hydrateFromProject()` in renderer
- **Drag `.zip` or `.speck` onto app** → `getPathForFile(file)` (preload, uses `webUtils`) → `project:open-path` IPC → `hydrateFromProject()`
- Default save format is `.zip` (chat-upload compatible). App also imports `.speck`.

### Bundle contents
Every saved bundle contains:
| File | Description |
|---|---|
| `README.md` | LLM instructions (generated dynamically, includes annotation table) |
| `project.json` | Versioned manifest — authoritative source of truth |
| `source-image.*` | Original un-annotated screenshot |
| `rendered-export.*` | Composed view with dots, dashed arrows, and sidebar cards (optional) |

### `project.json` schema
```typescript
{
  version: 1,
  createdAt: string,        // ISO 8601
  updatedAt: string,
  annotations: Annotation[],  // raw array
  llmMapping: {
    notes: Array<{
      index: number,          // 1-based order number — positional, may change on reorder
      id: string,             // stable unique ID — never changes (format: ann_TIMESTAMP_RANDOM)
      text: string,
      point: { x: number, y: number },  // 0–1 fractions, (0,0)=top-left
      color: string,
    }>
  },
  canvas: { width: number, height: number } | null,
  assets: {
    sourceImage: { path: string, mimeType: string },
    renderedImage?: { path: string, mimeType: string },
  }
}
```

### Annotation reference conventions
- **Order number** (`index`, 1-based): use for quick human-facing tasks ("fix note 2"). Positional — changes if annotations are reordered.
- **Annotation ID** (`id`): use for tracking across sessions, renames, reorders. Stable — assigned once, never changes.

### LLM README (`README.md` inside bundle)
Generated by `buildBundleReadme()` in `src/main/index.ts`. Written as the first file in every ZIP. Contains:
- Plain-text annotation summary table (index, ID, coordinates, color, text)
- Coordinate system explanation
- Order number vs ID guidance
- `/specks` / `/speck` / `/spec` folder convention
- `project.json` schema reference

**The `/specks` convention:** Every project using SpecShot is assumed to store bundles at one of `/specks/`, `/speck/`, or `/spec/` relative to the project root. When an LLM receives only a screenshot (no bundle), or when context is incomplete, it should ask the user to share the bundle or point to one of those folders.

---

## Bundle Intake Autopilot (Critical)

When the user sends a local file path ending in `.zip` or `.speck.zip` (for example `/Users/.../foo.zip`), treat it as a **SpecShot bundle intake request by default**.

Do not ask "what do you want to do with this zip?" as the first response. Instead, take initiative and parse the bundle immediately.

### Mandatory first-pass workflow

1. Verify the file exists.
2. List archive contents.
3. Extract to a temp folder.
4. Read `project.json` first (authoritative source).
5. Read `README.md` second (supporting context).
6. Return a structured interpretation in one response.

### Required output format for bundle intake

Use this exact high-level structure (wording can vary):

- `Bundle type` and validity (valid SpecShot bundle / invalid / partial)
- `Files found`
- `Annotations` in order (index + text)
- `Structured details` per annotation (id, point, color)
- `Action translation` (turn notes into implementation tasks)
- `Only one clarifier if blocked` (for example: missing codebase/path)

### Behavior rules

- Assume user intent is "interpret and proceed" unless they explicitly say otherwise.
- Keep it concise and actionable; avoid asking open-ended follow-ups.
- If `project.json` is missing, state that clearly and fall back to `README.md` + file list.
- If the bundle cannot be read, return the exact failure reason and the next concrete step.
- If this repository is not the target project, still complete interpretation and then ask for the target repo/path in one line.

### Example default response shape

1. "Valid SpecShot bundle detected."
2. "Found files: project.json, README.md, source-image.png, rendered-export.png."
3. "Parsed 3 notes: ... "
4. "Implementation tasks: ... "
5. "Share target repo/path and I will apply these changes."

---

## Known Loose Ends

- `AnnotationOverlay.tsx` is still in the file tree but **unused** — arrows moved to App-level SVG. Safe to delete.
- `utils/export.ts` is **unused** — kept but no longer called. Safe to delete.
- **Dev dock icon:** macOS caches the icon from the Electron binary bundle. `app.dock.setIcon()` alone isn't enough — you must also replace `node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns` with `resources/icon.icns`. Re-do this after any `npm install` that upgrades Electron.
- Dev console shows harmless `Autofill.enable failed` DevTools errors — disappear when packaged.
- **Speech-to-text is removed.** `webkitSpeechRecognition` fails in Electron (no bundled Google API key — audio upload hits `net::ERR_FAILED`). A Swift `SFSpeechRecognizer` subprocess was tried and removed for complexity. Revisit later.

---

## Bugs Fixed (Session 1)

1. **Cmd+V intercepting textareas** — handler checks `e.target.tagName` and skips if focus is in a TEXTAREA/INPUT
2. **Arrows not connected to cards** — SVG was scoped to image container div; lifted to fixed viewport-level SVG in App.tsx with DOM ref tracking
3. **Infinite re-render loop on click** — inline ref callback `(el) => onRef(id, el)` created a new function each render; fixed with `useCallback` in AnnotationCard
4. **Export not including notes** — handlers were passing raw `imageUrl` instead of the annotated render
5. **Export layout/resolution** — offscreen canvas approach was low-res and didn't match the UI; replaced with `webContents.capturePage()` for pixel-perfect Retina output

---

## Packaging (not yet done)
```bash
npm run dist   # produces a .dmg via electron-builder
```
Config is in `package.json` under `"build"`. App ID: `com.gabemartin.ityscreenshot`.
