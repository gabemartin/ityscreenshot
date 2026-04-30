import { Annotation } from '../types'

const LEGEND_ROW_HEIGHT = 28
const LEGEND_PADDING = 16
const LEGEND_FONT_SIZE = 14
const DOT_RADIUS = 12

/**
 * Flattens the screenshot + annotations into a single PNG dataURL.
 *
 * On the image: numbered colored dots at each annotation point.
 * Below the image: a legend strip — one row per annotation showing
 * the matching colored number badge and the full note text.
 */
export async function renderAnnotatedImage(
  imageUrl: string,
  annotations: Annotation[]
): Promise<string> {
  const img = await loadImage(imageUrl)
  const { naturalWidth: w, naturalHeight: h } = img

  const hasNotes = annotations.length > 0
  const legendHeight = hasNotes
    ? LEGEND_PADDING + annotations.length * LEGEND_ROW_HEIGHT + LEGEND_PADDING
    : 0

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h + legendHeight
  const ctx = canvas.getContext('2d')!

  // ── Draw base image ──
  ctx.drawImage(img, 0, 0, w, h)

  if (!hasNotes) return canvas.toDataURL('image/png')

  // ── Draw numbered dots on image ──
  ctx.font = `bold ${LEGEND_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  annotations.forEach((ann, i) => {
    const cx = ann.point.x * w
    const cy = ann.point.y * h
    const label = String(i + 1)

    ctx.save()

    // White halo for visibility against any background
    ctx.globalAlpha = 0.6
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(cx, cy, DOT_RADIUS + 2, 0, Math.PI * 2)
    ctx.fill()

    // Colored dot
    ctx.globalAlpha = 1
    ctx.fillStyle = ann.color
    ctx.beginPath()
    ctx.arc(cx, cy, DOT_RADIUS, 0, Math.PI * 2)
    ctx.fill()

    // Number
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, cx, cy)

    ctx.restore()
  })

  // ── Draw legend strip below image ──
  ctx.save()
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(0, h, w, legendHeight)

  // Thin separator line
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(w, h)
  ctx.stroke()

  annotations.forEach((ann, i) => {
    const rowY = h + LEGEND_PADDING + i * LEGEND_ROW_HEIGHT
    const centerY = rowY + LEGEND_ROW_HEIGHT / 2
    const dotX = LEGEND_PADDING + DOT_RADIUS

    // Badge dot
    ctx.fillStyle = ann.color
    ctx.beginPath()
    ctx.arc(dotX, centerY, DOT_RADIUS, 0, Math.PI * 2)
    ctx.fill()

    // Badge number
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${LEGEND_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), dotX, centerY)

    // Note text — wrap at canvas width minus left padding and right margin
    const textX = dotX + DOT_RADIUS + 10
    const maxTextWidth = w - textX - LEGEND_PADDING
    ctx.fillStyle = '#1a1a1a'
    ctx.textAlign = 'left'
    ctx.font = `${LEGEND_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

    const noteText = ann.text.trim() || '(no text)'
    const words = noteText.split(' ')
    let line = ''
    let lineCount = 0
    const lineHeight = 18

    // Single-line only for the legend (keep it compact)
    // Truncate with ellipsis if too wide
    let displayText = noteText
    while (ctx.measureText(displayText).width > maxTextWidth && displayText.length > 0) {
      displayText = displayText.slice(0, -1)
    }
    if (displayText !== noteText) displayText = displayText.slice(0, -1) + '…'
    void words
    void line
    void lineCount
    void lineHeight

    ctx.fillText(displayText, textX, centerY)
  })

  ctx.restore()

  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = src
  })
}
