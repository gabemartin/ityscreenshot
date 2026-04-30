export interface AnnotationPoint {
  x: number // 0-1 fractional position on the image
  y: number // 0-1 fractional position on the image
}

export interface Annotation {
  id: string
  point: AnnotationPoint
  text: string
  color: string
}

// Window.electronAPI is typed in src/preload/index.d.ts
