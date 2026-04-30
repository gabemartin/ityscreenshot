import { Annotation } from '../types'

const SIDEBAR_W = 280
const CARD_MARGIN = 8
const CARD_PADDING_V = 10
const CARD_PADDING_H = 12
const CARD_BORDER = 3
const CARD_RADIUS = 8
const FONT_SIZE = 13
const LINE_H = 20
const DOT_R = 5
const SIDEBAR_TOP_PAD = 16

/**
 * Renders an image that looks exactly like the app UI:
 * - Left: white sidebar with annotation cards (colored left border, note text)
 * - Right: the screenshot with small colored dots at each annotation point
 * - Dashed colored lines connecting each card to its dot
 * No top bar, no buttons, no delete icons.
 */
export async function renderAnnotatedImage(
  imageUrl: string,
  annotations: Annotation[]
): Promise<string> {
  const img = await loadImage(imageUrl)
  const { naturalWidth: imgW, naturalHeight: imgH } = img

  // Measure card heights first so we can size the canvas
  const scratch = document.createElement('canvas').getContext('2d')!
  scratch.font = `${FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  const textMaxW = SIDEBAR_W - CARD_PADDING_H * 2 - CARD_BORDER - 4

  const cardHeights = annotations.map((ann) => {
    const lines = wrapText(scratch, ann.text.trim() || '(no note)', textMaxW)
    return CARD_PADDING_V + lines.length * LINE_H + CARD_PADDING_V
  })

  const totalCardsH =
    SIDEBAR_TOP_PAD +
    cardHeights.reduce((s, h) => s + h, 0) +
    CARD_MARGIN * Math.max(0, annotations.length - 1) +
    SIDEBAR_TOP_PAD

  const canvasH = Math.max(imgH, totalCardsH)
  const canvasW = (annotations.length > 0 ? SIDEBAR_W : 0) + imgW

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!

  const imgOffsetY = Math.floor((canvasH - imgH) / 2)
  const imgX = annotations.length > 0 ? SIDEBAR_W : 0

  // ── Sidebar background ──────────────────────────────────────────────────────
  if (annotations.length > 0) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SIDEBAR_W, canvasH)
    // Thin right border matching the app's panel separator
    ctx.fillStyle = '#e8e8e8'
    ctx.fillRect(SIDEBAR_W - 1, 0, 1, canvasH)
  }

  // ── Image ───────────────────────────────────────────────────────────────────
  ctx.drawImage(img, imgX, imgOffsetY, imgW, imgH)

  if (annotations.length === 0) return canvas.toDataURL('image/png')

  // ── Cards + arrows + dots ───────────────────────────────────────────────────
  let cardY = SIDEBAR_TOP_PAD

  annotations.forEach((ann, i) => {
    ctx.font = `${FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    const lines = wrapText(ctx, ann.text.trim() || '(no note)', textMaxW)
    const cardH = cardHeights[i]
    const cardX = 8
    const cardW = SIDEBAR_W - 16

    // Card shadow
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.07)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 2
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS)
    ctx.fill()
    ctx.restore()

    // Colored left border
    ctx.fillStyle = ann.color
    roundRect(ctx, cardX, cardY, CARD_BORDER, cardH, CARD_RADIUS)
    ctx.fill()

    // Note text
    const textX = cardX + CARD_BORDER + CARD_PADDING_H
    const textBlockH = lines.length * LINE_H
    const textStartY = cardY + (cardH - textBlockH) / 2
    ctx.fillStyle = '#1a1a1a'
    ctx.font = `${FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    lines.forEach((line, li) => ctx.fillText(line, textX, textStartY + li * LINE_H))

    // Arrow: from right-center of card to dot on image
    const sx = cardX + cardW          // right edge of card
    const sy = cardY + cardH / 2      // vertical center of card
    const tx = imgX + ann.point.x * imgW
    const ty = imgOffsetY + ann.point.y * imgH

    ctx.save()
    ctx.strokeStyle = ann.color
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 3])
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    ctx.restore()

    // Dot on image — same size as the live UI overlay
    ctx.save()
    ctx.fillStyle = ann.color
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(tx, ty, DOT_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(tx, ty, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    cardY += cardH + CARD_MARGIN
  })

  return canvas.toDataURL('image/png')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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
  return lines.length ? lines : ['']
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
