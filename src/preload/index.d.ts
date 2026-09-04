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
  saveSessionState(state: SessionState): Promise<void>
  loadSessionState(): Promise<SessionState | null>
  saveProject(payload: SaveProjectPayload): Promise<string | null>
  openProject(): Promise<OpenProjectResult | null>
  openProjectFromPath(filePath: string): Promise<OpenProjectResult | null>
  getPathForFile(file: File): string
  onAnnotationTextSync(
    callback: (payload: { id: string; text: string }) => void,
  ): () => void
}

export interface ProjectPoint {
  x: number
  y: number
}

export interface ProjectLayoutCell {
  imageId: string
  widthFr: number
}

export interface ProjectLayoutRow {
  id: string
  cells: ProjectLayoutCell[]
}

export interface SessionState {
  version: number
  images: Array<{ id: string; dataUrl: string }>
  rows: ProjectLayoutRow[]
}

export interface ProjectPlacedArrow {
  id: string
  start: ProjectPoint
  end: ProjectPoint
  thickness?: number
  color: string
  imageId?: string
}

export interface ProjectRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ProjectPlacedShape {
  id: string
  kind: 'square' | 'circle'
  rect: ProjectRect
  thickness?: number
  color: string
  imageId?: string
}

export interface ProjectAnnotation {
  id: string
  point?: ProjectPoint
  text: string
  color: string
  rect?: ProjectRect
  imageId?: string
}

export interface ProjectManifest {
  version: number
  createdAt: string
  updatedAt: string
  annotations: ProjectAnnotation[]
  placedArrows?: ProjectPlacedArrow[]
  placedShapes?: ProjectPlacedShape[]
  /** v2: row/column layout of the canvas images */
  layout?: ProjectLayoutRow[]
  llmMapping: {
    notes: Array<{
      index: number
      id: string
      text: string
      point?: ProjectPoint
      color: string
      imageId?: string
      rect?: ProjectRect
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
    /** v2: one entry per canvas image, in layout order */
    sourceImages?: Array<{
      id: string | null
      path: string
      mimeType: string
    }>
    renderedImage?: {
      path: string
      mimeType: string
    }
  }
}

export interface SaveProjectPayload {
  project: Omit<ProjectManifest, 'assets'>
  sourceImageDataUrl: string
  /** v2: all canvas images (first entry matches sourceImageDataUrl) */
  sourceImages?: Array<{ id: string; dataUrl: string }>
  renderedImageDataUrl?: string | null
}

export interface OpenProjectResult {
  project: ProjectManifest
  sourceImageDataUrl: string
  sourceImages?: Array<{ id: string | null; dataUrl: string }>
  renderedImageDataUrl: string | null
  filePath: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
