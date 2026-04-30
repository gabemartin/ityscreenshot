export interface ElectronAPI {
  readClipboardImage(): Promise<string | null>
  writeClipboardImage(dataUrl: string): Promise<void>
  saveImage(dataUrl: string): Promise<void>
  captureContent(): Promise<string | null>
  writeDragTemp(dataUrl: string): Promise<string | null>
  dragOut(): void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
