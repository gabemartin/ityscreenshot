export interface ElectronAPI {
  readClipboardImage(): Promise<string | null>
  writeClipboardImage(dataUrl: string): Promise<void>
  saveImage(dataUrl: string): Promise<void>
  captureContent(): Promise<string | null>
  writeDragTemp(dataUrl: string): Promise<string | null>
  dragOut(): void
  writeDragProjectTemp(payload: SaveProjectPayload): Promise<string | null>
  dragOutProject(): void
  saveSessionImage(dataUrl: string): Promise<void>
  loadSessionImage(): Promise<string | null>
  saveProject(payload: SaveProjectPayload): Promise<string | null>
  openProject(): Promise<OpenProjectResult | null>
  openProjectFromPath(filePath: string): Promise<OpenProjectResult | null>
  getPathForFile(file: File): string
}

export interface ProjectPoint {
  x: number
  y: number
}

export interface ProjectAnnotation {
  id: string
  point: ProjectPoint
  text: string
  color: string
}

export interface ProjectManifest {
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
  assets: {
    sourceImage: {
      path: string
      mimeType: string
    }
    renderedImage?: {
      path: string
      mimeType: string
    }
  }
}

export interface SaveProjectPayload {
  project: Omit<ProjectManifest, 'assets'>
  sourceImageDataUrl: string
  renderedImageDataUrl?: string | null
}

export interface OpenProjectResult {
  project: ProjectManifest
  sourceImageDataUrl: string
  renderedImageDataUrl: string | null
  filePath: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
