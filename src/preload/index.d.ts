export interface ElectronAPI {
  /** Read an image from the system clipboard. Returns a base64 dataURL, or null if no image. */
  readClipboardImage(): Promise<string | null>
  /** Write a base64 dataURL image to the system clipboard. */
  writeClipboardImage(dataUrl: string): Promise<void>
  /** Open a native save dialog and write the base64 dataURL to disk as a PNG. */
  saveImage(dataUrl: string): Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
