import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { AnnotationPoint, PlacedArrow } from '../types'
import { MARKER_COLORS } from './BoxLayer'
import IdPill from './IdPill'

const HANDLE_PX = 8
const HIT_PX = 8
const MIN_LEN = 0.012
const DRAG_THRESHOLD = 4
export const DEFAULT_ARROW_THICKNESS = 3.5
export const MIN_ARROW_THICKNESS = 2
export const MAX_ARROW_THICKNESS = 10
const HEAD_LEN_PX = 19
const HEAD_HALF_WIDTH_PX = 8.5
const OUTLINE_PX = 3

function headSizeForThickness(thickness: number): { length: number; halfWidth: number } {
  const scale = thickness / DEFAULT_ARROW_THICKNESS
  return { length: HEAD_LEN_PX * scale, halfWidth: HEAD_HALF_WIDTH_PX * scale }
}

function arrowHeadPolygon(
  tipX: number,
  tipY: number,
  tailX: number,
  tailY: number,
  length = HEAD_LEN_PX,
  halfWidth = HEAD_HALF_WIDTH_PX,
): string {
  const dx = tipX - tailX
  const dy = tipY - tailY
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const baseX = tipX - length * ux
  const baseY = tipY - length * uy
  const px = -uy
  const py = ux
  const x1 = baseX + halfWidth * px
  const y1 = baseY + halfWidth * py
  const x2 = baseX - halfWidth * px
  const y2 = baseY - halfWidth * py
  return `${tipX},${tipY} ${x1},${y1} ${x2},${y2}`
}

function shortenTowardTip(
  tailX: number,
  tailY: number,
  tipX: number,
  tipY: number,
  amount: number,
): { x: number; y: number } {
  const dx = tipX - tailX
  const dy = tipY - tailY
  const len = Math.hypot(dx, dy)
  if (len <= amount) return { x: tipX, y: tipY }
  const t = (len - amount) / len
  return { x: tailX + dx * t, y: tailY + dy * t }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return Math.hypot(px - projX, py - projY)
}

function arrowLength(a: PlacedArrow): number {
  return Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y)
}

interface ArrowLayerProps {
  arrows: PlacedArrow[]
  selectedId: string | null
  active: boolean
  imgRef: React.RefObject<HTMLImageElement | null>
  onSelect: (id: string | null) => void
  onCreate: (start: AnnotationPoint, end: AnnotationPoint) => void
  onUpdate: (id: string, start: AnnotationPoint, end: AnnotationPoint) => void
  onColorChange: (id: string, color: string) => void
  onThicknessChange: (id: string, thickness: number) => void
  onDelete: (id: string) => void
}

export default function ArrowLayer({
  arrows,
  selectedId,
  active,
  imgRef,
  onSelect,
  onCreate,
  onUpdate,
  onColorChange,
  onThicknessChange,
  onDelete,
}: ArrowLayerProps): React.ReactElement {
  const [draft, setDraft] = useState<{ start: AnnotationPoint; end: AnnotationPoint } | null>(null)
  const placingRef = useRef<{ start: AnnotationPoint; sx: number; sy: number } | null>(null)

  type DragState =
    | { kind: 'endpoint'; id: string; which: 'start' | 'end'; orig: PlacedArrow }
    | { kind: 'move'; id: string; orig: PlacedArrow; grab: AnnotationPoint }

  const dragRef = useRef<DragState | null>(null)
  const [dragKind, setDragKind] = useState<'move' | 'endpoint' | null>(null)
  const [hoverKind, setHoverKind] = useState<'none' | 'handle' | 'line'>('none')
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const update = (): void => setImgSize({ w: el.offsetWidth, h: el.offsetHeight })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return (): void => ro.disconnect()
  }, [imgRef, arrows.length])

  const toFraction = useCallback(
    (clientX: number, clientY: number): AnnotationPoint | null => {
      const img = imgRef.current
      if (!img) return null
      const r = img.getBoundingClientRect()
      return {
        x: clamp01((clientX - r.left) / r.width),
        y: clamp01((clientY - r.top) / r.height),
      }
    },
    [imgRef],
  )

  const hitTestArrow = useCallback(
    (pt: AnnotationPoint): string | null => {
      let bestId: string | null = null
      let bestDist = HIT_PX / (imgRef.current?.getBoundingClientRect().width ?? 1)
      for (const arrow of arrows) {
        const d = distToSegment(pt.x, pt.y, arrow.start.x, arrow.start.y, arrow.end.x, arrow.end.y)
        if (d < bestDist) {
          bestDist = d
          bestId = arrow.id
        }
      }
      return bestId
    },
    [arrows, imgRef],
  )

  const hitTestSelectedHandle = useCallback(
    (pt: AnnotationPoint): 'start' | 'end' | null => {
      if (!selectedId) return null
      const selected = arrows.find((a) => a.id === selectedId)
      if (!selected) return null
      const img = imgRef.current
      const w = img?.getBoundingClientRect().width ?? 1
      const h = img?.getBoundingClientRect().height ?? 1
      const startDist = Math.hypot((pt.x - selected.start.x) * w, (pt.y - selected.start.y) * h)
      if (startDist <= HANDLE_PX + 2) return 'start'
      const endDist = Math.hypot((pt.x - selected.end.x) * w, (pt.y - selected.end.y) * h)
      if (endDist <= HANDLE_PX + 2) return 'end'
      return null
    },
    [arrows, imgRef, selectedId],
  )

  const handleLayerMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      if (!active) return
      e.preventDefault()
      e.stopPropagation()
      const pt = toFraction(e.clientX, e.clientY)
      if (!pt) return

      const handleHit = hitTestSelectedHandle(pt)
      if (handleHit && selectedId) {
        const selected = arrows.find((a) => a.id === selectedId)!
        dragRef.current = { kind: 'endpoint', id: selectedId, which: handleHit, orig: selected }
        setDragKind('endpoint')
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
        return
      }

      const hitId = hitTestArrow(pt)
      if (hitId) {
        onSelect(hitId)
        const arrow = arrows.find((a) => a.id === hitId)!
        dragRef.current = { kind: 'move', id: hitId, orig: arrow, grab: pt }
        setDragKind('move')
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
        return
      }

      onSelect(null)
      placingRef.current = { start: pt, sx: e.clientX, sy: e.clientY }
      setDraft({ start: pt, end: pt })
      document.body.style.userSelect = 'none'
    },
    [active, arrows, hitTestArrow, hitTestSelectedHandle, onSelect, selectedId, toFraction],
  )

  const handleLayerMouseMove = useCallback(
    (e: React.MouseEvent): void => {
      if (!active || dragRef.current || placingRef.current) return
      const pt = toFraction(e.clientX, e.clientY)
      if (!pt) {
        setHoverKind('none')
        return
      }
      if (hitTestSelectedHandle(pt)) {
        setHoverKind('handle')
        return
      }
      setHoverKind(hitTestArrow(pt) ? 'line' : 'none')
    },
    [active, hitTestArrow, hitTestSelectedHandle, toFraction],
  )

  const handleLayerMouseLeave = useCallback((): void => {
    setHoverKind('none')
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const placing = placingRef.current
      if (placing) {
        const dx = e.clientX - placing.sx
        const dy = e.clientY - placing.sy
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        const end = toFraction(e.clientX, e.clientY)
        if (end) setDraft({ start: placing.start, end })
        return
      }

      const drag = dragRef.current
      if (!drag) return
      const pt = toFraction(e.clientX, e.clientY)
      if (!pt) return

      if (drag.kind === 'endpoint') {
        const next =
          drag.which === 'start'
            ? { ...drag.orig, start: pt }
            : { ...drag.orig, end: pt }
        onUpdate(drag.id, next.start, next.end)
      } else {
        const dx = pt.x - drag.grab.x
        const dy = pt.y - drag.grab.y
        onUpdate(
          drag.id,
          { x: clamp01(drag.orig.start.x + dx), y: clamp01(drag.orig.start.y + dy) },
          { x: clamp01(drag.orig.end.x + dx), y: clamp01(drag.orig.end.y + dy) },
        )
      }
    }

    const onUp = (e: MouseEvent): void => {
      const placing = placingRef.current
      if (placing) {
        const end = toFraction(e.clientX, e.clientY)
        placingRef.current = null
        setDraft(null)
        document.body.style.userSelect = ''
        if (end) {
          const len = Math.hypot(end.x - placing.start.x, end.y - placing.start.y)
          if (len >= MIN_LEN) onCreate(placing.start, end)
        }
        return
      }

      if (dragRef.current) {
        dragRef.current = null
        setDragKind(null)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onCreate, onUpdate, toFraction])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!selectedId) return
      const target = e.target as HTMLElement
      if (
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'INPUT' ||
        target.isContentEditable
      ) {
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDelete(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [onDelete, selectedId])

  const selectedArrow = selectedId ? arrows.find((a) => a.id === selectedId) : null
  const renderList = draft ? [...arrows, { id: '__draft__', ...draft, color: '#888' }] : arrows

  const toPx = (pt: AnnotationPoint): { x: number; y: number } => ({
    x: pt.x * imgSize.w,
    y: pt.y * imgSize.h,
  })

  const cursor = !active
    ? 'default'
    : dragKind === 'move' || dragKind === 'endpoint'
      ? 'grabbing'
      : draft
        ? 'crosshair'
        : hoverKind !== 'none'
          ? 'grab'
          : 'crosshair'

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: active ? 'all' : 'none',
        overflow: 'visible',
        zIndex: 4,
        cursor,
      }}
      onMouseDown={handleLayerMouseDown}
      onMouseMove={handleLayerMouseMove}
      onMouseLeave={handleLayerMouseLeave}
    >
      <svg
        width={imgSize.w}
        height={imgSize.h}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {renderList.map((arrow) => {
          const dashed = arrow.id === '__draft__'
          const thickness = (arrow as PlacedArrow).thickness ?? DEFAULT_ARROW_THICKNESS
          const head = headSizeForThickness(thickness)
          const start = toPx(arrow.start)
          const end = toPx(arrow.end)
          const lineEnd = dashed
            ? end
            : shortenTowardTip(start.x, start.y, end.x, end.y, head.length - 3)
          const headPoints = !dashed
            ? arrowHeadPolygon(end.x, end.y, start.x, start.y, head.length, head.halfWidth)
            : null
          return (
            <g key={arrow.id}>
              {!dashed && (
                <>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={lineEnd.x}
                    y2={lineEnd.y}
                    stroke="#fff"
                    strokeWidth={thickness + OUTLINE_PX * 2}
                    strokeDasharray="5 3"
                    strokeLinecap="butt"
                  />
                  <polygon
                    points={headPoints!}
                    fill="#fff"
                    stroke="#fff"
                    strokeWidth={OUTLINE_PX * 2}
                    strokeLinejoin="round"
                  />
                </>
              )}
              <line
                x1={start.x}
                y1={start.y}
                x2={lineEnd.x}
                y2={lineEnd.y}
                stroke={arrow.color}
                strokeWidth={thickness}
                strokeDasharray="5 3"
                strokeLinecap="butt"
                opacity={dashed ? 0.65 : 1}
              />
              {!dashed && <polygon points={headPoints!} fill={arrow.color} />}
            </g>
          )
        })}
      </svg>

      {arrows.map((arrow) => {
        const mid = {
          x: (arrow.start.x + arrow.end.x) / 2,
          y: (arrow.start.y + arrow.end.y) / 2,
        }
        return (
          <IdPill
            key={`pill-${arrow.id}`}
            id={arrow.id}
            color={arrow.color}
            style={{
              position: 'absolute',
              left: `${mid.x * 100}%`,
              top: `${mid.y * 100}%`,
              // No rotation here — the pill must stay upright regardless of arrow angle.
              transform: 'translate(-50%, -50%)',
              zIndex: 5,
              pointerEvents: 'all',
            }}
          />
        )
      })}

      {selectedArrow && arrowLength(selectedArrow) > 0 && (
        <>
          {(['start', 'end'] as const).map((which) => {
            const pt = which === 'start' ? selectedArrow.start : selectedArrow.end
            return (
              <div
                key={which}
                style={{
                  position: 'absolute',
                  left: `${pt.x * 100}%`,
                  top: `${pt.y * 100}%`,
                  width: HANDLE_PX,
                  height: HANDLE_PX,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: 2,
                  background: selectedArrow.color,
                  border: '1.5px solid #fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  pointerEvents: 'none',
                  opacity: 0.9,
                }}
              />
            )
          })}

          <ArrowToolbar
            arrow={selectedArrow}
            onColorChange={(c) => onColorChange(selectedArrow.id, c)}
            onThicknessChange={(t) => onThicknessChange(selectedArrow.id, t)}
            onDelete={() => onDelete(selectedArrow.id)}
          />
        </>
      )}
    </div>
  )
}

function ArrowToolbar({
  arrow,
  onColorChange,
  onThicknessChange,
  onDelete,
}: {
  arrow: PlacedArrow
  onColorChange: (color: string) => void
  onThicknessChange: (thickness: number) => void
  onDelete: () => void
}): React.ReactElement {
  const thickness = arrow.thickness ?? DEFAULT_ARROW_THICKNESS
  const mid = {
    x: (arrow.start.x + arrow.end.x) / 2,
    y: (arrow.start.y + arrow.end.y) / 2,
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${mid.x * 100}%`,
        top: `${mid.y * 100}%`,
        transform: 'translate(-50%, calc(-100% - 10px))',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: 'rgba(18,18,18,0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '5px 8px',
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        zIndex: 10,
        pointerEvents: 'all',
        whiteSpace: 'nowrap',
      }}
      onMouseDown={(e): void => e.stopPropagation()}
    >
      {MARKER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: c,
            border: c === arrow.color ? '2px solid #fff' : '2px solid transparent',
            outline: c === arrow.color ? `2px solid ${c}88` : 'none',
            outlineOffset: 1,
            padding: 0,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onClick={(e): void => {
            e.stopPropagation()
            onColorChange(c)
          }}
          aria-label="Set arrow color"
        />
      ))}
      <div
        style={{
          width: 1,
          height: 12,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 1px',
          flexShrink: 0,
        }}
      />
      <input
        type="range"
        min={MIN_ARROW_THICKNESS}
        max={MAX_ARROW_THICKNESS}
        step={0.5}
        value={thickness}
        onChange={(e): void => onThicknessChange(parseFloat(e.target.value))}
        onClick={(e): void => e.stopPropagation()}
        style={{
          width: 56,
          height: 14,
          margin: 0,
          accentColor: arrow.color,
          cursor: 'pointer',
        }}
        aria-label="Arrow thickness"
        title="Arrow thickness"
      />
      <div
        style={{
          width: 1,
          height: 12,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 1px',
          flexShrink: 0,
        }}
      />
      <button
        type="button"
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          color: 'rgba(255,255,255,0.85)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
        onClick={(e): void => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="Delete arrow"
        title="Delete arrow"
      >
        <Trash2 size={12} strokeWidth={2.5} />
      </button>
    </div>
  )
}
