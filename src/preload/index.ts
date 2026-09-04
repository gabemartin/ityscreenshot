import { contextBridge, ipcRenderer, webUtils } from 'electron'

interface ProjectPoint {
  x: number
  y: number
}

interface ProjectAnnotation {
  id: string
  point?: ProjectPoint
  text: string
  color: string
  imageId?: string
}

interface SessionState {
  version: number
  images: Array<{ id: string; dataUrl: string }>
  rows: Array<{ id: string; cells: Array<{ imageId: string; widthFr: number }> }>
}

interface SaveProjectPayload {
  project: {
    version: number
    createdAt: string
    updatedAt: string
    annotations: ProjectAnnotation[]
    layout?: Array<{ id: string; cells: Array<{ imageId: string; widthFr: number }> }>
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
    canvas: {
      width: number
      height: number
    } | null
  }
  sourceImageDataUrl: string
  sourceImages?: Array<{ id: string; dataUrl: string }>
  renderedImageDataUrl?: string | null
}

interface OpenProjectResult {
  project: {
    version: number
    annotations: ProjectAnnotation[]
  }
  sourceImageDataUrl: string
  sourceImages?: Array<{ id: string | null; dataUrl: string }>
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

  writeDragProjectTemp: (payload: SaveProjectPayload): Promise<string | null> =>
    ipcRenderer.invoke('write-drag-project-temp', payload),

  dragOutProject: (): void =>
    ipcRenderer.send('drag-out-project'),

  saveSessionImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('session:save-image', dataUrl),

  loadSessionImage: (): Promise<string | null> =>
    ipcRenderer.invoke('session:load-image'),

  // v2 session persistence: multiple images + layout rows
  saveSessionState: (state: SessionState): Promise<void> =>
    ipcRenderer.invoke('session:save-state', state),

  loadSessionState: (): Promise<SessionState | null> =>
    ipcRenderer.invoke('session:load-state'),

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

  onAnnotationTextSync: (
    callback: (payload: { id: string; text: string }) => void,
  ): (() => void) => {
    const listener = (_event: unknown, payload: { id: string; text: string }) =>
      callback(payload)
    ipcRenderer.on('annotation:text-sync', listener)
    return () => ipcRenderer.removeListener('annotation:text-sync', listener)
  },
})
