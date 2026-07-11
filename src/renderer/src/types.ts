export interface AnnotationPoint {
  x: number // 0-1 fractional position on the image
  y: number // 0-1 fractional position on the image
}

export interface Annotation {
  id: string
  point: AnnotationPoint
  text: string
  color: string
  /** When set, the marker renders as a resizable box (arrow stays attached). */
  rect?: BoxRect
}

export interface BoxRect {
  x: number // 0-1 fraction (left edge)
  y: number // 0-1 fraction (top edge)
  w: number // 0-1 fraction (width)
  h: number // 0-1 fraction (height)
}

