import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Grip, Loader2, PackagePlus } from 'lucide-react'
import {
  Annotation,
  BoxRect,
  CanvasImage,
  CanvasTool,
  DropZone,
  LayoutRow,
  PlacedArrow,
  PlacedShape,
  ShapeKind,
} from '../types'
import ImageCropOverlay, { CropRect } from './ImageCropOverlay'
import BoxLayer from './BoxLayer'
import ArrowLayer from './ArrowLayer'
import ShapeLayer from './ShapeLayer'

interface CanvasProps {
  images: CanvasImage[]
  rows: LayoutRow[]
  annotations: Annotation[]
  onImageElRef: (imageId: string, el: HTMLImageElement | null) => void
  onImageClick: (imageId: string, x: number, y: number) => void
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
  canvasTool: CanvasTool
  placedArrows: PlacedArrow[]
  selectedArrowId: string | null
  onSelectArrow: (id: string | null) => void
  onCreateArrow: (imageId: string, start: { x: number; y: number }, end: { x: number; y: number }) => void
  onUpdateArrow: (id: string, start: { x: number; y: number }, end: { x: number; y: number }) => void
  onArrowColorChange: (id: string, color: string) => void
  onArrowThicknessChange: (id: string, thickness: number) => void
  onDeleteArrow: (id: string) => void
  placedShapes: PlacedShape[]
  selectedShapeId: string | null
  onSelectShape: (id: string | null) => void
  onCreateShape: (imageId: string, kind: ShapeKind, rect: BoxRect) => void
  onUpdateShapeRect: (id: string, rect: BoxRect) => void
  onShapeColorChange: (id: string, color: string) => void
  onShapeThicknessChange: (id: string, thickness: number) => void
  onDeleteShape: (id: string) => void
  onResizeColumns: (rowId: string, leftIndex: number, leftFr: number, rightFr: number) => void
  onResizeRow: (rowId: string, scale: number) => void
  dropZonesActive: boolean
  activeDropZone: DropZone | null
  onDropZoneChange: (zone: DropZone | null) => void
  onWrapperScroll: () => void
}

const MIN_COLUMN_FR = 0.15
// Divider snaps to the equal-height split when within this many pixels of it
const SNAP_PX = 12
// Smallest row width fraction reachable via vertical resize
const MIN_ROW_SCALE = 0.2

export default function Canvas({
  images,
  rows,
  annotations,
  onImageElRef,
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
  canvasTool,
  placedArrows,
  selectedArrowId,
  onSelectArrow,
  onCreateArrow,
  onUpdateArrow,
  onArrowColorChange,
  onArrowThicknessChange,
  onDeleteArrow,
  placedShapes,
  selectedShapeId,
  onSelectShape,
  onCreateShape,
  onUpdateShapeRect,
  onShapeColorChange,
  onShapeThicknessChange,
  onDeleteShape,
  onResizeColumns,
  onResizeRow,
  dropZonesActive,
  activeDropZone,
  onDropZoneChange,
  onWrapperScroll,
}: CanvasProps): React.ReactElement {
  const isSingle = images.length === 1
  const [isHovered, setIsHovered] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // ── Column resize ─────────────────────────────────────────────────────────
  const rowElsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const resizeRef = useRef<{
    rowId: string
    leftIndex: number
    startX: number
    rowWidth: number
    leftFr: number
    rightFr: number
    /** Left fraction at which both images render at equal height (snap target) */
    eqLeftFr: number | null
  } | null>(null)

  const handleRowRef = useCallback((rowId: string, el: HTMLDivElement | null) => {
    if (el) rowElsRef.current.set(rowId, el)
    else rowElsRef.current.delete(rowId)
  }, [])

  const startColumnResize = useCallback(
    (e: React.MouseEvent, rowId: string, leftIndex: number): void => {
      e.preventDefault()
      e.stopPropagation()
      const rowEl = rowElsRef.current.get(rowId)
      const row = rows.find((r) => r.id === rowId)
      if (!rowEl || !row) return
      const left = row.cells[leftIndex]
      const right = row.cells[leftIndex + 1]
      if (!left || !right) return
      // Equal-height snap target: heights match when widths are proportional
      // to the images' aspect ratios (w/h), since each image fills its cell.
      const imgs = rowEl.querySelectorAll('img')
      const leftImg = imgs[leftIndex] as HTMLImageElement | undefined
      const rightImg = imgs[leftIndex + 1] as HTMLImageElement | undefined
      let eqLeftFr: number | null = null
      if (
        leftImg?.naturalWidth && leftImg.naturalHeight &&
        rightImg?.naturalWidth && rightImg.naturalHeight
      ) {
        const aL = leftImg.naturalWidth / leftImg.naturalHeight
        const aR = rightImg.naturalWidth / rightImg.naturalHeight
        eqLeftFr = (left.widthFr + right.widthFr) * (aL / (aL + aR))
      }
      resizeRef.current = {
        rowId,
        leftIndex,
        startX: e.clientX,
        rowWidth: rowEl.getBoundingClientRect().width,
        leftFr: left.widthFr,
        rightFr: right.widthFr,
        eqLeftFr,
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [rows],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const d = resizeRef.current
      if (!d || d.rowWidth <= 0) return
      const pair = d.leftFr + d.rightFr
      const minFr = Math.min(MIN_COLUMN_FR, pair * 0.2)
      const deltaFr = (e.clientX - d.startX) / d.rowWidth
      let leftFr = Math.max(minFr, Math.min(pair - minFr, d.leftFr + deltaFr))
      if (
        d.eqLeftFr !== null &&
        Math.abs(leftFr - d.eqLeftFr) * d.rowWidth < SNAP_PX
      ) {
        leftFr = Math.max(minFr, Math.min(pair - minFr, d.eqLeftFr))
      }
      onResizeColumns(d.rowId, d.leftIndex, leftFr, pair - leftFr)
    }
    const onUp = (): void => {
      if (!resizeRef.current) return
      resizeRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onResizeColumns])

  // ── Row resize (vertical): dragging the handle under a row scales the whole
  // row's width, which scales its images' heights proportionally. ────────────
  const rowResizeRef = useRef<{
    rowId: string
    startY: number
    startHeight: number
    startScale: number
  } | null>(null)

  const startRowResize = useCallback(
    (e: React.MouseEvent, rowId: string): void => {
      e.preventDefault()
      e.stopPropagation()
      const rowEl = rowElsRef.current.get(rowId)
      const row = rows.find((r) => r.id === rowId)
      if (!rowEl || !row) return
      const height = rowEl.getBoundingClientRect().height
      if (height <= 0) return
      rowResizeRef.current = {
        rowId,
        startY: e.clientY,
        startHeight: height,
        startScale: row.scale ?? 1,
      }
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [rows],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const d = rowResizeRef.current
      if (!d) return
      const factor = (d.startHeight + (e.clientY - d.startY)) / d.startHeight
      const scale = Math.max(MIN_ROW_SCALE, Math.min(1, d.startScale * factor))
      onResizeRow(d.rowId, scale)
    }
    const onUp = (): void => {
      if (!rowResizeRef.current) return
      rowResizeRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onResizeRow])

  // ── Drop zones (add to a row's right / add below) ─────────────────────────
  const handleZoneDragOver = useCallback(
    (e: React.DragEvent): void => {
      const el = wrapperRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const rightW = Math.min(160, r.width * 0.22)
      const bottomH = Math.min(120, r.height * 0.22)
      let zone: DropZone | null = null
      if (e.clientX >= r.right - rightW) {
        // Right strip: resolve which row the cursor is vertically inside
        for (const row of rows) {
          const rowEl = rowElsRef.current.get(row.id)
          if (!rowEl) continue
          const rr = rowEl.getBoundingClientRect()
          if (e.clientY >= rr.top && e.clientY <= rr.bottom) {
            zone = `row:${row.id}`
            break
          }
        }
      }
      if (!zone && e.clientY >= r.bottom - bottomH) zone = 'bottom'
      onDropZoneChange(zone)
    },
    [onDropZoneChange, rows],
  )

  const handleZoneDragLeave = useCallback((): void => {
    onDropZoneChange(null)
  }, [onDropZoneChange])

  const shapeKind: ShapeKind | null =
    canvasTool === 'square' ? 'square' : canvasTool === 'circle' ? 'circle' : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onSelectAnnotation(null)
        onSelectArrow(null)
        onSelectShape(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return (): void => window.removeEventListener('keydown', onKey)
  }, [onSelectAnnotation, onSelectArrow, onSelectShape])

  if (images.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>⌘V</div>
        <p style={styles.emptyText}>Paste or drop an image to get started</p>
        <p style={styles.emptyHint}>Press ⌘V, or drag an image file anywhere into this window</p>
      </div>
    )
  }

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
  const imageById = new Map(images.map((im) => [im.id, im]))

  // Per-row right-drop strips, positioned to each row's vertical extent.
  // Computed only while a file drag is in progress; rects are stable during a drag.
  const rowZones: Array<{ rowId: string; top: number; height: number }> = dropZonesActive
    ? rows.flatMap((row) => {
        const rowEl = rowElsRef.current.get(row.id)
        const wrapper = wrapperRef.current
        if (!rowEl || !wrapper) return []
        const wr = wrapper.getBoundingClientRect()
        const rr = rowEl.getBoundingClientRect()
        return [
          {
            rowId: row.id,
            top: rr.top - wr.top + wrapper.scrollTop,
            height: rr.height,
          },
        ]
      })
    : []

  return (
    <div
      ref={wrapperRef}
      onScroll={onWrapperScroll}
      style={{
        ...styles.canvasWrapper,
        ...(isSingle ? {} : styles.canvasWrapperMulti),
      }}
    >
      <div
        style={{
          ...styles.gridContainer,
          ...(isSingle ? {} : styles.gridContainerMulti),
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseDown={() => {
          if (canvasTool === 'note') onDeselectMarker()
        }}
      >
        {rows.map((row) => (
          <React.Fragment key={row.id}>
          <div
            ref={(el): void => handleRowRef(row.id, el)}
            style={{
              ...styles.row,
              ...(isSingle ? {} : { width: `${(row.scale ?? 1) * 100}%` }),
            }}
          >
            {row.cells.map((cell, i) => {
              const image = imageById.get(cell.imageId)
              if (!image) return null
              return (
                <React.Fragment key={cell.imageId}>
                  {i > 0 && (
                    <ColumnDivider
                      onMouseDown={(e): void => startColumnResize(e, row.id, i - 1)}
                    />
                  )}
                  <GridCell
                    image={image}
                    widthFr={cell.widthFr}
                    isSingle={isSingle}
                    cropMode={cropMode}
                    canvasTool={canvasTool}
                    shapeKind={shapeKind}
                    annotations={annotations.filter((a) => (a.imageId ?? images[0].id) === cell.imageId)}
                    arrows={placedArrows.filter((a) => (a.imageId ?? images[0].id) === cell.imageId)}
                    shapes={placedShapes.filter((s) => (s.imageId ?? images[0].id) === cell.imageId)}
                    onImageElRef={onImageElRef}
                    onImageClick={onImageClick}
                    onDeselectMarker={onDeselectMarker}
                    onApplyCrop={onApplyCrop}
                    onCancelCrop={onCancelCrop}
                    selectedAnnotationId={selectedAnnotationId}
                    onSelectAnnotation={onSelectAnnotation}
                    onUpdateAnnotationRect={onUpdateAnnotationRect}
                    onAnnotationColorChange={onAnnotationColorChange}
                    onConvertToDot={onConvertToDot}
                    selectedArrowId={selectedArrowId}
                    onSelectArrow={onSelectArrow}
                    onCreateArrow={onCreateArrow}
                    onUpdateArrow={onUpdateArrow}
                    onArrowColorChange={onArrowColorChange}
                    onArrowThicknessChange={onArrowThicknessChange}
                    onDeleteArrow={onDeleteArrow}
                    selectedShapeId={selectedShapeId}
                    onSelectShape={onSelectShape}
                    onCreateShape={onCreateShape}
                    onUpdateShapeRect={onUpdateShapeRect}
                    onShapeColorChange={onShapeColorChange}
                    onShapeThicknessChange={onShapeThicknessChange}
                    onDeleteShape={onDeleteShape}
                  />
                </React.Fragment>
              )
            })}
          </div>
          {!isSingle && (
            <RowDivider
              width={`${(row.scale ?? 1) * 100}%`}
              onMouseDown={(e): void => startRowResize(e, row.id)}
            />
          )}
          </React.Fragment>
        ))}

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

      {dropZonesActive && (
        <div
          style={styles.zoneOverlay}
          onDragOver={handleZoneDragOver}
          onDragLeave={handleZoneDragLeave}
        >
          {rowZones.map((z) => (
            <div
              key={z.rowId}
              style={{
                ...styles.zoneRight,
                top: z.top,
                height: z.height,
                ...(activeDropZone === `row:${z.rowId}` ? styles.zoneActive : {}),
              }}
            >
              <span style={styles.zoneLabel}>Add to right</span>
            </div>
          ))}
          <div
            style={{
              ...styles.zoneBottom,
              ...(activeDropZone === 'bottom' ? styles.zoneActive : {}),
            }}
          >
            <span style={styles.zoneLabel}>Add below</span>
          </div>
          {activeDropZone === null && (
            <div style={styles.zoneReplaceHint}>Drop to replace</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Column divider ───────────────────────────────────────────────────────────

function ColumnDivider({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void
}): React.ReactElement {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={styles.divider}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag to resize columns"
    >
      <div
        style={{
          ...styles.dividerLine,
          background: hover ? '#2979FF' : 'rgba(127,127,127,0.4)',
          width: hover ? 4 : 2,
        }}
      />
      <div
        style={{
          ...styles.dividerGrip,
          opacity: hover ? 1 : 0.65,
          background: hover ? '#2979FF' : 'rgba(40,40,40,0.85)',
        }}
      >
        <Grip size={10} strokeWidth={2} color="#fff" />
      </div>
    </div>
  )
}

// ─── Row divider (vertical resize) ────────────────────────────────────────────

function RowDivider({
  width,
  onMouseDown,
}: {
  width: string
  onMouseDown: (e: React.MouseEvent) => void
}): React.ReactElement {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{ ...styles.rowDivider, width }}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag to resize row"
    >
      <div
        style={{
          ...styles.rowDividerLine,
          background: hover ? '#2979FF' : 'rgba(127,127,127,0.4)',
          height: hover ? 4 : 2,
        }}
      />
      <div
        style={{
          ...styles.rowDividerGrip,
          opacity: hover ? 1 : 0.65,
          background: hover ? '#2979FF' : 'rgba(40,40,40,0.85)',
        }}
      >
        <Grip size={10} strokeWidth={2} color="#fff" />
      </div>
    </div>
  )
}

// ─── Grid cell (one image + its overlay layers) ───────────────────────────────

interface GridCellProps {
  image: CanvasImage
  widthFr: number
  isSingle: boolean
  cropMode: 'idle' | 'active'
  canvasTool: CanvasTool
  shapeKind: ShapeKind | null
  annotations: Annotation[]
  arrows: PlacedArrow[]
  shapes: PlacedShape[]
  onImageElRef: (imageId: string, el: HTMLImageElement | null) => void
  onImageClick: (imageId: string, x: number, y: number) => void
  onDeselectMarker: () => void
  onApplyCrop: (rect: CropRect) => void
  onCancelCrop: () => void
  selectedAnnotationId: string | null
  onSelectAnnotation: (id: string | null) => void
  onUpdateAnnotationRect: (id: string, rect: BoxRect) => void
  onAnnotationColorChange: (id: string, color: string) => void
  onConvertToDot: (id: string) => void
  selectedArrowId: string | null
  onSelectArrow: (id: string | null) => void
  onCreateArrow: (imageId: string, start: { x: number; y: number }, end: { x: number; y: number }) => void
  onUpdateArrow: (id: string, start: { x: number; y: number }, end: { x: number; y: number }) => void
  onArrowColorChange: (id: string, color: string) => void
  onArrowThicknessChange: (id: string, thickness: number) => void
  onDeleteArrow: (id: string) => void
  selectedShapeId: string | null
  onSelectShape: (id: string | null) => void
  onCreateShape: (imageId: string, kind: ShapeKind, rect: BoxRect) => void
  onUpdateShapeRect: (id: string, rect: BoxRect) => void
  onShapeColorChange: (id: string, color: string) => void
  onShapeThicknessChange: (id: string, thickness: number) => void
  onDeleteShape: (id: string) => void
}

function GridCell({
  image,
  widthFr,
  isSingle,
  cropMode,
  canvasTool,
  shapeKind,
  annotations,
  arrows,
  shapes,
  onImageElRef,
  onImageClick,
  onDeselectMarker,
  onApplyCrop,
  onCancelCrop,
  selectedAnnotationId,
  onSelectAnnotation,
  onUpdateAnnotationRect,
  onAnnotationColorChange,
  onConvertToDot,
  selectedArrowId,
  onSelectArrow,
  onCreateArrow,
  onUpdateArrow,
  onArrowColorChange,
  onArrowThicknessChange,
  onDeleteArrow,
  selectedShapeId,
  onSelectShape,
  onCreateShape,
  onUpdateShapeRect,
  onShapeColorChange,
  onShapeThicknessChange,
  onDeleteShape,
}: GridCellProps): React.ReactElement {
  const imgElRef = useRef<HTMLImageElement | null>(null)

  const refCb = useCallback(
    (el: HTMLImageElement | null): void => {
      imgElRef.current = el
      onImageElRef(image.id, el)
    },
    [image.id, onImageElRef],
  )

  const handleClick = (e: React.MouseEvent<HTMLImageElement>): void => {
    if (cropMode === 'active' || canvasTool === 'arrow' || shapeKind) return
    onDeselectMarker()
    onSelectArrow(null)
    onSelectShape(null)
    const el = imgElRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    onImageClick(image.id, Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)))
  }

  const handleCreateArrow = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }): void =>
      onCreateArrow(image.id, start, end),
    [image.id, onCreateArrow],
  )

  const handleCreateShape = useCallback(
    (kind: ShapeKind, rect: BoxRect): void => onCreateShape(image.id, kind, rect),
    [image.id, onCreateShape],
  )

  return (
    <div
      style={{
        ...styles.cell,
        ...(isSingle ? {} : { flexGrow: widthFr, flexBasis: 0, minWidth: 0 }),
      }}
    >
      <img
        ref={refCb}
        src={image.dataUrl}
        alt="Screenshot"
        style={isSingle ? styles.imageSingle : styles.imageCell}
        onClick={handleClick}
        draggable={false}
      />

      {cropMode === 'idle' && (
        <>
          <BoxLayer
            annotations={annotations}
            selectedId={canvasTool === 'note' ? selectedAnnotationId : null}
            onSelect={onSelectAnnotation}
            onUpdateRect={onUpdateAnnotationRect}
            onColorChange={onAnnotationColorChange}
            onConvertToDot={onConvertToDot}
            imgRef={imgElRef}
            interactive={canvasTool === 'note'}
          />
          <ShapeLayer
            shapes={shapes}
            selectedId={selectedShapeId}
            activeKind={shapeKind}
            imgRef={imgElRef}
            onSelect={onSelectShape}
            onCreate={handleCreateShape}
            onUpdateRect={onUpdateShapeRect}
            onColorChange={onShapeColorChange}
            onThicknessChange={onShapeThicknessChange}
            onDelete={onDeleteShape}
          />
          <ArrowLayer
            arrows={arrows}
            selectedId={selectedArrowId}
            active={canvasTool === 'arrow'}
            imgRef={imgElRef}
            onSelect={onSelectArrow}
            onCreate={handleCreateArrow}
            onUpdate={onUpdateArrow}
            onColorChange={onArrowColorChange}
            onThicknessChange={onArrowThicknessChange}
            onDelete={onDeleteArrow}
          />
        </>
      )}

      {cropMode === 'active' && isSingle && (
        <ImageCropOverlay onApply={onApplyCrop} onCancel={onCancelCrop} />
      )}
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
  canvasWrapperMulti: {
    alignItems: 'flex-start',
    overflowY: 'auto',
  },
  gridContainer: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
    borderRadius: 4,
    overflow: 'visible',
    lineHeight: 0,
  },
  gridContainerMulti: {
    width: '100%',
    boxShadow: 'none',
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  cell: {
    position: 'relative',
    lineHeight: 0,
  },
  imageSingle: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: 'calc(100vh - var(--topbar-height) - 48px)',
    cursor: 'crosshair',
    borderRadius: 4,
    userSelect: 'none',
  },
  imageCell: {
    display: 'block',
    width: '100%',
    height: 'auto',
    cursor: 'crosshair',
    borderRadius: 4,
    userSelect: 'none',
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
  },
  divider: {
    width: 8,
    flexShrink: 0,
    alignSelf: 'stretch',
    position: 'relative',
    cursor: 'col-resize',
    zIndex: 6,
  },
  dividerLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    borderRadius: 2,
    transition: 'background 0.12s, width 0.12s',
  },
  dividerGrip: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 16,
    height: 30,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
    transition: 'opacity 0.12s, background 0.12s',
    pointerEvents: 'none',
  },
  rowDivider: {
    height: 8,
    flexShrink: 0,
    position: 'relative',
    cursor: 'row-resize',
    zIndex: 6,
  },
  rowDividerLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    borderRadius: 2,
    transition: 'background 0.12s, height 0.12s',
  },
  rowDividerGrip: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 30,
    height: 16,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
    transition: 'opacity 0.12s, background 0.12s',
    pointerEvents: 'none',
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
  zoneOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 40,
    background: 'rgba(0,0,0,0.18)',
  },
  zoneRight: {
    position: 'absolute',
    right: 12,
    width: 'min(22%, 148px)',
    minHeight: 48,
    borderRadius: 10,
    border: '2px dashed rgba(255,255,255,0.45)',
    background: 'rgba(0,0,0,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    transition: 'background 0.12s, border-color 0.12s',
  },
  zoneBottom: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    right: 'calc(min(22%, 148px) + 24px)',
    height: 'min(22%, 110px)',
    borderRadius: 10,
    border: '2px dashed rgba(255,255,255,0.45)',
    background: 'rgba(0,0,0,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    transition: 'background 0.12s, border-color 0.12s',
  },
  zoneActive: {
    border: '2px dashed rgba(255,255,255,0.95)',
    background: 'rgba(41,121,255,0.35)',
  },
  zoneLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    letterSpacing: 0.2,
    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    lineHeight: 1.3,
    textAlign: 'center',
    padding: '0 8px',
  },
  zoneReplaceHint: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    padding: '8px 18px',
    borderRadius: 8,
    pointerEvents: 'none',
    lineHeight: 1.3,
  },
}
