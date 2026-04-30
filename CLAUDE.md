# ityscreenshot — Project Context

A macOS desktop app for annotating screenshots to communicate with LLMs. Paste an image, click points on it to create notes, then copy the annotated result back to clipboard as a pixel-perfect screenshot of the UI itself.

**Repo:** https://github.com/gabemartin/ityscreenshot  
**Local:** `/Users/gabemartin/Projects/ityscreenshot/ityscreenshot`  
**Run:** `npm install && npm run dev`

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
- IPC handlers: `clipboard:read-image`, `clipboard:write-image`, `dialog:save-image`, `capture-content`

### Preload — `src/preload/index.ts`
Exposes `window.electronAPI` with:
- `readClipboardImage(): Promise<string | null>`
- `writeClipboardImage(dataUrl: string): Promise<void>`
- `saveImage(dataUrl: string): Promise<void>`
- `captureContent(): Promise<string | null>` — captures the rendered window below the top bar

### Renderer — `src/renderer/src/`

| File | Role |
|---|---|
| `App.tsx` | All state: `imageUrl`, `annotations[]`, `isExporting`, arrow SVG overlay, export handlers, drag-and-drop |
| `TopBar.tsx` | Draggable title bar, Save + Copy to Clipboard buttons |
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

- **Clipboard paste** — `loadFromClipboard()` calls the `clipboard:read-image` IPC handler. Triggered on mount and by `⌘V` (skipped when focus is in a TEXTAREA/INPUT).
- **Drag-and-drop** — `dragenter`/`dragover`/`dragleave`/`drop` handlers on the root `<div>`. A `dragDepthRef` counter prevents the overlay from flickering as the cursor moves across child elements. On drop, the first image file is read via `FileReader.readAsDataURL` and passed to `loadImage`. A full-screen frosted overlay (`isDroppingFile` state) is shown while an image file is hovering over the window.
Export no longer uses the offscreen canvas pipeline. Instead:
1. `isExporting = true` is set in App state — this hides the "+ Add note" footer in Sidebar
2. A double `requestAnimationFrame` ensures the DOM has repainted before capture
3. `captureContent()` IPC call hits `webContents.capturePage({ x: 0, y: 44, width, height - 44 })` in main — skips the 44px top bar
4. Returns a full Retina-resolution PNG dataURL (2x on Retina displays)
5. `isExporting = false` restores the footer

The exported image is pixel-perfect — it looks exactly like the live UI (sidebar with annotation cards + screenshot with dots and arrows), captured at native device resolution.

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
