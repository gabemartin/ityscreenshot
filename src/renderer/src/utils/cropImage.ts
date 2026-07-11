import { Annotation } from '../types'
import type { CropRect } from '../components/ImageCropOverlay'

const MIN_DIM = 0.005

export interface CropResult {
  dataUrl: string
  annotations: Annotation[]
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

  return { dataUrl, annotations: remapped }
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
