export interface AnnotationPoint {
  x: number // 0-1 fractional position on the image
  y: number // 0-1 fractional position on the image
}

/** One image loaded onto the canvas. */
export interface CanvasImage {
  id: string
  dataUrl: string
}

/** One image slot in a layout row. widthFr values sum to 1 within a row. */
export interface LayoutCell {
  imageId: string
  widthFr: number
}

/** A horizontal strip of images. Rows stack vertically and span full width. */
export interface LayoutRow {
  id: string
  cells: LayoutCell[]
}

export interface Annotation {
  id: string
  /** Absent = sidebar-only note with no image connector. */
  point?: AnnotationPoint
  text: string
  color: string
  /** When set, the marker renders as a resizable box (arrow stays attached). */
  rect?: BoxRect
  /** Which canvas image the marker is anchored to. Absent = first image (v1 data). */
  imageId?: string
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
  /** Which canvas image the arrow is anchored to. Absent = first image (v1 data). */
  imageId?: string
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
  /** Which canvas image the shape is anchored to. Absent = first image (v1 data). */
  imageId?: string
}

/** 'bottom' adds a full-width row; `row:<rowId>` appends a column to that row. */
export type DropZone = 'bottom' | `row:${string}`

export type CanvasTool = 'note' | 'arrow' | 'square' | 'circle'

