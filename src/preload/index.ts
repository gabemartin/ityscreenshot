import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  readClipboardImage: (): Promise<string | null> =>
    ipcRenderer.invoke('clipboard:read-image'),

  writeClipboardImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write-image', dataUrl),

  saveImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('dialog:save-image', dataUrl),

  // Native macOS speech recognition (SFSpeechRecognizer via Swift helper)
  startSpeech: (annotationId: string): Promise<void> =>
    ipcRenderer.invoke('speech:start', annotationId),

  stopSpeech: (): Promise<void> =>
    ipcRenderer.invoke('speech:stop'),

  onSpeechResult: (
    cb: (payload: { annotationId: string; type: string; text?: string; message?: string }) => void
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: typeof cb extends (p: infer P) => void ? P : never) => cb(payload)
    ipcRenderer.on('speech:result', handler)
    return () => ipcRenderer.removeListener('speech:result', handler)
  },
})
