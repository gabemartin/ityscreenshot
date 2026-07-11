import React, { useCallback, useEffect, useRef } from 'react'
import { Crosshair } from 'lucide-react'
import { Annotation, BoxRect } from '../types'

const COLORS = ['#E91E8C', '#2979FF', '#00BFA5', '#FF6D00']
const HANDLE_PX = 8
const MIN_DIM = 0.005

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

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

function rectCenter(rect: BoxRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

function applyResize(orig: BoxRect, handle: Handle, dx: number, dy: number): BoxRect {
  let { x, y, w, h } = orig
  if (handle.includes('w')) { x = orig.x + dx; w = orig.w - dx }
  if (handle.includes('e')) { w = orig.w + dx }
  if (handle.includes('n')) { y = orig.y + dy; h = orig.h - dy }
  if (handle.includes('s')) { h = orig.h + dy }
  if (w < 0) { x += w; w = -w }
  if (h < 0) { y += h; h = -h }
  x = clamp(x, 0, 1)
  y = clamp(y, 0, 1)
  w = clamp(w, MIN_DIM, 1 - x)
  h = clamp(h, MIN_DIM, 1 - y)
  return { x, y, w, h }
}

interface BoxLayerProps {
  annotations: Annotation[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdateRect: (id: string, rect: BoxRect) => void
  onColorChange: (id: string, color: string) => void
  onConvertToDot: (id: string) => void
  imgRef: React.RefObject<HTMLImageElement | null>
}

export default function BoxLayer({
  annotations,
  selectedId,
  onSelect,
  onUpdateRect,
  onColorChange,
  onConvertToDot,
  imgRef,
}: BoxLayerProps): React.ReactElement {
  type DragState = {
    annId: string
    action: 'move' | Handle
    startX: number
    startY: number
    origRect: BoxRect
    cw: number
    ch: number
  }

  const drag = useRef<DragState | null>(null)
  const boxAnnotations = annotations.filter((a): a is Annotation & { rect: BoxRect } => !!a.rect)

  const startDrag = useCallback(
    (
      e: React.MouseEvent,
      annId: string,
      action: 'move' | Handle,
      origRect: BoxRect,
    ): void => {
      e.preventDefault()
      e.stopPropagation()
      const img = imgRef.current
      if (!img) return
      const r = img.getBoundingClientRect()
      drag.current = {
        annId,
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
      onUpdateRect(d.annId, rect)
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
  }, [onUpdateRect])

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 3 }}
    >
      {boxAnnotations.map((ann) => {
        const selected = ann.id === selectedId
        const box = ann.rect
        return (
          <div
            key={ann.id}
            style={{
              position: 'absolute',
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
              border: `4px solid ${ann.color}`,
              background: selected ? `${ann.color}28` : `${ann.color}0E`,
              boxSizing: 'border-box',
              pointerEvents: 'all',
              cursor: 'move',
              overflow: 'visible',
              borderRadius: 1,
              boxShadow: selected ? `0 0 0 1px ${ann.color}55, 0 4px 16px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4)` : `0 3px 12px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.35)`,
              zIndex: selected ? 2 : 1,
              transition: 'background 0.1s',
            }}
            onMouseDown={(e): void => startDrag(e, ann.id, 'move', box)}
            onClick={(e): void => {
              e.stopPropagation()
              onSelect(ann.id)
            }}
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
                    background: ann.color,
                    border: '1.5px solid #fff',
                    borderRadius: 2,
                    transform: 'translate(-50%, -50%)',
                    cursor: HANDLE_CURSOR[h],
                    pointerEvents: 'all',
                    zIndex: 4,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}
                  onMouseDown={(e): void => startDrag(e, ann.id, h, box)}
                />
              ))}

            {selected && (
              <MarkerToolbar
                color={ann.color}
                onColorChange={(c) => onColorChange(ann.id, c)}
                onSecondaryAction={() => onConvertToDot(ann.id)}
                secondaryIcon={<Crosshair size={12} strokeWidth={2.5} />}
                secondaryLabel="Convert to dot"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

interface MarkerToolbarProps {
  color: string
  onColorChange: (color: string) => void
  onSecondaryAction: () => void
  secondaryIcon: React.ReactNode
  secondaryLabel: string
}

export function MarkerToolbar({
  color,
  onColorChange,
  onSecondaryAction,
  secondaryIcon,
  secondaryLabel,
}: MarkerToolbarProps): React.ReactElement {
  return (
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
            border: c === color ? '2px solid #fff' : '2px solid transparent',
            outline: c === color ? `2px solid ${c}88` : 'none',
            outlineOffset: 1,
            padding: 0,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'outline 0.1s, border 0.1s',
          }}
          onClick={(e): void => {
            e.stopPropagation()
            onColorChange(c)
          }}
          aria-label="Set marker color"
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
          flexShrink: 0,
        }}
        onClick={(e): void => {
          e.stopPropagation()
          onSecondaryAction()
        }}
        aria-label={secondaryLabel}
        title={secondaryLabel}
      >
        {secondaryIcon}
      </button>
    </div>
  )
}

export { rectCenter, COLORS as MARKER_COLORS }
