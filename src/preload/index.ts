import { contextBridge, ipcRenderer, webUtils } from 'electron'

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

interface SaveProjectPayload {
  project: {
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
    canvas: {
      width: number
      height: number
    } | null
  }
  sourceImageDataUrl: string
  renderedImageDataUrl?: string | null
}

interface OpenProjectResult {
  project: {
    version: number
    annotations: ProjectAnnotation[]
  }
  sourceImageDataUrl: string
}

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

  saveSessionImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('session:save-image', dataUrl),

  loadSessionImage: (): Promise<string | null> =>
    ipcRenderer.invoke('session:load-image'),

  saveProject: (payload: SaveProjectPayload): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-project', payload),

  openProject: (): Promise<OpenProjectResult | null> =>
    ipcRenderer.invoke('dialog:open-project'),

  openProjectFromPath: (filePath: string): Promise<OpenProjectResult | null> =>
    ipcRenderer.invoke('project:open-path', filePath),

  // Returns the native filesystem path for a File object from a drag-drop event.
  // Required because file.path is not available with contextIsolation: true.
  getPathForFile: (file: File): string =>
    webUtils.getPathForFile(file),
})
