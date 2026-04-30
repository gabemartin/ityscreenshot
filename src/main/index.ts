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

// ─── Globals ────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let dragTempPath: string | null = null

// ─── Dev / prod helper (no @electron-toolkit/utils available) ───────────────

const isDev = !app.isPackaged

app.setName('SpecShot')

// ─── Window ─────────────────────────────────────────────────────────────────

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

  // Load renderer
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

  // Hide to tray on close instead of quitting
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

// ─── Tray ────────────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, '../../resources/taskbar_16.png')
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('SpecShot')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => showAndFocusWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // On macOS, left-click toggles the window.
  // Debounced to prevent the double-fire that causes a show→hide flash.
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

// ─── IPC handlers ────────────────────────────────────────────────────────────

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
  // The renderer is responsible for capturing (via capture-content) so that
  // the isExporting flag can hide the sidebar footer before the shot is taken.
  ipcMain.handle('write-drag-temp', (_event, dataUrl: string) => {
    const tempPath = path.join(os.tmpdir(), 'ityscreenshot-drag.png')
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(tempPath, Buffer.from(base64, 'base64'))
    dragTempPath = tempPath
    return tempPath
  })

  // Initiate a native OS drag from the pre-captured temp file.
  // Must be triggered via ipcRenderer.send (not invoke) from an ondragstart handler.
  ipcMain.on('drag-out', (event) => {
    if (!dragTempPath || !fs.existsSync(dragTempPath)) return
    const icon = nativeImage.createFromPath(dragTempPath).resize({ width: 128 })
    event.sender.startDrag({ file: dragTempPath, icon })
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

  // Global shortcut: Cmd+Shift+2 (mnemonic: screenshot)
  globalShortcut.register('CommandOrControl+Shift+2', () => {
    showAndFocusWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  if (dragTempPath && fs.existsSync(dragTempPath)) {
    fs.unlinkSync(dragTempPath)
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// macOS: re-open window when clicking the Dock icon (if shown)
app.on('activate', () => {
  if (mainWindow) {
    showAndFocusWindow()
  }
})

// Prevent the app from quitting when all windows are closed (we hide to tray)
app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})
