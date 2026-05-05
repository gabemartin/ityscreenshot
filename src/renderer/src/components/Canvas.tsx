import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Grip, Loader2, PackagePlus, Square, Crosshair } from 'lucide-react'
import { Annotation, BoxAnnotation, BoxRect } from '../types'
import ImageCropOverlay, { CropRect } from './ImageCropOverlay'
import BoxLayer from './BoxLayer'

interface CanvasProps {
  imageUrl: string | null
  annotations: Annotation[]
  imageRef: React.RefObject<HTMLImageElement>
  onImageClick: (x: number, y: number) => void
  isDragReady: boolean
  projectDragState: 'idle' | 'building' | 'ready'
  onBuildProjectBundleForDrag: () => void
  cropMode: 'idle' | 'active'
  onApplyCrop: (rect: CropRect) => void
  onCancelCrop: () => void
  // Box drawing
  boxes: BoxAnnotation[]
  drawMode: 'annotate' | 'box'
  nextBoxColor: string
  onDrawModeChange: (mode: 'annotate' | 'box') => void
  onAddBox: (box: BoxAnnotation) => void
  onUpdateBox: (id: string, rect: BoxRect) => void
  onDeleteBox: (id: string) => void
  onBoxColorChange: (id: string, color: string) => void
}

export default function Canvas({
  imageUrl,
  annotations: _annotations,
  imageRef,
  onImageClick,
  isDragReady,
  projectDragState,
  onBuildProjectBundleForDrag,
  cropMode,
  onApplyCrop,
  onCancelCrop,
  boxes,
  drawMode,
  nextBoxColor,
  onDrawModeChange,
  onAddBox,
  onUpdateBox,
  onDeleteBox,
  onBoxColorChange,
}: CanvasProps): React.ReactElement {
  const localRef = useRef<HTMLImageElement>(null)
  const imgRef = imageRef ?? localRef
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null)
  const [isHovered, setIsHovered] = useState(false)

  // Selected box and draft box for drawing
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)
  const [draftBox, setDraftBox] = useState<BoxRect | null>(null)

  // Refs for the active drawing gesture
  const drawingRef = useRef<{ startX: number; startY: number; imgRect: DOMRect } | null>(null)
  const draftRectRef = useRef<BoxRect | null>(null)

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

  // Deselect box when switching away from box mode
  useEffect(() => {
    if (drawMode !== 'box') setSelectedBoxId(null)
  }, [drawMode])

  const handleClick = (e: React.MouseEvent<HTMLImageElement>): void => {
    if (cropMode === 'active') return
    // In box mode: clicks on empty space only deselect (drawing uses mousedown)
    if (drawMode !== 'annotate') return
    const el = imgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    onImageClick(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)))
  }

  // ── Box drawing ───────────────────────────────────────────────────────────

  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (drawMode !== 'box') return
      if (cropMode === 'active') return
      const img = imgRef.current
      if (!img) return
      const r = img.getBoundingClientRect()
      const fracX = (e.clientX - r.left) / r.width
      const fracY = (e.clientY - r.top) / r.height
      drawingRef.current = { startX: fracX, startY: fracY, imgRect: r }
      draftRectRef.current = { x: fracX, y: fracY, w: 0, h: 0 }
      setDraftBox({ x: fracX, y: fracY, w: 0, h: 0 })
      document.body.style.userSelect = 'none'
    },
    [drawMode, cropMode, imgRef],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const d = drawingRef.current
      if (!d) return
      const { startX, startY, imgRect: r } = d
      const curX = (e.clientX - r.left) / r.width
      const curY = (e.clientY - r.top) / r.height
      const x = Math.max(0, Math.min(1, Math.min(startX, curX)))
      const y = Math.max(0, Math.min(1, Math.min(startY, curY)))
      const w = Math.min(Math.abs(curX - startX), 1 - x)
      const h = Math.min(Math.abs(curY - startY), 1 - y)
      const rect: BoxRect = { x, y, w, h }
      draftRectRef.current = rect
      setDraftBox(rect)
    }

    const onUp = (): void => {
      if (!drawingRef.current) return
      drawingRef.current = null
      const finalRect = draftRectRef.current
      draftRectRef.current = null
      setDraftBox(null)
      document.body.style.userSelect = ''

      if (finalRect && finalRect.w > 0.01 && finalRect.h > 0.01) {
        const newId = `box_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        onAddBox({ id: newId, rect: finalRect, color: nextBoxColor })
        setSelectedBoxId(newId)
      } else {
        // Click without meaningful drag → deselect
        setSelectedBoxId(null)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onAddBox, nextBoxColor])

  // Escape: cancel draw or deselect
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (drawingRef.current) {
        drawingRef.current = null
        draftRectRef.current = null
        setDraftBox(null)
        document.body.style.userSelect = ''
      }
      setSelectedBoxId(null)
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [])

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
      {/* Image + overlays */}
      <div
        style={{
          ...styles.imageContainer,
          cursor: drawMode === 'box' && cropMode === 'idle' ? 'crosshair' : undefined,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseDown={handleContainerMouseDown}
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

        {/* Box layer — drawn over the image, under the crop overlay */}
        {cropMode === 'idle' && (
          <BoxLayer
            boxes={boxes}
            draftBox={draftBox}
            draftColor={nextBoxColor}
            selectedBoxId={selectedBoxId}
            onSelect={setSelectedBoxId}
            onUpdate={onUpdateBox}
            onColorChange={onBoxColorChange}
            onDelete={onDeleteBox}
            imgRef={imgRef}
          />
        )}

        {/* Crop overlay — positioned absolutely over the image */}
        {cropMode === 'active' && (
          <ImageCropOverlay onApply={onApplyCrop} onCancel={onCancelCrop} />
        )}

        {/* Project bundle: build icon → loading → drag zip (left of PNG handle) */}
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

        {/* Drag-out PNG — shown on hover when temp file is ready */}
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

      {/* Tool mode toggle — bottom-left of canvas area */}
      <div style={styles.toolPalette}>
        <button
          type="button"
          style={{
            ...styles.toolBtn,
            background: drawMode === 'annotate' ? 'rgba(255,255,255,0.18)' : 'transparent',
            color: drawMode === 'annotate' ? '#fff' : 'rgba(255,255,255,0.45)',
          }}
          onClick={() => onDrawModeChange('annotate')}
          title="Annotate — click image to place notes"
        >
          <Crosshair size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          style={{
            ...styles.toolBtn,
            background: drawMode === 'box' ? 'rgba(255,255,255,0.18)' : 'transparent',
            color: drawMode === 'box' ? '#fff' : 'rgba(255,255,255,0.45)',
          }}
          onClick={() => onDrawModeChange('box')}
          title="Box — drag to draw rectangles"
        >
          <Square size={14} strokeWidth={2} />
        </button>
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
  toolPalette: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    display: 'flex',
    flexDirection: 'row',
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    borderRadius: 8,
    padding: 3,
    gap: 2,
    zIndex: 5,
    userSelect: 'none',
  },
  toolBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'background 0.12s, color 0.12s',
  },
}
