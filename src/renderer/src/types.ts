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

/** Standalone directional arrow drawn directly on the screenshot. */
export interface PlacedArrow {
  id: string
  start: AnnotationPoint
  end: AnnotationPoint
  color: string
  /** Shaft stroke width in image-space px. Defaults to DEFAULT_ARROW_THICKNESS when unset. */
  thickness?: number
}

export type ShapeKind = 'square' | 'circle'

/** Standalone square/rectangle or circle/ellipse drawn directly on the screenshot. */
export interface PlacedShape {
  id: string
  kind: ShapeKind
  rect: BoxRect
  color: string
  /** Outline stroke width in image-space px. Defaults to DEFAULT_SHAPE_THICKNESS when unset. */
  thickness?: number
}

export type CanvasTool = 'note' | 'arrow' | 'square' | 'circle'

