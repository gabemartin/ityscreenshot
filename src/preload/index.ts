import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  /** Read an image from the system clipboard. Returns a base64 dataURL, or null if no image. */
  readClipboardImage: (): Promise<string | null> =>
    ipcRenderer.invoke('clipboard:read-image'),

  /** Write a base64 dataURL image to the system clipboard. */
  writeClipboardImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write-image', dataUrl),

  /** Open a native save dialog and write the base64 dataURL to disk as a PNG. */
  saveImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('dialog:save-image', dataUrl),
})
