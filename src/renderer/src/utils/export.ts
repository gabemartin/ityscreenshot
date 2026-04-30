import { Annotation } from '../types'

/**
 * Renders the screenshot with all annotations flattened onto a canvas,
 * and returns a PNG dataURL of the composite image.
 */
export async function renderAnnotatedImage(
  imageUrl: string,
  annotations: Annotation[]
): Promise<string> {
  // 1. Load the source image
  const img = await loadImage(imageUrl)
  const { naturalWidth: w, naturalHeight: h } = img

  // 2. Create an offscreen canvas at the image's natural resolution
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 3. Draw the base image
  ctx.drawImage(img, 0, 0, w, h)

  // 4. If no annotations, just return the raw image
  if (annotations.length === 0) {
    return canvas.toDataURL('image/png')
  }

  // 5. Draw each annotation
  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

  for (const ann of annotations) {
    const cx = ann.point.x * w
    const cy = ann.point.y * h

    ctx.save()

    // ── Outer filled circle (bullseye ring) ──
    ctx.globalAlpha = 0.9
    ctx.fillStyle = ann.color
    ctx.beginPath()
    ctx.arc(cx, cy, 10, 0, Math.PI * 2)
    ctx.fill()

    // ── White inner circle ──
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fill()

    // ── Text label (pill) ──
    if (ann.text.trim() !== '') {
      const text = ann.text
      const metrics = ctx.measureText(text)
      const textWidth = metrics.width
      const padH = 8
      const padV = 4
      const pillW = textWidth + padH * 2
      const pillH = 14 + padV * 2 // font-size + vertical padding
      const dotRadius = 10
      const gap = 6 // gap between dot edge and pill

      // Default: pill to the right of the dot
      let pillX = cx + dotRadius + gap
      const pillY = cy - pillH / 2

      // Flip to the left if pill would clip the right edge
      if (pillX + pillW > w) {
        pillX = cx - dotRadius - gap - pillW
      }

      // Draw rounded rect pill
      ctx.globalAlpha = 1
      ctx.fillStyle = ann.color
      roundRect(ctx, pillX, pillY, pillW, pillH, 6)
      ctx.fill()

      // Draw text inside pill
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, pillX + padH, cy)
    }

    ctx.restore()
  }

  return canvas.toDataURL('image/png')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = src
  })
}

/**
 * Draws a rounded rectangle path (does not stroke/fill — caller does that).
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}
