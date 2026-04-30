# ityscreenshot — Project Context

A macOS desktop app for annotating screenshots to communicate with LLMs. Paste an image, click points on it to create numbered notes, then copy the annotated result back to clipboard as a single flat PNG.

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
- IPC handlers: `clipboard:read-image`, `clipboard:write-image`, `dialog:save-image`

### Preload — `src/preload/index.ts`
Exposes `window.electronAPI` with:
- `readClipboardImage(): Promise<string | null>`
- `writeClipboardImage(dataUrl: string): Promise<void>`
- `saveImage(dataUrl: string): Promise<void>`

### Renderer — `src/renderer/src/`

| File | Role |
|---|---|
| `App.tsx` | All state: `imageUrl`, `annotations[]`, arrow SVG overlay, export handlers |
| `TopBar.tsx` | Draggable title bar, Save + Copy to Clipboard buttons |
| `Sidebar.tsx` | 280px left panel, scrollable stack of AnnotationCards |
| `AnnotationCard.tsx` | Colored left border, auto-expanding textarea, delete button |
| `Canvas.tsx` | Screenshot display, crosshair cursor, click-to-annotate |
| `utils/export.ts` | Offscreen canvas export pipeline |

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

### Export — `utils/export.ts`
Canvas is `naturalWidth + 300px` wide, `max(naturalHeight, sidebar height)` tall.
- **Left:** screenshot with numbered colored bullseye dots at annotation points
- **Right:** notes panel (#f8f8f8) with matching numbered card rows — colored left border + badge + wrapped text
- Dashed lines connecting each card's left edge to its dot on the image
- Returns PNG dataURL, passed to `writeClipboardImage` or `saveImage`

---

## Known Loose Ends

- `AnnotationOverlay.tsx` is still in the file tree but **unused** — arrows moved to App-level SVG. Safe to delete.
- **Tray icon** is a placeholder (borrowed from the `nanna` project). Needs a real icon.
- Dev console shows harmless `Autofill.enable failed` DevTools errors — disappear when packaged.
- **Speech-to-text is removed.** `webkitSpeechRecognition` fails in Electron (no bundled Google API key — audio upload hits `net::ERR_FAILED`). A Swift `SFSpeechRecognizer` subprocess was tried and removed for complexity. Revisit later.
- Export hasn't been tested end-to-end since the sidebar-right redesign.

---

## Bugs Fixed (Session 1)

1. **Cmd+V intercepting textareas** — handler checks `e.target.tagName` and skips if focus is in a TEXTAREA/INPUT
2. **Arrows not connected to cards** — SVG was scoped to image container div; lifted to fixed viewport-level SVG in App.tsx with DOM ref tracking
3. **Infinite re-render loop on click** — inline ref callback `(el) => onRef(id, el)` created a new function each render; fixed with `useCallback` in AnnotationCard
4. **Export not including notes** — handlers were passing raw `imageUrl` instead of calling `renderAnnotatedImage(imageUrl, annotations)`
5. **Export layout** — notes were rendering as a strip below the image; redesigned as sidebar-right panel on the same canvas

---

## Packaging (not yet done)
```bash
npm run dist   # produces a .dmg via electron-builder
```
Config is in `package.json` under `"build"`. App ID: `com.gabemartin.ityscreenshot`.
