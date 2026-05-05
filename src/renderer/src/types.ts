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

export interface BoxRect {
  x: number // 0-1 fraction (left edge)
  y: number // 0-1 fraction (top edge)
  w: number // 0-1 fraction (width)
  h: number // 0-1 fraction (height)
}

export interface BoxAnnotation {
  id: string
  rect: BoxRect
  color: string
}

// Window.electronAPI is typed in src/preload/index.d.ts
