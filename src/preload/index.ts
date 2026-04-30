import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  readClipboardImage: (): Promise<string | null> =>
    ipcRenderer.invoke('clipboard:read-image'),

  writeClipboardImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write-image', dataUrl),

  saveImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('dialog:save-image', dataUrl),
})
