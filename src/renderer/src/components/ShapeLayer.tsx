import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { AnnotationPoint, BoxRect, PlacedShape, ShapeKind } from '../types'
import {
  MARKER_COLORS,
  applyResize,
  clamp,
  ALL_HANDLES,
  HANDLE_POS,
  HANDLE_CURSOR,
  HANDLE_PX,
  Handle,
} from './BoxLayer'
import IdPill from './IdPill'

export const DEFAULT_SHAPE_THICKNESS = 3
export const MIN_SHAPE_THICKNESS = 1.5
export const MAX_SHAPE_THICKNESS = 10
const MIN_DIM = 0.012
const DRAG_THRESHOLD = 4

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

interface ShapeLayerProps {
  shapes: PlacedShape[]
  selectedId: string | null
  /** Which kind newly-drawn shapes should be. Layer is interactive iff this is non-null. */
  activeKind: ShapeKind | null
  imgRef: React.RefObject<HTMLImageElement | null>
  onSelect: (id: string | null) => void
  onCreate: (kind: ShapeKind, rect: BoxRect) => void
  onUpdateRect: (id: string, rect: BoxRect) => void
  onColorChange: (id: string, color: string) => void
  onThicknessChange: (id: string, thickness: number) => void
  onDelete: (id: string) => void
}

export default function ShapeLayer({
  shapes,
  selectedId,
  activeKind,
  imgRef,
  onSelect,
  onCreate,
  onUpdateRect,
  onColorChange,
  onThicknessChange,
  onDelete,
}: ShapeLayerProps): React.ReactElement {
  const active = activeKind !== null
  const [draft, setDraft] = useState<BoxRect | null>(null)
  const placingRef = useRef<{ x1: number; y1: number; sx: number; sy: number } | null>(null)

  type DragState = {
    id: string
    action: 'move' | Handle
    origRect: BoxRect
    startX: number
    startY: number
    cw: number
    ch: number
  }
  const dragRef = useRef<DragState | null>(null)
  const [isDraggingShape, setIsDraggingShape] = useState(false)

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

  const handleBackgroundMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      if (!active) return
      // Only start a new shape when the click didn't land on an existing
      // shape/handle (those call stopPropagation in their own handlers).
      e.preventDefault()
      const pt = toFraction(e.clientX, e.clientY)
      if (!pt) return
      onSelect(null)
      placingRef.current = { x1: pt.x, y1: pt.y, sx: e.clientX, sy: e.clientY }
      setDraft({ x: pt.x, y: pt.y, w: 0, h: 0 })
      document.body.style.userSelect = 'none'
    },
    [active, onSelect, toFraction],
  )

  const startMoveDrag = useCallback(
    (e: React.MouseEvent, id: string, origRect: BoxRect): void => {
      e.preventDefault()
      e.stopPropagation()
      const img = imgRef.current
      if (!img) return
      const r = img.getBoundingClientRect()
      onSelect(id)
      dragRef.current = { id, action: 'move', origRect, startX: e.clientX, startY: e.clientY, cw: r.width, ch: r.height }
      setIsDraggingShape(true)
      document.body.style.cursor = 'move'
      document.body.style.userSelect = 'none'
    },
    [imgRef, onSelect],
  )

  const startHandleDrag = useCallback(
    (e: React.MouseEvent, id: string, action: Handle, origRect: BoxRect): void => {
      e.preventDefault()
      e.stopPropagation()
      const img = imgRef.current
      if (!img) return
      const r = img.getBoundingClientRect()
      dragRef.current = { id, action, origRect, startX: e.clientX, startY: e.clientY, cw: r.width, ch: r.height }
      setIsDraggingShape(true)
      document.body.style.cursor = HANDLE_CURSOR[action]
      document.body.style.userSelect = 'none'
    },
    [imgRef],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const placing = placingRef.current
      if (placing) {
        const dx = e.clientX - placing.sx
        const dy = e.clientY - placing.sy
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        const pt = toFraction(e.clientX, e.clientY)
        if (!pt) return
        setDraft({
          x: Math.min(placing.x1, pt.x),
          y: Math.min(placing.y1, pt.y),
          w: Math.abs(pt.x - placing.x1),
          h: Math.abs(pt.y - placing.y1),
        })
        return
      }

      const drag = dragRef.current
      if (!drag) return
      const dx = (e.clientX - drag.startX) / drag.cw
      const dy = (e.clientY - drag.startY) / drag.ch
      let rect: BoxRect
      if (drag.action === 'move') {
        rect = {
          x: clamp(drag.origRect.x + dx, 0, 1 - drag.origRect.w),
          y: clamp(drag.origRect.y + dy, 0, 1 - drag.origRect.h),
          w: drag.origRect.w,
          h: drag.origRect.h,
        }
      } else {
        rect = applyResize(drag.origRect, drag.action, dx, dy)
      }
      onUpdateRect(drag.id, rect)
    }

    const onUp = (e: MouseEvent): void => {
      const placing = placingRef.current
      if (placing) {
        placingRef.current = null
        document.body.style.userSelect = ''
        const pt = toFraction(e.clientX, e.clientY)
        setDraft(null)
        if (pt && activeKind) {
          const rect: BoxRect = {
            x: Math.min(placing.x1, pt.x),
            y: Math.min(placing.y1, pt.y),
            w: Math.abs(pt.x - placing.x1),
            h: Math.abs(pt.y - placing.y1),
          }
          if (rect.w >= MIN_DIM && rect.h >= MIN_DIM) onCreate(activeKind, rect)
        }
        return
      }

      if (dragRef.current) {
        dragRef.current = null
        setIsDraggingShape(false)
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
  }, [activeKind, onCreate, onUpdateRect, toFraction])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!selectedId) return
      const target = e.target as HTMLElement
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDelete(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [onDelete, selectedId])

  const selectedShape = selectedId ? shapes.find((s) => s.id === selectedId) : null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: active ? 'all' : 'none',
        overflow: 'visible',
        zIndex: 4,
        cursor: active ? (draft || isDraggingShape ? undefined : 'crosshair') : 'default',
      }}
      onMouseDown={handleBackgroundMouseDown}
    >
      {shapes.map((shape) => {
        const selected = shape.id === selectedId
        const thickness = shape.thickness ?? DEFAULT_SHAPE_THICKNESS
        return (
          <div
            key={shape.id}
            style={{
              position: 'absolute',
              left: `${shape.rect.x * 100}%`,
              top: `${shape.rect.y * 100}%`,
              width: `${shape.rect.w * 100}%`,
              height: `${shape.rect.h * 100}%`,
              border: `${thickness}px solid ${shape.color}`,
              borderRadius: shape.kind === 'circle' ? '50%' : 2,
              background: selected ? `${shape.color}22` : `${shape.color}0E`,
              boxSizing: 'border-box',
              cursor: 'move',
              boxShadow: selected
                ? `0 0 0 1px ${shape.color}55, 0 4px 16px rgba(0,0,0,0.4)`
                : '0 2px 10px rgba(0,0,0,0.35)',
              zIndex: selected ? 2 : 1,
              transition: 'background 0.1s',
            }}
            onMouseDown={(e): void => startMoveDrag(e, shape.id, shape.rect)}
          >
            {selected &&
              ALL_HANDLES.map((h) => (
                <div
                  key={h}
                  style={{
                    position: 'absolute',
                    left: HANDLE_POS[h].left,
                    top: HANDLE_POS[h].top,
                    width: HANDLE_PX,
                    height: HANDLE_PX,
                    background: shape.color,
                    border: '1.5px solid #fff',
                    borderRadius: 2,
                    transform: 'translate(-50%, -50%)',
                    cursor: HANDLE_CURSOR[h],
                    zIndex: 4,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}
                  onMouseDown={(e): void => startHandleDrag(e, shape.id, h, shape.rect)}
                />
              ))}
          </div>
        )
      })}

      {draft && (
        <div
          style={{
            position: 'absolute',
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.w * 100}%`,
            height: `${draft.h * 100}%`,
            border: '2px dashed rgba(255,255,255,0.85)',
            borderRadius: activeKind === 'circle' ? '50%' : 2,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
          }}
        />
      )}

      {shapes.map((shape) => {
        const cx = shape.rect.x + shape.rect.w / 2
        return (
          <IdPill
            key={`pill-${shape.id}`}
            id={shape.id}
            color={shape.color}
            style={{
              position: 'absolute',
              left: `${cx * 100}%`,
              top: `${shape.rect.y * 100}%`,
              // Straddles the top edge (half above, half below) rather than
              // floating clear of it or sitting fully inside the bounds.
              transform: 'translate(-50%, -50%)',
              zIndex: 5,
              pointerEvents: 'all',
            }}
          />
        )
      })}

      {selectedShape && (
        <ShapeToolbar
          shape={selectedShape}
          onColorChange={(c) => onColorChange(selectedShape.id, c)}
          onThicknessChange={(t) => onThicknessChange(selectedShape.id, t)}
          onDelete={() => onDelete(selectedShape.id)}
        />
      )}
    </div>
  )
}

function ShapeToolbar({
  shape,
  onColorChange,
  onThicknessChange,
  onDelete,
}: {
  shape: PlacedShape
  onColorChange: (color: string) => void
  onThicknessChange: (thickness: number) => void
  onDelete: () => void
}): React.ReactElement {
  const thickness = shape.thickness ?? DEFAULT_SHAPE_THICKNESS
  const topCenter = { x: shape.rect.x + shape.rect.w / 2, y: shape.rect.y }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${topCenter.x * 100}%`,
        top: `${topCenter.y * 100}%`,
        // Cleared to sit above the ID pill, which already occupies the space
        // just above the shape's top edge.
        transform: 'translate(-50%, calc(-100% - 36px))',
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
            border: c === shape.color ? '2px solid #fff' : '2px solid transparent',
            outline: c === shape.color ? `2px solid ${c}88` : 'none',
            outlineOffset: 1,
            padding: 0,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onClick={(e): void => {
            e.stopPropagation()
            onColorChange(c)
          }}
          aria-label="Set shape color"
        />
      ))}
      <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.2)', margin: '0 1px', flexShrink: 0 }} />
      <input
        type="range"
        min={MIN_SHAPE_THICKNESS}
        max={MAX_SHAPE_THICKNESS}
        step={0.5}
        value={thickness}
        onChange={(e): void => onThicknessChange(parseFloat(e.target.value))}
        onClick={(e): void => e.stopPropagation()}
        style={{ width: 56, height: 14, margin: 0, accentColor: shape.color, cursor: 'pointer' }}
        aria-label="Shape outline thickness"
        title="Shape outline thickness"
      />
      <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.2)', margin: '0 1px', flexShrink: 0 }} />
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
        aria-label="Delete shape"
        title="Delete shape"
      >
        <Trash2 size={12} strokeWidth={2.5} />
      </button>
    </div>
  )
}
