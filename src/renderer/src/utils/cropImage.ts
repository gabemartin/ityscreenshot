import { Annotation, PlacedArrow, PlacedShape } from '../types'
import type { CropRect } from '../components/ImageCropOverlay'

const MIN_DIM = 0.005

export interface CropResult {
  dataUrl: string
  annotations: Annotation[]
  placedArrows: PlacedArrow[]
  placedShapes: PlacedShape[]
}

/**
 * Crops `imageUrl` to `displayRect` (display-space pixels relative to the
 * rendered <img> element of `displaySize`), remaps surviving annotations, and
 * returns a new PNG data URL together with the filtered annotation array.
 *
 * Annotations whose natural-pixel position falls outside the crop rectangle
 * are dropped; the rest have their fractional coordinates recomputed relative
 * to the new (cropped) image dimensions.
 */
export async function cropImage(
  imageUrl: string,
  displayRect: CropRect,
  displaySize: { width: number; height: number },
  naturalSize: { width: number; height: number },
  annotations: Annotation[],
  placedArrows: PlacedArrow[] = [],
  placedShapes: PlacedShape[] = [],
): Promise<CropResult> {
  // Scale factors: display → natural pixels
  const sx = naturalSize.width / displaySize.width
  const sy = naturalSize.height / displaySize.height

  // Crop rectangle in natural pixels, clamped to image bounds
  const nx = Math.max(0, Math.round(displayRect.x * sx))
  const ny = Math.max(0, Math.round(displayRect.y * sy))
  const nRight = Math.min(naturalSize.width, Math.round((displayRect.x + displayRect.w) * sx))
  const nBottom = Math.min(naturalSize.height, Math.round((displayRect.y + displayRect.h) * sy))
  const nw = nRight - nx
  const nh = nBottom - ny

  if (nw <= 0 || nh <= 0) throw new Error('Crop region is empty after rounding')

  // Draw cropped region onto a canvas
  const img = await loadImg(imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = nw
  canvas.height = nh
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, nx, ny, nw, nh, 0, 0, nw, nh)
  const dataUrl = canvas.toDataURL('image/png')

  // Remap annotations: keep only those inside the crop rectangle
  const remapped: Annotation[] = []
  for (const ann of annotations) {
    const px = ann.point.x * naturalSize.width
    const py = ann.point.y * naturalSize.height
    if (px >= nx && px <= nRight && py >= ny && py <= nBottom) {
      const next: Annotation = {
        ...ann,
        point: {
          x: Math.max(0, Math.min(1, (px - nx) / nw)),
          y: Math.max(0, Math.min(1, (py - ny) / nh)),
        },
      }
      if (ann.rect) {
        const rx = ann.rect.x * naturalSize.width
        const ry = ann.rect.y * naturalSize.height
        const rw = ann.rect.w * naturalSize.width
        const rh = ann.rect.h * naturalSize.height
        next.rect = {
          x: Math.max(0, Math.min(1, (rx - nx) / nw)),
          y: Math.max(0, Math.min(1, (ry - ny) / nh)),
          w: Math.max(MIN_DIM, Math.min(1, rw / nw)),
          h: Math.max(MIN_DIM, Math.min(1, rh / nh)),
        }
      }
      remapped.push(next)
    }
  }

  const remappedArrows: PlacedArrow[] = []
  for (const arrow of placedArrows) {
    const remapPoint = (p: { x: number; y: number }): { x: number; y: number } | null => {
      const px = p.x * naturalSize.width
      const py = p.y * naturalSize.height
      if (px < nx || px > nRight || py < ny || py > nBottom) return null
      return {
        x: Math.max(0, Math.min(1, (px - nx) / nw)),
        y: Math.max(0, Math.min(1, (py - ny) / nh)),
      }
    }
    const start = remapPoint(arrow.start)
    const end = remapPoint(arrow.end)
    if (start && end) remappedArrows.push({ ...arrow, start, end })
  }

  const remappedShapes: PlacedShape[] = []
  for (const shape of placedShapes) {
    const cx = (shape.rect.x + shape.rect.w / 2) * naturalSize.width
    const cy = (shape.rect.y + shape.rect.h / 2) * naturalSize.height
    if (cx < nx || cx > nRight || cy < ny || cy > nBottom) continue
    const rx = shape.rect.x * naturalSize.width
    const ry = shape.rect.y * naturalSize.height
    const rw = shape.rect.w * naturalSize.width
    const rh = shape.rect.h * naturalSize.height
    remappedShapes.push({
      ...shape,
      rect: {
        x: Math.max(0, Math.min(1, (rx - nx) / nw)),
        y: Math.max(0, Math.min(1, (ry - ny) / nh)),
        w: Math.max(MIN_DIM, Math.min(1, rw / nw)),
        h: Math.max(MIN_DIM, Math.min(1, rh / nh)),
      },
    })
  }

  return { dataUrl, annotations: remapped, placedArrows: remappedArrows, placedShapes: remappedShapes }
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
