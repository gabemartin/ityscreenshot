import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Annotation } from '../types'

interface CanvasProps {
  imageUrl: string | null
  annotations: Annotation[]
  imageRef: React.RefObject<HTMLImageElement>
  onImageClick: (x: number, y: number) => void
}

export default function Canvas({
  imageUrl,
  annotations: _annotations,
  imageRef,
  onImageClick,
}: CanvasProps): React.ReactElement {
  const localRef = useRef<HTMLImageElement>(null)
  // Use the forwarded ref if provided, otherwise fall back to local ref
  const imgRef = imageRef ?? localRef
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null)

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
        <p style={styles.emptyText}>Press ⌘V to paste a screenshot</p>
        <p style={styles.emptyHint}>or copy an image and paste it here</p>
      </div>
    )
  }

  // imgSize is tracked so the effect dependencies are satisfied; unused in render
  void imgSize

  return (
    <div style={styles.canvasWrapper}>
      {/* Image */}
      <div style={styles.imageContainer}>
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Screenshot"
          style={styles.image}
          onClick={handleClick}
          onLoad={updateSize}
          draggable={false}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  canvasWrapper: {
    flex: 1,
    background: 'var(--color-bg-canvas)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
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
    maxHeight: '100%',
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
}
