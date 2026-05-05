import React, { useCallback, useEffect, useRef, useState } from 'react'

export interface CropRect {
  x: number // display px relative to image element left edge
  y: number // display px relative to image element top edge
  w: number
  h: number
}

interface ImageCropOverlayProps {
  onApply: (rect: CropRect) => void
  onCancel: () => void
}

const MIN_SIZE = 20

function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  maxW: number,
  maxH: number,
): CropRect {
  const x = Math.max(0, Math.min(x1, x2))
  const y = Math.max(0, Math.min(y1, y2))
  const right = Math.min(maxW, Math.max(x1, x2))
  const bottom = Math.min(maxH, Math.max(y1, y2))
  return { x, y, w: right - x, h: bottom - y }
}

export default function ImageCropOverlay({
  onApply,
  onCancel,
}: ImageCropOverlayProps): React.ReactElement {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<CropRect | null>(null)

  const getRelativePos = useCallback((e: React.PointerEvent | PointerEvent) => {
    const el = overlayRef.current
    if (!el) return { x: 0, y: 0 }
    const bounds = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(e.clientX - bounds.left, bounds.width)),
      y: Math.max(0, Math.min(e.clientY - bounds.top, bounds.height)),
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      const pos = getRelativePos(e)
      setOrigin(pos)
      setRect(null)
      setDragging(true)
    },
    [getRelativePos],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (!dragging || !origin || !overlayRef.current) return
      const pos = getRelativePos(e)
      const bounds = overlayRef.current.getBoundingClientRect()
      setRect(normalizeRect(origin.x, origin.y, pos.x, pos.y, bounds.width, bounds.height))
    },
    [dragging, origin, getRelativePos],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (!dragging || !origin || !overlayRef.current) return
      const pos = getRelativePos(e)
      const bounds = overlayRef.current.getBoundingClientRect()
      const r = normalizeRect(origin.x, origin.y, pos.x, pos.y, bounds.width, bounds.height)
      setRect(r)
      setDragging(false)
    },
    [dragging, origin, getRelativePos],
  )

  // Escape → cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const canApply = !!rect && rect.w >= MIN_SIZE && rect.h >= MIN_SIZE

  return (
    <div style={styles.root}>
      {/* Pointer target — covers the full image */}
      <div
        ref={overlayRef}
        style={styles.dragArea}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {rect && (
          <>
            {/* Dark mask: four quadrants around the selection */}
            {/* top */}
            <div
              style={{
                ...styles.mask,
                top: 0,
                left: 0,
                width: '100%',
                height: rect.y,
              }}
            />
            {/* bottom */}
            <div
              style={{
                ...styles.mask,
                top: rect.y + rect.h,
                left: 0,
                width: '100%',
                bottom: 0,
              }}
            />
            {/* left */}
            <div
              style={{
                ...styles.mask,
                top: rect.y,
                left: 0,
                width: rect.x,
                height: rect.h,
              }}
            />
            {/* right */}
            <div
              style={{
                ...styles.mask,
                top: rect.y,
                left: rect.x + rect.w,
                right: 0,
                height: rect.h,
              }}
            />
            {/* Selection border */}
            <div
              style={{
                ...styles.selection,
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
              }}
            />
          </>
        )}
      </div>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <span style={styles.hint}>
          {rect
            ? `${Math.round(rect.w)} × ${Math.round(rect.h)} px — notes outside crop are removed`
            : 'Drag to select a crop region'}
        </span>
        <div style={styles.toolbarActions}>
          <button style={styles.btnCancel} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={{
              ...styles.btnApply,
              opacity: canApply ? 1 : 0.4,
              cursor: canApply ? 'pointer' : 'not-allowed',
            }}
            onClick={canApply ? () => onApply(rect!) : undefined}
          >
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 4,
    overflow: 'hidden',
  },
  dragArea: {
    flex: 1,
    position: 'relative',
    cursor: 'crosshair',
    userSelect: 'none',
  },
  mask: {
    position: 'absolute',
    background: 'rgba(0, 0, 0, 0.50)',
    pointerEvents: 'none',
  },
  selection: {
    position: 'absolute',
    border: '1.5px solid rgba(255,255,255,0.9)',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 12px',
    background: 'rgba(20,20,20,0.88)',
    backdropFilter: 'blur(8px)',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  toolbarActions: {
    display: 'flex',
    gap: 8,
    flexShrink: 0,
  },
  btnCancel: {
    padding: '5px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 500,
  },
  btnApply: {
    padding: '5px 14px',
    borderRadius: 6,
    border: 'none',
    background: '#2979FF',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    transition: 'opacity 0.15s',
  },
}
