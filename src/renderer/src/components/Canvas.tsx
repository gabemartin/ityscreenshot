import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Grip } from 'lucide-react'
import { Annotation } from '../types'

interface CanvasProps {
  imageUrl: string | null
  annotations: Annotation[]
  imageRef: React.RefObject<HTMLImageElement>
  onImageClick: (x: number, y: number) => void
  isDragReady: boolean
}

export default function Canvas({
  imageUrl,
  annotations: _annotations,
  imageRef,
  onImageClick,
  isDragReady,
}: CanvasProps): React.ReactElement {
  const localRef = useRef<HTMLImageElement>(null)
  // Use the forwarded ref if provided, otherwise fall back to local ref
  const imgRef = imageRef ?? localRef
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null)
  const [isHovered, setIsHovered] = useState(false)

  // Track rendered image dimensions (changes on resize)
  const updateSize = useCallback(() => {
    const el = imgRef.current
    if (!el) return
    setImgSize({ width: el.offsetWidth, height: el.offsetHeight })
  }, [imgRef])

  useEffect(() => {
    const observer = new ResizeObserver(updateSize)
    if (imgRef.current) {
      observer.observe(imgRef.current)
      updateSize()
    }
    return () => observer.disconnect()
  }, [imageUrl, updateSize, imgRef])

  const handleClick = (e: React.MouseEvent<HTMLImageElement>): void => {
    const el = imgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    // Clamp to [0, 1]
    onImageClick(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)))
  }

  if (!imageUrl) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>⌘V</div>
        <p style={styles.emptyText}>Paste or drop an image to get started</p>
        <p style={styles.emptyHint}>Press ⌘V, or drag an image file anywhere into this window</p>
      </div>
    )
  }

  // imgSize is tracked so the effect dependencies are satisfied; unused in render
  void imgSize

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    window.electronAPI.dragOut()
  }

  return (
    <div style={styles.canvasWrapper}>
      {/* Image */}
      <div
        style={styles.imageContainer}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Screenshot"
          style={styles.image}
          onClick={handleClick}
          onLoad={updateSize}
          draggable={false}
        />

        {/* Drag-out handle — shown on hover when temp file is ready */}
        {isDragReady && (
          <div
            draggable
            onDragStart={handleDragStart}
            style={{
              ...styles.dragHandle,
              opacity: isHovered ? 1 : 0,
            }}
            title="Drag to another app"
          >
            <Grip size={15} strokeWidth={2} />
          </div>
        )}
      </div>
    </div>
  )
}


const styles: Record<string, React.CSSProperties> = {
  canvasWrapper: {
    flex: 1,
    minHeight: 0,
    background: 'var(--color-bg-canvas)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: 24,
    position: 'relative',
  },
  imageContainer: {
    position: 'relative',
    display: 'inline-block',
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
    borderRadius: 4,
    overflow: 'visible',
    lineHeight: 0,
  },
  image: {
    display: 'block',
    maxWidth: '100%',
    // 44px topbar + 48px wrapper padding (24px top + 24px bottom)
    maxHeight: 'calc(100vh - var(--topbar-height) - 48px)',
    cursor: 'crosshair',
    borderRadius: 4,
    userSelect: 'none',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: 'var(--color-bg-canvas)',
    userSelect: 'none',
  },
  emptyIcon: {
    fontSize: 36,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    background: '#e8e8e8',
    borderRadius: 10,
    padding: '8px 14px',
    letterSpacing: '-1px',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginTop: 8,
  },
  emptyHint: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
  },
  dragHandle: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 6,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    color: 'rgba(255,255,255,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    transition: 'opacity 0.15s ease',
    zIndex: 5,
    userSelect: 'none',
  },
}
