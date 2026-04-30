export interface AnnotationPoint {
  x: number // 0-1 fractional position on the image
  y: number // 0-1 fractional position on the image
}

export interface Annotation {
  id: string
  point: AnnotationPoint
  text: string
  color: string // border color for the card + arrow
}

// Minimal interface for the Web Speech API (SpeechRecognition)
export interface ISpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

export interface ISpeechRecognitionCtor {
  new (): ISpeechRecognition
}

// Extend Window with the Electron bridge and browser speech recognition
declare global {
  interface Window {
    electronAPI: {
      readClipboardImage: () => Promise<string | null>
      writeClipboardImage: (dataUrl: string) => Promise<void>
      saveImage: (dataUrl: string) => Promise<void>
    }
    // Speech Recognition — vendor-prefixed in some environments
    SpeechRecognition: ISpeechRecognitionCtor | undefined
    webkitSpeechRecognition: ISpeechRecognitionCtor | undefined
  }
}
