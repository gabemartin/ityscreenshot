export interface ElectronAPI {
  readClipboardImage(): Promise<string | null>
  writeClipboardImage(dataUrl: string): Promise<void>
  saveImage(dataUrl: string): Promise<void>
  captureContent(): Promise<string | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
