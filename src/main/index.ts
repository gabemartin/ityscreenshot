import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import AdmZip from 'adm-zip'

// ─── Project bundle types ─────────────────────────────────────────────────────

interface ProjectPoint {
  x: number
  y: number
}

interface ProjectAnnotation {
  id: string
  point: ProjectPoint
  text: string
  color: string
}

interface ProjectAssetEntry {
  path: string
  mimeType: string
}

interface ProjectManifest {
  version: number
  createdAt: string
  updatedAt: string
  annotations: ProjectAnnotation[]
  llmMapping: {
    notes: Array<{
      index: number
      id: string
      text: string
      point: ProjectPoint
      color: string
    }>
  }
  assets: {
    sourceImage: ProjectAssetEntry
    renderedImage?: ProjectAssetEntry
  }
}

interface SaveProjectPayload {
  project: Omit<ProjectManifest, 'assets'>
  sourceImageDataUrl: string
  renderedImageDataUrl?: string | null
}

interface OpenProjectResult {
  project: ProjectManifest
  sourceImageDataUrl: string
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
  if (project.version !== 1 || !Array.isArray(project.annotations)) {
    throw new Error('Unsupported or invalid project format')
  }

  const sourcePath = project.assets?.sourceImage?.path
  if (!sourcePath) throw new Error('Missing source image asset metadata')

  const sourceEntry = zip.getEntry(sourcePath)
  if (!sourceEntry) throw new Error('Source image is missing from bundle')

  const sourceMimeType =
    project.assets.sourceImage.mimeType ||
    extensionToMimeType(path.extname(sourcePath).slice(1))
  const sourceImageDataUrl = toDataUrl(sourceEntry.getData(), sourceMimeType)

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

  return { project, sourceImageDataUrl, renderedImageDataUrl, filePath: bundlePath }
}

function buildBundleReadme(manifest: Omit<ProjectManifest, 'assets'>, sourceName: string, renderedName?: string): string {
  const notes = manifest.llmMapping?.notes ?? []
  const createdAt = manifest.createdAt ?? new Date().toISOString()

  const tableHeader = '| # | ID | Point (x, y) | Color | Note |\n|---|---|---|---|---|'
  const tableRows = notes.map((n) =>
    `| ${n.index} | \`${n.id}\` | (${n.point.x.toFixed(3)}, ${n.point.y.toFixed(3)}) | ${n.color} | ${n.text ? n.text.replace(/\n/g, ' ') : '*(empty)*'} |`
  ).join('\n')
  const annotationTable = notes.length > 0
    ? `${tableHeader}\n${tableRows}`
    : '*No annotations in this bundle.*'

  const filesSection = [
    `- \`project.json\` — machine-readable manifest (authoritative source of truth)`,
    `- \`${sourceName}\` — original un-annotated screenshot`,
    renderedName ? `- \`${renderedName}\` — composed view with numbered dots, dashed arrows, and sidebar cards` : null,
    `- \`README.md\` — this file`,
  ].filter(Boolean).join('\n')

  return `# SpecShot Bundle
> Generated by [SpecShot](https://github.com/gabemartin/ityscreenshot) on ${createdAt}

This archive contains an annotated screenshot and structured data intended for use with an LLM.
**Always read \`project.json\` first.** The images are supporting material.

---

## Intake autopilot (default behavior)

If the user provides this bundle path (or drags this zip into chat), do this automatically:

1. Open and validate the archive.
2. Read \`project.json\` first.
3. Return a concise interpretation without asking open-ended questions first.

Expected first response shape:

- Bundle validity and file list
- Annotation list (index + text)
- Structured annotation details (id, point, color)
- Implementation-ready task translation
- At most one blocking clarifier (only if truly needed)

Do **not** start with "What do you want me to do with this zip?" unless the user explicitly asked for options only.

---

## Files in this bundle

${filesSection}

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

\`point.x\` and \`point.y\` are fractional positions in the range \`[0, 1]\` relative to the source image dimensions.

- \`(0, 0)\` = top-left corner
- \`(1, 1)\` = bottom-right corner
- To get pixel coordinates: \`px = point.x × imageWidth\`, \`py = point.y × imageHeight\`

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
  "version": 1,                    // schema version
  "createdAt": "ISO 8601 date",
  "updatedAt": "ISO 8601 date",
  "annotations": [                 // same data as llmMapping, lower-level
    {
      "id": "ann_...",
      "point": { "x": 0.0, "y": 0.0 },
      "text": "note text",
      "color": "#RRGGBB"
    }
  ],
  "llmMapping": {
    "notes": [                     // preferred for LLM use — includes index
      {
        "index": 1,                // 1-based order number (positional, may change)
        "id": "ann_...",           // stable unique ID (never changes)
        "text": "note text",
        "point": { "x": 0.0, "y": 0.0 },
        "color": "#RRGGBB"
      }
    ]
  },
  "assets": {
    "sourceImage": { "path": "source-image.png", "mimeType": "image/png" },
    "renderedImage": { "path": "rendered-export.png", "mimeType": "image/png" }
  }
}
\`\`\`
`
}

function writeProjectBundle(filePath: string, payload: SaveProjectPayload): void {
  const sourceImage = parseDataUrl(payload.sourceImageDataUrl)
  const sourceExt = mimeTypeToExtension(sourceImage.mimeType)
  const sourceName = `source-image.${sourceExt}`

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
      sourceImage: { path: sourceName, mimeType: sourceImage.mimeType },
      ...(renderedImageAsset ? { renderedImage: renderedImageAsset } : {}),
    },
  }

  const readme = buildBundleReadme(payload.project, sourceName, renderedImageAsset?.path)

  const zip = new AdmZip()
  zip.addFile('README.md', Buffer.from(readme, 'utf8'))
  zip.addFile('project.json', Buffer.from(JSON.stringify(projectForDisk, null, 2), 'utf8'))
  zip.addFile(sourceName, sourceImage.buffer)
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
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
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
