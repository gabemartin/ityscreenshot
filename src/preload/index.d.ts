export interface SpeechPayload {
  annotationId: string
  type: 'interim' | 'final' | 'stopped' | 'error'
  text?: string
  message?: string
}

export interface ElectronAPI {
  readClipboardImage(): Promise<string | null>
  writeClipboardImage(dataUrl: string): Promise<void>
  saveImage(dataUrl: string): Promise<void>
  startSpeech(annotationId: string): Promise<void>
  stopSpeech(): Promise<void>
  onSpeechResult(cb: (payload: SpeechPayload) => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
