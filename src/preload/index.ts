import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  readClipboardImage: (): Promise<string | null> =>
    ipcRenderer.invoke('clipboard:read-image'),

  writeClipboardImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write-image', dataUrl),

  saveImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('dialog:save-image', dataUrl),

  captureContent: (): Promise<string | null> =>
    ipcRenderer.invoke('capture-content'),

  // Write an already-captured dataURL to a temp PNG on disk; returns the file path.
  writeDragTemp: (dataUrl: string): Promise<string | null> =>
    ipcRenderer.invoke('write-drag-temp', dataUrl),

  // Initiate native OS drag using the pre-captured temp file.
  // Must be called synchronously from an ondragstart handler.
  dragOut: (): void =>
    ipcRenderer.send('drag-out'),
})
