import { Annotation } from '../types'

const SIDEBAR_W = 300
const PAD = 14
const CARD_MARGIN = 8
const BADGE_R = 11
const FONT_SIZE = 13
const LINE_H = 19
const BORDER_W = 3

/**
 * Renders the screenshot with a notes sidebar to the right.
 * - Numbered colored dots on the image at each annotation point
 * - Sidebar panel with matching numbered cards + note text
 * - Dashed lines connecting each card to its dot
 * Returns a PNG dataURL.
 */
export async function renderAnnotatedImage(
  imageUrl: string,
  annotations: Annotation[]
): Promise<string> {
  const img = await loadImage(imageUrl)
  const { naturalWidth: imgW, naturalHeight: imgH } = img

  const hasSidebar = annotations.length > 0
  const totalW = hasSidebar ? imgW + SIDEBAR_W : imgW

  // First pass: measure card heights so we can center the sidebar block vertically
  const ctx0 = document.createElement('canvas').getContext('2d')!
  ctx0.font = `${FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  const textMaxW = SIDEBAR_W - PAD * 2 - BORDER_W - BADGE_R * 2 - 10
  const cardHeights = annotations.map((ann) => {
    const lines = wrapText(ctx0, ann.text.trim() || '(no note)', textMaxW)
    return Math.max(PAD * 2 + BADGE_R * 2, PAD + lines.length * LINE_H + PAD)
  })
  const totalSidebarH =
    cardHeights.reduce((s, h) => s + h, 0) + CARD_MARGIN * (annotations.length - 1) + PAD * 2

  const canvasH = Math.max(imgH, totalSidebarH)

  const canvas = document.createElement('canvas')
  canvas.width = totalW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!

  // ── Background ──
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(0, 0, totalW, canvasH)

  // ── Image ──
  // If canvas is taller than image, center the image vertically
  const imgOffsetY = Math.floor((canvasH - imgH) / 2)
  ctx.drawImage(img, 0, imgOffsetY, imgW, imgH)

  if (!hasSidebar) return canvas.toDataURL('image/png')

  // ── Sidebar background + separator ──
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(imgW, 0, SIDEBAR_W, canvasH)
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(imgW, 0)
  ctx.lineTo(imgW, canvasH)
  ctx.stroke()

  // ── Cards ──
  const sidebarStartY = Math.floor((canvasH - totalSidebarH) / 2) + PAD

  let cardY = sidebarStartY
  annotations.forEach((ann, i) => {
    ctx.font = `${FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    const textMaxWidth = SIDEBAR_W - PAD * 2 - BORDER_W - BADGE_R * 2 - 10
    const lines = wrapText(ctx, ann.text.trim() || '(no note)', textMaxWidth)
    const cardH = cardHeights[i]
    const cardX = imgW + PAD
    const cardW = SIDEBAR_W - PAD * 2

    // Card shadow / background
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 2
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, cardX, cardY, cardW, cardH, 6)
    ctx.fill()
    ctx.restore()

    // Colored left border
    ctx.fillStyle = ann.color
    roundRect(ctx, cardX, cardY, BORDER_W, cardH, 3)
    ctx.fill()

    // Number badge
    const badgeX = cardX + BORDER_W + 8 + BADGE_R
    const badgeCY = cardY + cardH / 2
    ctx.save()
    ctx.fillStyle = ann.color
    ctx.beginPath()
    ctx.arc(badgeX, badgeCY, BADGE_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), badgeX, badgeCY)
    ctx.restore()

    // Note text
    const textX = badgeX + BADGE_R + 8
    const textBlockH = lines.length * LINE_H
    const textStartY = cardY + (cardH - textBlockH) / 2
    ctx.save()
    ctx.fillStyle = '#1a1a1a'
    ctx.font = `${FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    lines.forEach((line, li) => ctx.fillText(line, textX, textStartY + li * LINE_H))
    ctx.restore()

    // ── Arrow from card left edge into image ──
    const tx = ann.point.x * imgW
    const ty = ann.point.y * imgH + imgOffsetY
    const sx = imgW  // right edge of image = left edge of sidebar
    const sy = cardY + cardH / 2

    ctx.save()
    ctx.strokeStyle = ann.color
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.globalAlpha = 0.75
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    ctx.restore()

    // ── Dot on image ──
    ctx.save()
    // Dark halo for contrast against any background
    ctx.globalAlpha = 0.35
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(tx, ty, BADGE_R + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = ann.color
    ctx.beginPath()
    ctx.arc(tx, ty, BADGE_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), tx, ty)
    ctx.restore()

    cardY += cardH + CARD_MARGIN
  })

  return canvas.toDataURL('image/png')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return ['']
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
