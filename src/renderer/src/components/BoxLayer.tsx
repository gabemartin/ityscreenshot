import React, { useCallback, useEffect, useRef } from 'react'
import { BoxAnnotation, BoxRect } from '../types'

const COLORS = ['#E91E8C', '#2979FF', '#00BFA5', '#FF6D00']
const HANDLE_PX = 8
const MIN_DIM = 0.005

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

// Each handle is positioned as a % of the box's width/height, then centered
// via transform: translate(-50%, -50%) so the handle dot sits exactly on the edge/corner.
const HANDLE_POS: Record<Handle, { left: string; top: string }> = {
  nw: { left: '0%', top: '0%' },
  n: { left: '50%', top: '0%' },
  ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' },
  s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' },
  w: { left: '0%', top: '50%' },
}

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// Compute new rect from a cumulative drag delta for the given resize handle.
// dx and dy are fractional (already divided by container pixel dimensions).
function applyResize(orig: BoxRect, handle: Handle, dx: number, dy: number): BoxRect {
  let { x, y, w, h } = orig
  // 'w' side: left edge moves right, width shrinks
  if (handle.includes('w')) { x = orig.x + dx; w = orig.w - dx }
  // 'e' side: right edge moves, width grows
  if (handle.includes('e')) { w = orig.w + dx }
  // 'n' side: top edge moves down, height shrinks
  if (handle.includes('n')) { y = orig.y + dy; h = orig.h - dy }
  // 's' side: bottom edge moves, height grows
  if (handle.includes('s')) { h = orig.h + dy }
  // Normalize inverted boxes (when dragging past the opposite edge)
  if (w < 0) { x += w; w = -w }
  if (h < 0) { y += h; h = -h }
  x = clamp(x, 0, 1)
  y = clamp(y, 0, 1)
  w = clamp(w, MIN_DIM, 1 - x)
  h = clamp(h, MIN_DIM, 1 - y)
  return { x, y, w, h }
}

interface BoxLayerProps {
  boxes: BoxAnnotation[]
  draftBox: BoxRect | null
  draftColor: string
  selectedBoxId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (id: string, rect: BoxRect) => void
  onColorChange: (id: string, color: string) => void
  onDelete: (id: string) => void
  imgRef: React.RefObject<HTMLImageElement | null>
}

export default function BoxLayer({
  boxes,
  draftBox,
  draftColor,
  selectedBoxId,
  onSelect,
  onUpdate,
  onColorChange,
  onDelete,
  imgRef,
}: BoxLayerProps): React.ReactElement {
  type DragState = {
    boxId: string
    action: 'move' | Handle
    startX: number
    startY: number
    origRect: BoxRect
    cw: number
    ch: number
  }

  const drag = useRef<DragState | null>(null)

  const startDrag = useCallback(
    (
      e: React.MouseEvent,
      boxId: string,
      action: 'move' | Handle,
      origRect: BoxRect,
    ): void => {
      e.preventDefault()
      e.stopPropagation()
      const img = imgRef.current
      if (!img) return
      const r = img.getBoundingClientRect()
      drag.current = {
        boxId,
        action,
        startX: e.clientX,
        startY: e.clientY,
        origRect,
        cw: r.width,
        ch: r.height,
      }
      document.body.style.cursor = action === 'move' ? 'move' : HANDLE_CURSOR[action as Handle]
      document.body.style.userSelect = 'none'
    },
    [imgRef],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const d = drag.current
      if (!d) return
      const dx = (e.clientX - d.startX) / d.cw
      const dy = (e.clientY - d.startY) / d.ch
      let rect: BoxRect
      if (d.action === 'move') {
        rect = {
          x: clamp(d.origRect.x + dx, 0, 1 - d.origRect.w),
          y: clamp(d.origRect.y + dy, 0, 1 - d.origRect.h),
          w: d.origRect.w,
          h: d.origRect.h,
        }
      } else {
        rect = applyResize(d.origRect, d.action as Handle, dx, dy)
      }
      onUpdate(d.boxId, rect)
    }

    const onUp = (): void => {
      if (!drag.current) return
      drag.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onUpdate])

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 3 }}
    >
      {/* Draft box while actively drawing */}
      {draftBox && draftBox.w > 0 && draftBox.h > 0 && (
        <div
          style={{
            position: 'absolute',
            left: `${draftBox.x * 100}%`,
            top: `${draftBox.y * 100}%`,
            width: `${draftBox.w * 100}%`,
            height: `${draftBox.h * 100}%`,
            border: `4px dashed ${draftColor}`,
            background: `${draftColor}22`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            borderRadius: 1,
            boxShadow: '0 3px 12px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.35)',
          }}
        />
      )}

      {/* Finalized boxes */}
      {boxes.map((box) => {
        const selected = box.id === selectedBoxId
        return (
          <div
            key={box.id}
            style={{
              position: 'absolute',
              left: `${box.rect.x * 100}%`,
              top: `${box.rect.y * 100}%`,
              width: `${box.rect.w * 100}%`,
              height: `${box.rect.h * 100}%`,
              border: `4px solid ${box.color}`,
              background: selected ? `${box.color}28` : `${box.color}0E`,
              boxSizing: 'border-box',
              pointerEvents: 'all',
              cursor: 'move',
              overflow: 'visible',
              borderRadius: 1,
              boxShadow: selected ? `0 0 0 1px ${box.color}55, 0 4px 16px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4)` : `0 3px 12px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.35)`,
              zIndex: selected ? 2 : 1,
              transition: 'background 0.1s',
            }}
            onMouseDown={(e): void => startDrag(e, box.id, 'move', box.rect)}
            onClick={(e): void => {
              e.stopPropagation()
              onSelect(box.id)
            }}
          >
            {/* Resize handles — only visible when box is selected */}
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
                    background: box.color,
                    border: '1.5px solid #fff',
                    borderRadius: 2,
                    transform: 'translate(-50%, -50%)',
                    cursor: HANDLE_CURSOR[h],
                    pointerEvents: 'all',
                    zIndex: 4,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}
                  onMouseDown={(e): void => startDrag(e, box.id, h, box.rect)}
                />
              ))}

            {/* Color swatch + delete pill — floats above the box when selected */}
            {selected && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 10px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
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
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: c,
                      border: c === box.color ? '2px solid #fff' : '2px solid transparent',
                      outline: c === box.color ? `2px solid ${c}88` : 'none',
                      outlineOffset: 1,
                      padding: 0,
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'outline 0.1s, border 0.1s',
                    }}
                    onClick={(e): void => {
                      e.stopPropagation()
                      onColorChange(box.id, c)
                    }}
                    aria-label={`Set box color`}
                  />
                ))}

                {/* Separator */}
                <div
                  style={{
                    width: 1,
                    height: 12,
                    background: 'rgba(255,255,255,0.2)',
                    margin: '0 1px',
                    flexShrink: 0,
                  }}
                />

                {/* Delete button */}
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
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 0,
                    flexShrink: 0,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                  onClick={(e): void => {
                    e.stopPropagation()
                    onDelete(box.id)
                  }}
                  aria-label="Delete box"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
