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
import fs from 'fs'

// ─── Globals ────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// ─── Dev / prod helper (no @electron-toolkit/utils available) ───────────────

const isDev = !app.isPackaged

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
    if (process.platform === 'darwin') {
      app.dock.show()
    }
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
  const iconPath = path.join(__dirname, '../../resources/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('ityScreenshot')

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

  // On macOS, left-click toggles the window
  if (process.platform === 'darwin') {
    tray.on('click', () => {
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

function showAndFocusWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (process.platform === 'darwin') {
    app.dock.show()
  }
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

    // Strip the data:image/png;base64, prefix and write buffer
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    fs.writeFileSync(filePath, buffer)
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Grant microphone access for Web Speech API
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  // Hide from Dock on macOS until the window is visible
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
