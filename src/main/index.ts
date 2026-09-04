import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  Tray,
} from 'electron'
import path from 'path'
import { setupWebContextMenu } from './contextMenu'
import fs from 'fs'
import os from 'os'
import AdmZip from 'adm-zip'

// ─── Project bundle types ─────────────────────────────────────────────────────

interface ProjectPoint {
  x: number
  y: number
}

interface ProjectPlacedArrow {
  id: string
  start: ProjectPoint
  end: ProjectPoint
  thickness?: number
  color: string
  imageId?: string
}

interface ProjectLayoutCell {
  imageId: string
  widthFr: number
}

interface ProjectLayoutRow {
  id: string
  cells: ProjectLayoutCell[]
}

interface SessionState {
  version: number
  images: Array<{ id: string; dataUrl: string }>
  rows: ProjectLayoutRow[]
}

interface ProjectRect {
  x: number
  y: number
  w: number
  h: number
}

interface ProjectPlacedShape {
  id: string
  kind: 'square' | 'circle'
  rect: ProjectRect
  thickness?: number
  color: string
  imageId?: string
}

interface ProjectAnnotation {
  id: string
  point?: ProjectPoint
  text: string
  color: string
  imageId?: string
}

interface ProjectAssetEntry {
  path: string
  mimeType: string
}

interface ProjectSourceImageAsset extends ProjectAssetEntry {
  id: string | null
}

interface ProjectManifest {
  version: number
  createdAt: string
  updatedAt: string
  annotations: ProjectAnnotation[]
  placedArrows?: ProjectPlacedArrow[]
  placedShapes?: ProjectPlacedShape[]
  /** v2: row/column layout of the canvas images */
  layout?: ProjectLayoutRow[]
  llmMapping: {
    notes: Array<{
      index: number
      id: string
      text: string
      point?: ProjectPoint
      color: string
      imageId?: string
    }>
  }
  assets: {
    sourceImage: ProjectAssetEntry
    /** v2: one entry per canvas image, in layout order */
    sourceImages?: ProjectSourceImageAsset[]
    renderedImage?: ProjectAssetEntry
  }
}

interface SaveProjectPayload {
  project: Omit<ProjectManifest, 'assets'>
  sourceImageDataUrl: string
  /** v2: all canvas images (first entry matches sourceImageDataUrl) */
  sourceImages?: Array<{ id: string; dataUrl: string }>
  renderedImageDataUrl?: string | null
}

interface OpenProjectResult {
  project: ProjectManifest
  sourceImageDataUrl: string
  sourceImages: Array<{ id: string | null; dataUrl: string }>
  renderedImageDataUrl: string | null
  filePath: string
}

// ─── Globals ─────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let dragTempPath: string | null = null
let dragProjectTempPath: string | null = null

// ─── Dev / prod helper ───────────────────────────────────────────────────────

const isDev = !app.isPackaged

app.setName('SpecShot')

// ─── Bundle helpers ──────────────────────────────────────────────────────────

function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return 'bin'
  }
}

function extensionToMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    default: return 'application/octet-stream'
  }
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid image data URL')
  const [, mimeType, base64] = match
  return { mimeType, buffer: Buffer.from(base64, 'base64') }
}

function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function parseProjectBundle(bundlePath: string): OpenProjectResult {
  const zip = new AdmZip(bundlePath)

  const projectEntry = zip.getEntry('project.json')
  if (!projectEntry) throw new Error('Missing project.json in bundle')

  const project = JSON.parse(projectEntry.getData().toString('utf8')) as ProjectManifest
  if ((project.version !== 1 && project.version !== 2) || !Array.isArray(project.annotations)) {
    throw new Error('Unsupported or invalid project format')
  }

  const readImageEntry = (entryPath: string, mimeType?: string): string => {
    const entry = zip.getEntry(entryPath)
    if (!entry) throw new Error(`Image "${entryPath}" is missing from bundle`)
    const resolvedMime =
      mimeType || extensionToMimeType(path.extname(entryPath).slice(1))
    return toDataUrl(entry.getData(), resolvedMime)
  }

  // v2 bundles list every canvas image; v1 has a single sourceImage entry.
  const sourceAssets: ProjectSourceImageAsset[] =
    Array.isArray(project.assets?.sourceImages) && project.assets.sourceImages.length > 0
      ? project.assets.sourceImages
      : project.assets?.sourceImage?.path
        ? [{ id: null, ...project.assets.sourceImage }]
        : []
  if (sourceAssets.length === 0) throw new Error('Missing source image asset metadata')

  const sourceImages = sourceAssets.map((asset) => ({
    id: asset.id ?? null,
    dataUrl: readImageEntry(asset.path, asset.mimeType),
  }))

  let renderedImageDataUrl: string | null = null
  const renderedPath = project.assets?.renderedImage?.path
  if (renderedPath) {
    const renderedEntry = zip.getEntry(renderedPath)
    if (renderedEntry) {
      const renderedMimeType =
        project.assets.renderedImage?.mimeType ||
        extensionToMimeType(path.extname(renderedPath).slice(1))
      renderedImageDataUrl = toDataUrl(renderedEntry.getData(), renderedMimeType)
    }
  }

  return {
    project,
    sourceImageDataUrl: sourceImages[0].dataUrl,
    sourceImages,
    renderedImageDataUrl,
    filePath: bundlePath,
  }
}

function buildBundleReadme(manifest: Omit<ProjectManifest, 'assets'>, sourceNames: string[], renderedName?: string): string {
  const notes = manifest.llmMapping?.notes ?? []
  const createdAt = manifest.createdAt ?? new Date().toISOString()
  const isMultiImage = sourceNames.length > 1

  const tableHeader = isMultiImage
    ? '| # | ID | Image | Point (x, y) | Color | Note |\n|---|---|---|---|---|---|'
    : '| # | ID | Point (x, y) | Color | Note |\n|---|---|---|---|---|'
  const tableRows = notes.map((n) => {
    const pointCell = n.point
      ? `(${n.point.x.toFixed(3)}, ${n.point.y.toFixed(3)})`
      : '— *(sidebar-only)*'
    const cells = [
      `${n.index}`,
      `\`${n.id}\``,
      ...(isMultiImage ? [n.imageId ? `\`${n.imageId}\`` : '*(first)*'] : []),
      pointCell,
      n.color,
      n.text ? n.text.replace(/\n/g, ' ') : '*(empty)*',
    ]
    return `| ${cells.join(' | ')} |`
  }).join('\n')
  const annotationTable = notes.length > 0
    ? `${tableHeader}\n${tableRows}`
    : '*No annotations in this bundle.*'

  const sourceLines = sourceNames.map((name, i) =>
    `- \`${name}\` — original un-annotated screenshot${isMultiImage ? ` (canvas image ${i + 1} of ${sourceNames.length})` : ''}`
  )
  const filesSection = [
    `- \`project.json\` — machine-readable manifest (authoritative source of truth)`,
    ...sourceLines,
    renderedName ? `- \`${renderedName}\` — composed view with numbered dots, dashed arrows, and sidebar cards` : null,
    `- \`README.md\` — this file`,
  ].filter(Boolean).join('\n')

  const multiImageSection = isMultiImage
    ? `

---

## Multiple canvas images

This project contains **${sourceNames.length} images** laid out on one canvas. \`project.json → layout\` describes the arrangement as rows of cells; each cell references an image by \`imageId\` and has a \`widthFr\` column-width fraction (fractions sum to 1 per row). Rows stack top to bottom and each row spans the full canvas width.

Every annotation, arrow, and shape carries an \`imageId\` telling you which image its coordinates are relative to. Match it against \`assets.sourceImages[].id\` to find the right file.`
    : ''

  return `# SpecShot Bundle
> Generated by [SpecShot](https://github.com/gabemartin/ityscreenshot) on ${createdAt}

This archive contains an annotated screenshot and structured data intended for use with an LLM.
**Start with \`rendered-export.png\` — it shows the annotated view with numbered dots and sidebar cards and is usually all you need.** Fall back to \`project.json\` for full resolution screenshot without boxes or arrow overlays, exact coordinates, or when the rendered image is absent.

---

## Intake autopilot (default behavior)

If the user provides this bundle path (or drags this zip into chat), do this automatically:

1. Open and validate the archive.
2. Read \`rendered-export\` first — it shows numbered dots, dashed arrows, and sidebar annotation cards.
3. Read \`project.json\` only if the rendered image is missing, ambiguous, or you need stable IDs / exact coordinates.
4. Return a concise interpretation without asking open-ended questions first.

Expected first response shape:

- Bundle validity and file list
- Annotation list (index + text)
- Structured annotation details (id, point, color)
- Implementation-ready task translation
- At most one blocking clarifier (only if truly needed)

Do **not** start with "What do you want me to do with this zip?" unless the user explicitly asked for options only.

---

## Files in this bundle

${filesSection}${multiImageSection}

---

## Annotation summary

${annotationTable}

---

## How to reference annotations

There are two ways to refer to an annotation. Use whichever is appropriate:

| Reference type | When to use | Example |
|---|---|---|
| **Order number** (\`index\`) | Quick, human-friendly, positional | "Fix note 2", "What does item 3 mean?" |
| **Annotation ID** (\`id\`) | Stable across sessions, reorders, and renames | Tracking a specific point over multiple saves |

Order numbers start at 1 and match the visual labels on the rendered image. They can change if annotations are reordered. IDs (format: \`ann_TIMESTAMP_RANDOM\`) are assigned once and never change.

---

## Coordinate system

\`point.x\` and \`point.y\` are fractional positions in the range \`[0, 1]\` relative to the dimensions of the annotation's **own** source image (its \`imageId\`; single-image bundles have only one).

- \`(0, 0)\` = top-left corner
- \`(1, 1)\` = bottom-right corner
- To get pixel coordinates: \`px = point.x × imageWidth\`, \`py = point.y × imageHeight\`
- **Missing \`point\`** = sidebar-only note with no image marker or connector line

---

## Color coding

Each annotation is assigned a color from a fixed palette. Colors cycle in order and are purely visual — they carry no semantic meaning unless the user has stated otherwise.

Palette order: \`#E91E8C\` → \`#2979FF\` → \`#00BFA5\` → \`#FF6D00\`

---

## When information is incomplete

If you receive only a screenshot (no bundle), or if context is missing, ask the user:

> "Do you have a SpecShot \`.zip\` bundle for this screenshot? If so, please share it, or point me to your \`/specks\`, \`/speck\`, or \`/spec\` folder."

**Assume every project using SpecShot stores bundles in one of these locations relative to the project root:**

\`\`\`
/specks/
/speck/
/spec/
\`\`\`

When a user shares a screenshot without a bundle, or when you need more context about what is being annotated, proactively offer to inspect one of those paths before making assumptions based on the image alone.

---

## Optional kickoff context (copy/paste)

Use this at the start of a new conversation. Any line can be skipped.

\`\`\`md
Optional quick context for this SpecShot request (reply "skip" to ignore all):

- Bundle path: (example: /specks/foo.zip)
- Main goal: (what outcome you want)
- Priority: (must / should / nice)
- Focus notes: (all, or IDs/# like #2 #4 / ann_...)
- Constraints: (what must NOT change)
- Viewports: (desktop/mobile/both + widths if known)
- Definition of done: (1-3 checks)
- References: (Figma / ticket / branch / commit)
\`\`\`

Ultra-light version:

\`\`\`md
Optional: bundle path + goal + priority + constraints. Reply "skip" to proceed now.
\`\`\`

---

## project.json schema reference

\`\`\`jsonc
{
  "version": 2,                    // schema version (1 = legacy single-image)
  "createdAt": "ISO 8601 date",
  "updatedAt": "ISO 8601 date",
  "annotations": [                 // same data as llmMapping, lower-level
    {
      "id": "ann_...",
      "point": { "x": 0.0, "y": 0.0 },  // omit for sidebar-only notes
      "text": "note text",
      "color": "#RRGGBB",
      "imageId": "img_..."         // which canvas image the point is relative to
    }
  ],
  "layout": [                      // v2: canvas arrangement — rows of image cells
    {
      "id": "row_...",
      "cells": [
        { "imageId": "img_...", "widthFr": 0.5 }  // widthFr sums to 1 per row
      ]
    }
  ],
  "llmMapping": {
    "notes": [                     // preferred for LLM use — includes index
      {
        "index": 1,                // 1-based order number (positional, may change)
        "id": "ann_...",           // stable unique ID (never changes)
        "text": "note text",
        "point": { "x": 0.0, "y": 0.0 },  // omit for sidebar-only notes
        "color": "#RRGGBB",
        "imageId": "img_..."
      }
    ]
  },
  "assets": {
    "sourceImage": { "path": "source-image.png", "mimeType": "image/png" },  // first image (compat)
    "sourceImages": [              // v2: every canvas image, in layout order
      { "id": "img_...", "path": "source-image-1.png", "mimeType": "image/png" }
    ],
    "renderedImage": { "path": "rendered-export.png", "mimeType": "image/png" }
  }
}
\`\`\`
`
}

function writeProjectBundle(filePath: string, payload: SaveProjectPayload): void {
  // v2 payloads carry every canvas image; older payloads only the single one.
  const sources =
    payload.sourceImages && payload.sourceImages.length > 0
      ? payload.sourceImages
      : [{ id: null as string | null, dataUrl: payload.sourceImageDataUrl }]

  const sourceFiles = sources.map((src, i) => {
    const parsed = parseDataUrl(src.dataUrl)
    const ext = mimeTypeToExtension(parsed.mimeType)
    const name = sources.length > 1 ? `source-image-${i + 1}.${ext}` : `source-image.${ext}`
    return { id: src.id ?? null, name, mimeType: parsed.mimeType, buffer: parsed.buffer }
  })

  let renderedImageAsset: ProjectAssetEntry | undefined
  let renderedBuffer: Buffer | null = null
  if (payload.renderedImageDataUrl) {
    const renderedImage = parseDataUrl(payload.renderedImageDataUrl)
    const renderedExt = mimeTypeToExtension(renderedImage.mimeType)
    renderedImageAsset = {
      path: `rendered-export.${renderedExt}`,
      mimeType: renderedImage.mimeType,
    }
    renderedBuffer = renderedImage.buffer
  }

  const projectForDisk: ProjectManifest = {
    ...payload.project,
    assets: {
      // sourceImage always points at the first image for v1-reader compatibility
      sourceImage: { path: sourceFiles[0].name, mimeType: sourceFiles[0].mimeType },
      sourceImages: sourceFiles.map((f) => ({ id: f.id, path: f.name, mimeType: f.mimeType })),
      ...(renderedImageAsset ? { renderedImage: renderedImageAsset } : {}),
    },
  }

  const readme = buildBundleReadme(
    payload.project,
    sourceFiles.map((f) => f.name),
    renderedImageAsset?.path,
  )

  const zip = new AdmZip()
  zip.addFile('README.md', Buffer.from(readme, 'utf8'))
  zip.addFile('project.json', Buffer.from(JSON.stringify(projectForDisk, null, 2), 'utf8'))
  for (const f of sourceFiles) {
    zip.addFile(f.name, f.buffer)
  }
  if (renderedImageAsset && renderedBuffer) {
    zip.addFile(renderedImageAsset.path, renderedBuffer)
  }
  zip.writeZip(filePath)
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    center: true,
    show: false,
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '../../resources/app_512.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  })

  setupWebContextMenu(mainWindow, isDev)

  if (isDev) {
    // electron-vite sets ELECTRON_RENDERER_URL to the actual renderer server
    // (port may be 3000 under Ship Studio — never hardcode Vite's default 5173)
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    showDock()
  })

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      if (process.platform === 'darwin') {
        app.dock.hide()
      }
    }
  })
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, '../../resources/taskbar_16.png')
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('SpecShot')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => showAndFocusWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } },
  ])

  tray.setContextMenu(contextMenu)

  if (process.platform === 'darwin') {
    let lastTrayClick = 0
    tray.on('click', () => {
      const now = Date.now()
      if (now - lastTrayClick < 500) return
      lastTrayClick = now
      if (mainWindow?.isVisible()) {
        mainWindow.hide()
        app.dock.hide()
      } else {
        showAndFocusWindow()
      }
    })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function showDock(): void {
  if (process.platform !== 'darwin') return
  const img = nativeImage.createFromPath(path.join(__dirname, '../../resources/app_512.png'))
  if (!img.isEmpty()) app.dock.setIcon(img)
  app.dock.show()
}

function showAndFocusWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  showDock()
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  // Read image from clipboard → base64 dataURL or null
  ipcMain.handle('clipboard:read-image', () => {
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    return img.toDataURL()
  })

  // Write base64 dataURL to clipboard
  ipcMain.handle('clipboard:write-image', (_event, dataUrl: string) => {
    const img = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(img)
  })

  // Save base64 dataURL to disk as PNG via save dialog
  ipcMain.handle('dialog:save-image', async (_event, dataUrl: string) => {
    if (!mainWindow) return
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Screenshot',
      defaultPath: `screenshot-${Date.now()}.png`,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    })
    if (canceled || !filePath) return
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  })

  // Save project bundle (.zip default, .speck also accepted)
  ipcMain.handle('dialog:save-project', async (_event, payload: SaveProjectPayload) => {
    if (!mainWindow) return null

    // Validate payload before showing dialog so errors surface before the user picks a path
    if (!payload?.sourceImageDataUrl) {
      throw new Error('No source image data in payload')
    }

    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Project Bundle',
      defaultPath: `specshot-project-${Date.now()}.zip`,
      filters: [
        { name: 'ZIP Bundle', extensions: ['zip'] },
        { name: 'SpecShot Bundle', extensions: ['speck'] },
      ],
    })
    if (canceled || !filePath) return null
    const ext = path.extname(filePath).toLowerCase()
    const targetPath = ext === '.zip' || ext === '.speck' ? filePath : `${filePath}.zip`
    try {
      writeProjectBundle(targetPath, payload)
    } catch (err) {
      console.error('[save-project] writeProjectBundle failed:', err)
      throw err
    }
    return targetPath
  })

  // Open project bundle via file dialog
  ipcMain.handle('dialog:open-project', async () => {
    if (!mainWindow) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Project Bundle',
      properties: ['openFile'],
      filters: [{ name: 'Project Bundles', extensions: ['zip', 'speck'] }],
    })
    if (canceled || filePaths.length === 0) return null
    try {
      return parseProjectBundle(filePaths[0])
    } catch (err) {
      console.error('Failed to open project bundle:', err)
      return null
    }
  })

  // Open project bundle from a known path (used by drag-drop in renderer)
  ipcMain.handle('project:open-path', (_event, filePath: string) => {
    try {
      return parseProjectBundle(filePath)
    } catch (err) {
      console.error('Failed to open project bundle from path:', err)
      return null
    }
  })

  // Capture the rendered window content below the top bar at full Retina resolution
  ipcMain.handle('capture-content', async () => {
    if (!mainWindow) return null
    const { width, height } = mainWindow.getContentBounds()
    const TOP_BAR = 44
    const image = await mainWindow.webContents.capturePage({
      x: 0,
      y: TOP_BAR,
      width,
      height: height - TOP_BAR,
    })
    return image.toDataURL()
  })

  // Write a renderer-captured dataURL to a temp PNG file for drag-out.
  ipcMain.handle('write-drag-temp', (_event, dataUrl: string) => {
    const tempPath = path.join(os.tmpdir(), 'ityscreenshot-drag.png')
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(tempPath, Buffer.from(base64, 'base64'))
    dragTempPath = tempPath
    return tempPath
  })

  // Write a full project bundle to a temp .zip for drag-out (no save dialog).
  ipcMain.handle('write-drag-project-temp', (_event, payload: SaveProjectPayload) => {
    if (!payload?.sourceImageDataUrl) {
      throw new Error('No source image data in payload')
    }
    if (dragProjectTempPath && fs.existsSync(dragProjectTempPath)) {
      try {
        fs.unlinkSync(dragProjectTempPath)
      } catch {
        /* ignore */
      }
    }
    const tempPath = path.join(os.tmpdir(), `ityscreenshot-drag-project-${Date.now()}.zip`)
    writeProjectBundle(tempPath, payload)
    dragProjectTempPath = tempPath
    return tempPath
  })

  // Persist the current image to userData so it survives a restart.
  const sessionImagePath = path.join(app.getPath('userData'), 'session-image.txt')

  ipcMain.handle('session:save-image', (_event, dataUrl: string) => {
    fs.writeFileSync(sessionImagePath, dataUrl, 'utf8')
  })

  ipcMain.handle('session:load-image', () => {
    if (!fs.existsSync(sessionImagePath)) return null
    return fs.readFileSync(sessionImagePath, 'utf8')
  })

  // v2 session persistence: all canvas images + layout rows as JSON.
  const sessionStatePath = path.join(app.getPath('userData'), 'session-state.json')

  ipcMain.handle('session:save-state', (_event, state: SessionState) => {
    fs.writeFileSync(sessionStatePath, JSON.stringify(state), 'utf8')
  })

  ipcMain.handle('session:load-state', () => {
    if (!fs.existsSync(sessionStatePath)) return null
    try {
      const parsed = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8')) as SessionState
      if (!parsed || !Array.isArray(parsed.images)) return null
      return parsed
    } catch (err) {
      console.error('Failed to read session state:', err)
      return null
    }
  })

  // Initiate a native OS drag from the pre-captured temp file.
  // Must be triggered via ipcRenderer.send (not invoke) from an ondragstart handler.
  ipcMain.on('drag-out', (event) => {
    if (!dragTempPath || !fs.existsSync(dragTempPath)) return
    const icon = nativeImage.createFromPath(dragTempPath).resize({ width: 128 })
    event.sender.startDrag({ file: dragTempPath, icon })
  })

  ipcMain.on('drag-out-project', (event) => {
    if (!dragProjectTempPath || !fs.existsSync(dragProjectTempPath)) return
    const iconPath = path.join(__dirname, '../../resources/app_128.png')
    let icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty() && dragTempPath) {
      icon = nativeImage.createFromPath(dragTempPath)
    }
    if (icon.isEmpty()) return
    event.sender.startDrag({ file: dragProjectTempPath, icon: icon.resize({ width: 128 }) })
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide()
  } else {
    session.defaultSession.setSpellCheckerLanguages(['en-US'])
  }

  createWindow()
  createTray()
  registerIpcHandlers()

  globalShortcut.register('CommandOrControl+Shift+2', () => {
    showAndFocusWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  if (dragTempPath && fs.existsSync(dragTempPath)) {
    fs.unlinkSync(dragTempPath)
  }
  if (dragProjectTempPath && fs.existsSync(dragProjectTempPath)) {
    try {
      fs.unlinkSync(dragProjectTempPath)
    } catch {
      /* ignore */
    }
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('activate', () => {
  if (mainWindow) {
    showAndFocusWindow()
  }
})

app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})
