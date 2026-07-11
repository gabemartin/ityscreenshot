import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Grip, Loader2, PackagePlus } from 'lucide-react'
import { Annotation, BoxRect } from '../types'
import ImageCropOverlay, { CropRect } from './ImageCropOverlay'
import BoxLayer from './BoxLayer'

interface CanvasProps {
  imageUrl: string | null
  annotations: Annotation[]
  imageRef: React.RefObject<HTMLImageElement>
  onImageClick: (x: number, y: number) => void
  onDeselectMarker: () => void
  isDragReady: boolean
  projectDragState: 'idle' | 'building' | 'ready'
  onBuildProjectBundleForDrag: () => void
  cropMode: 'idle' | 'active'
  onApplyCrop: (rect: CropRect) => void
  onCancelCrop: () => void
  selectedAnnotationId: string | null
  onSelectAnnotation: (id: string | null) => void
  onUpdateAnnotationRect: (id: string, rect: BoxRect) => void
  onAnnotationColorChange: (id: string, color: string) => void
  onConvertToDot: (id: string) => void
}

export default function Canvas({
  imageUrl,
  annotations,
  imageRef,
  onImageClick,
  onDeselectMarker,
  isDragReady,
  projectDragState,
  onBuildProjectBundleForDrag,
  cropMode,
  onApplyCrop,
  onCancelCrop,
  selectedAnnotationId,
  onSelectAnnotation,
  onUpdateAnnotationRect,
  onAnnotationColorChange,
  onConvertToDot,
}: CanvasProps): React.ReactElement {
  const localRef = useRef<HTMLImageElement>(null)
  const imgRef = imageRef ?? localRef
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null)
  const [isHovered, setIsHovered] = useState(false)

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
    if (cropMode === 'active') return
    onDeselectMarker()
    const el = imgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    onImageClick(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onSelectAnnotation(null)
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [onSelectAnnotation])

  if (!imageUrl) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>⌘V</div>
        <p style={styles.emptyText}>Paste or drop an image to get started</p>
        <p style={styles.emptyHint}>Press ⌘V, or drag an image file anywhere into this window</p>
      </div>
    )
  }

  void imgSize

  const handlePngDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    window.electronAPI.dragOut()
  }

  const handleProjectDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    if (typeof window.electronAPI.dragOutProject !== 'function') return
    window.electronAPI.dragOutProject()
  }

  const overlayVisible = isHovered || projectDragState === 'building'

  return (
    <div style={styles.canvasWrapper}>
      <div
        style={styles.imageContainer}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseDown={() => onDeselectMarker()}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Screenshot"
          style={{ ...styles.image, cursor: cropMode === 'active' ? 'default' : 'crosshair' }}
          onClick={handleClick}
          onLoad={updateSize}
          draggable={false}
        />

        {cropMode === 'idle' && (
          <BoxLayer
            annotations={annotations}
            selectedId={selectedAnnotationId}
            onSelect={onSelectAnnotation}
            onUpdateRect={onUpdateAnnotationRect}
            onColorChange={onAnnotationColorChange}
            onConvertToDot={onConvertToDot}
            imgRef={imgRef}
          />
        )}

        {cropMode === 'active' && (
          <ImageCropOverlay onApply={onApplyCrop} onCancel={onCancelCrop} />
        )}

        {projectDragState === 'building' ? (
          <div
            style={{
              ...styles.dragHandle,
              ...styles.dragHandleBundle,
              opacity: overlayVisible ? 1 : 0,
              cursor: 'default',
            }}
            title="Building project bundle…"
          >
            <Loader2 size={15} strokeWidth={2} className="canvas-bundle-building" />
          </div>
        ) : projectDragState === 'ready' ? (
          <div
            draggable
            onDragStart={handleProjectDragStart}
            style={{
              ...styles.dragHandle,
              ...styles.dragHandleBundle,
              opacity: overlayVisible ? 1 : 0,
            }}
            title="Drag project bundle (.zip) to another app"
          >
            <Grip size={15} strokeWidth={2} />
          </div>
        ) : (
          <div
            style={{
              ...styles.dragHandle,
              ...styles.dragHandleBundle,
              opacity: overlayVisible ? 1 : 0,
              cursor: 'pointer',
            }}
            title="Build project bundle for drag-out"
          >
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation()
                onBuildProjectBundleForDrag()
              }}
              style={styles.bundleBuildBtn}
              aria-label="Build project bundle for drag-out"
            >
              <PackagePlus size={15} strokeWidth={2} />
            </button>
          </div>
        )}

        {isDragReady && (
          <div
            draggable
            onDragStart={handlePngDragStart}
            style={{
              ...styles.dragHandle,
              opacity: overlayVisible ? 1 : 0,
            }}
            title="Drag screenshot to another app"
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
  dragHandleBundle: {
    right: 42,
    zIndex: 6,
  },
  bundleBuildBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    padding: 0,
    margin: 0,
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    borderRadius: 6,
  },
}
