import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Square } from 'lucide-react'
import type { SaveProjectPayload } from '../../preload/index.d.ts'
import { Annotation, BoxRect } from './types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'
import type { CropRect } from './components/ImageCropOverlay'
import { cropImage } from './utils/cropImage'
import { MarkerToolbar, rectCenter } from './components/BoxLayer'

// ─── Drag helpers ─────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ANNOTATION_COLORS = ['#E91E8C', '#2979FF', '#00BFA5', '#FF6D00']

const DEFAULT_BOX_W = 0.12
const DEFAULT_BOX_H = 0.08
const DRAG_THRESHOLD_PX = 5

function getArrowTarget(ann: Annotation): { x: number; y: number } {
  if (ann.rect) {
    return { x: ann.rect.x, y: ann.rect.y + ann.rect.h / 2 }
  }
  return ann.point
}

function pointToRect(point: { x: number; y: number }): BoxRect {
  const w = DEFAULT_BOX_W
  const h = DEFAULT_BOX_H
  return {
    x: clamp01(point.x - w / 2),
    y: clamp01(point.y - h / 2),
    w: Math.min(w, 1),
    h: Math.min(h, 1),
  }
}

function generateId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

interface ProjectOpenResult {
  project: {
    version: number
    annotations: Annotation[]
  }
  sourceImageDataUrl: string
}

function isBundleFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.zip') || lower.endsWith('.speck')
}

function isValidAnnotation(input: unknown): input is Annotation {
  if (typeof input !== 'object' || !input) return false
  const ann = input as Annotation
  const hasValidRect =
    ann.rect === undefined ||
    (typeof ann.rect.x === 'number' &&
      typeof ann.rect.y === 'number' &&
      typeof ann.rect.w === 'number' &&
      typeof ann.rect.h === 'number')
  return (
    typeof ann.id === 'string' &&
    typeof ann.text === 'string' &&
    typeof ann.color === 'string' &&
    typeof ann.point?.x === 'number' &&
    typeof ann.point?.y === 'number' &&
    hasValidRect
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [newestId, setNewestId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle')
  const [cropMode, setCropMode] = useState<'idle' | 'active'>('idle')
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const colorIndexRef = useRef(0)

  // Refs for viewport-level SVG arrow overlay
  const cardElsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const imageRef = useRef<HTMLImageElement>(null)
  // tick forces a re-render whenever card or image layout changes
  const [tick, setTick] = useState(0)

  // ── Marker dragging (dot or box) ─────────────────────────────────────────
  const draggingIdRef = useRef<string | null>(null)
  const dotInteractionRef = useRef<{
    id: string
    startX: number
    startY: number
    dragged: boolean
  } | null>(null)

  const handleSidebarScroll = useCallback(() => setTick((t) => t + 1), [])

  const handleCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardElsRef.current.set(id, el)
    } else {
      cardElsRef.current.delete(id)
    }
    setTick((t) => t + 1)
  }, [])

  const handleDotMouseDown = useCallback((e: React.MouseEvent, id: string): void => {
    e.preventDefault()
    e.stopPropagation()
    dotInteractionRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      dragged: false,
    }
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      const interaction = dotInteractionRef.current
      if (interaction && !interaction.dragged) {
        const dx = e.clientX - interaction.startX
        const dy = e.clientY - interaction.startY
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          interaction.dragged = true
          draggingIdRef.current = interaction.id
          document.body.style.cursor = 'move'
        }
      }

      const id = draggingIdRef.current
      if (!id || !imageRef.current) return
      const rect = imageRef.current.getBoundingClientRect()
      const x = clamp01((e.clientX - rect.left) / rect.width)
      const y = clamp01((e.clientY - rect.top) / rect.height)
      setAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a
          if (a.rect) {
            const cx = x - a.rect.w / 2
            const cy = y - a.rect.h / 2
            const nextRect: BoxRect = {
              x: clamp01(cx),
              y: clamp01(cy),
              w: a.rect.w,
              h: a.rect.h,
            }
            return { ...a, rect: nextRect, point: { x, y } }
          }
          return { ...a, point: { x, y } }
        }),
      )
    }
    const onMouseUp = (): void => {
      const interaction = dotInteractionRef.current
      if (interaction && !interaction.dragged) {
        setSelectedAnnotationId(interaction.id)
      }
      if (interaction || draggingIdRef.current) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      dotInteractionRef.current = null
      draggingIdRef.current = null
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Re-render arrows when the window resizes or the image element resizes.
  // The window listener covers the common case where imageRef.current is null
  // at effect-setup time (first paste), so the ResizeObserver alone would miss it.
  useEffect(() => {
    const bump = (): void => setTick((t) => t + 1)
    window.addEventListener('resize', bump)
    return () => window.removeEventListener('resize', bump)
  }, [])

  useEffect(() => {
    const el = imageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageRef.current])

  // ── Load image (shared by clipboard + drag-and-drop) ────────────────────

  const loadImage = useCallback((dataUrl: string): void => {
    setImageUrl(dataUrl)
    setAnnotations([])
    setNewestId(null)
    setSelectedAnnotationId(null)
    // Persist so the image survives a refresh or restart
    window.electronAPI.saveSessionImage(dataUrl).catch(console.error)
  }, [])

  const loadFromClipboard = useCallback(async (): Promise<void> => {
    try {
      const dataUrl = await window.electronAPI.readClipboardImage()
      if (dataUrl) loadImage(dataUrl)
    } catch (err) {
      console.error('Failed to read clipboard image:', err)
    }
  }, [loadImage])

  // On mount: restore from last session first; fall back to whatever is on the clipboard
  useEffect(() => {
    ;(async (): Promise<void> => {
      try {
        const session = await window.electronAPI.loadSessionImage()
        if (session) {
          setImageUrl(session)
          return
        }
      } catch (err) {
        console.error('Failed to load session image:', err)
      }
      loadFromClipboard()
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Drag-and-drop image into window ─────────────────────────────────────

  const [isDroppingFile, setIsDroppingFile] = useState(false)
  // Counter tracks nested dragenter/dragleave so the overlay stays visible
  // while the cursor moves across child elements inside the root div.
  const dragDepthRef = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    if (Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) {
      dragDepthRef.current++
      setIsDroppingFile(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDroppingFile(false)
  }, [])

  const hydrateFromProject = useCallback((result: ProjectOpenResult): void => {
    if (!result?.sourceImageDataUrl || !Array.isArray(result.project?.annotations)) {
      throw new Error('Invalid project bundle payload')
    }
    const safeAnnotations = result.project.annotations
      .filter(isValidAnnotation)
      .map((ann) => ({
        ...ann,
        point: { x: clamp01(ann.point.x), y: clamp01(ann.point.y) },
      }))

    setImageUrl(result.sourceImageDataUrl)
    setAnnotations(safeAnnotations)
    setNewestId(null)
    colorIndexRef.current = safeAnnotations.length % ANNOTATION_COLORS.length
    setTick((t) => t + 1)
    window.electronAPI.saveSessionImage(result.sourceImageDataUrl).catch(console.error)
  }, [])

  const handleOpenProject = useCallback(async (): Promise<void> => {
    try {
      const result = await window.electronAPI.openProject()
      if (!result) return
      hydrateFromProject(result as ProjectOpenResult)
    } catch (err) {
      console.error('Failed to open project bundle:', err)
      window.alert('Could not open this project bundle.')
    }
  }, [hydrateFromProject])

  const openProjectFromPath = useCallback(async (filePath: string): Promise<void> => {
    try {
      const result = await window.electronAPI.openProjectFromPath(filePath)
      if (!result) return
      hydrateFromProject(result as ProjectOpenResult)
    } catch (err) {
      console.error('Failed to open dropped project bundle:', err)
      window.alert('Could not open the dropped project bundle.')
    }
  }, [hydrateFromProject])

  const handleDrop = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    dragDepthRef.current = 0
    setIsDroppingFile(false)
    const files = Array.from(e.dataTransfer.files)
    const bundleFile = files.find((f) => isBundleFileName(f.name))
    if (bundleFile) {
      const droppedPath = window.electronAPI.getPathForFile(bundleFile)
      if (!droppedPath) {
        window.alert('Unable to access dropped project bundle path.')
        return
      }
      openProjectFromPath(droppedPath)
      return
    }
    const file = files.find((f) => f.type.startsWith('image/'))
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev): void => {
      const result = ev.target?.result
      if (typeof result === 'string') loadImage(result)
    }
    reader.readAsDataURL(file)
  }, [loadImage, openProjectFromPath])

  // Cmd+V keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        // Let normal paste work inside text inputs
        const target = e.target as HTMLElement
        if (
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.isContentEditable
        ) return
        e.preventDefault()
        loadFromClipboard()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [loadFromClipboard])

  // ── Annotation actions ───────────────────────────────────────────────────

  const handleImageClick = useCallback((x: number, y: number): void => {
    const color = ANNOTATION_COLORS[colorIndexRef.current % ANNOTATION_COLORS.length]
    colorIndexRef.current++
    const newAnnotation: Annotation = {
      id: generateId(),
      point: { x, y },
      text: '',
      color,
    }
    setAnnotations((prev) => [...prev, newAnnotation])
    setNewestId(newAnnotation.id)
  }, [])

  const handleAddNote = useCallback((): void => {
    // Add a note at a default position in the center when triggered from sidebar
    handleImageClick(0.5, 0.5)
  }, [handleImageClick])

  const handleChangeText = useCallback((id: string, text: string): void => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)))
  }, [])

  const handleDelete = useCallback((id: string): void => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    setNewestId((prev) => (prev === id ? null : prev))
    setSelectedAnnotationId((prev) => (prev === id ? null : prev))
  }, [])

  const handleDeselectMarker = useCallback((): void => {
    setSelectedAnnotationId(null)
  }, [])

  const handleAnnotationColorChange = useCallback((id: string, color: string): void => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, color } : a)))
  }, [])

  const handleConvertToBox = useCallback((id: string): void => {
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id !== id || a.rect) return a
        const rect = pointToRect(a.point)
        const center = rectCenter(rect)
        return { ...a, rect, point: center }
      }),
    )
    setSelectedAnnotationId(id)
  }, [])

  const handleConvertToDot = useCallback((id: string): void => {
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id !== id || !a.rect) return a
        const center = rectCenter(a.rect)
        const { rect: _rect, ...rest } = a
        return { ...rest, point: center }
      }),
    )
    setSelectedAnnotationId(id)
  }, [])

  const handleUpdateAnnotationRect = useCallback((id: string, rect: BoxRect): void => {
    const center = rectCenter(rect)
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, rect, point: center } : a)),
    )
  }, [])

  const handleDragMove = useCallback((): void => setTick((t) => t + 1), [])

  const handleReorder = useCallback((fromIndex: number, insertBefore: number): void => {
    setAnnotations((prev) => {
      const next = [...prev]
      const [item] = next.splice(fromIndex, 1)
      const targetIndex = insertBefore > fromIndex ? insertBefore - 1 : insertBefore
      next.splice(targetIndex, 0, item)
      return next
    })
    // Bump tick after paint so arrows recalculate from the new card positions
    requestAnimationFrame(() => setTick((t) => t + 1))
  }, [])

  // ── Export actions ───────────────────────────────────────────────────────
  // Capture the actual rendered window (pixel-perfect, full Retina resolution).
  // isExporting hides the sidebar footer before the capture fires.

  const capture = useCallback(async (): Promise<string | null> => {
    setIsExporting(true)
    // Double rAF ensures the DOM has painted with isExporting=true before capture
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const dataUrl = await window.electronAPI.captureContent()
    setIsExporting(false)
    return dataUrl
  }, [])

  // ── Drag-out pre-capture ─────────────────────────────────────────────────
  // Keeps a temp PNG on disk that mirrors the current annotated view.
  // Updated (debounced) whenever the image or annotations change so the file
  // is ready before the user initiates a drag. The canvas receives a boolean
  // so it can show/hide the drag handle accordingly.

  const [isDragReady, setIsDragReady] = useState(false)
  const dragDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!imageUrl) {
      setIsDragReady(false)
      return
    }
    setIsDragReady(false)

    if (dragDebounceRef.current) clearTimeout(dragDebounceRef.current)
    dragDebounceRef.current = setTimeout(async () => {
      // capture() sets isExporting=true, hides the sidebar footer, then captures.
      // This ensures drag-out matches Save/Copy output exactly.
      const dataUrl = await capture()
      if (dataUrl) {
        await window.electronAPI.writeDragTemp(dataUrl)
        setIsDragReady(true)
      }
    }, 400)

    return () => {
      if (dragDebounceRef.current) clearTimeout(dragDebounceRef.current)
    }
  }, [imageUrl, annotations, capture])

  const handleSave = useCallback(async (): Promise<void> => {
    if (!imageUrl) return
    const dataUrl = await capture()
    if (dataUrl) window.electronAPI.saveImage(dataUrl)
  }, [imageUrl, capture])

  const buildSaveProjectPayload = useCallback(async (): Promise<SaveProjectPayload | null> => {
    if (!imageUrl) return null
    const renderedImageDataUrl = await capture()
    const now = new Date().toISOString()
    return {
      project: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        annotations,
        llmMapping: {
          notes: annotations.map((ann, index) => ({
            index: index + 1,
            id: ann.id,
            text: ann.text,
            point: ann.point,
            color: ann.color,
            ...(ann.rect ? { rect: ann.rect } : {}),
          })),
        },
        canvas: imageRef.current
          ? {
              width: imageRef.current.naturalWidth,
              height: imageRef.current.naturalHeight,
            }
          : null,
      },
      sourceImageDataUrl: imageUrl,
      renderedImageDataUrl,
    }
  }, [annotations, capture, imageUrl])

  const handleSaveProject = useCallback(async (): Promise<void> => {
    try {
      const payload = await buildSaveProjectPayload()
      if (!payload) return
      await window.electronAPI.saveProject(payload)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to save project bundle:', err)
      window.alert(`Could not save project bundle.\n\n${msg}`)
    }
  }, [buildSaveProjectPayload])

  const [projectDragState, setProjectDragState] = useState<'idle' | 'building' | 'ready'>('idle')

  useEffect(() => {
    setProjectDragState('idle')
  }, [imageUrl, annotations])

  const handleBuildProjectBundleForDrag = useCallback(async (): Promise<void> => {
    if (typeof window.electronAPI.writeDragProjectTemp !== 'function') {
      window.alert(
        'Project drag needs the latest preload bridge, but this window was started before it loaded.\n\n' +
          'Quit SpecShot completely (menubar tray → Quit), then run `npm run dev` again.'
      )
      return
    }
    try {
      setProjectDragState('building')
      const payload = await buildSaveProjectPayload()
      if (!payload) {
        setProjectDragState('idle')
        return
      }
      await window.electronAPI.writeDragProjectTemp(payload)
      setProjectDragState('ready')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to prepare project bundle for drag:', err)
      window.alert(`Could not build project bundle.\n\n${msg}`)
      setProjectDragState('idle')
    }
  }, [buildSaveProjectPayload])

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!imageUrl) return
    setCopyState('copying')
    const dataUrl = await capture()
    if (dataUrl) {
      await window.electronAPI.writeClipboardImage(dataUrl)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1800)
    } else {
      setCopyState('idle')
    }
  }, [imageUrl, capture])

  // ── Crop ─────────────────────────────────────────────────────────────────

  const handleStartCrop = useCallback((): void => {
    setCropMode('active')
  }, [])

  const handleCancelCrop = useCallback((): void => {
    setCropMode('idle')
  }, [])

  const handleApplyCrop = useCallback(
    async (rect: CropRect): Promise<void> => {
      const img = imageRef.current
      if (!imageUrl || !img) return
      try {
        const displaySize = { width: img.offsetWidth, height: img.offsetHeight }
        const naturalSize = { width: img.naturalWidth, height: img.naturalHeight }
        const result = await cropImage(imageUrl, rect, displaySize, naturalSize, annotations)
        setImageUrl(result.dataUrl)
        setAnnotations(result.annotations)
        setNewestId(null)
        setTick((t) => t + 1)
        window.electronAPI.saveSessionImage(result.dataUrl).catch(console.error)
      } catch (err) {
        console.error('Crop failed:', err)
        window.alert('Crop failed. Please try again.')
      } finally {
        setCropMode('idle')
      }
    },
    [imageUrl, annotations],
  )

  // ── Render ───────────────────────────────────────────────────────────────

  // Build SVG arrows from card DOM positions to image annotation points.
  // `tick` is read here so React re-renders when layout changes.
  void tick
  const arrowElements = annotations.map((ann) => {
    const cardEl = cardElsRef.current.get(ann.id)
    const imgEl = imageRef.current
    if (!cardEl || !imgEl) return null

    const cardRect = cardEl.getBoundingClientRect()
    const imgRect = imgEl.getBoundingClientRect()
    const target = getArrowTarget(ann)

    const sx = cardRect.right
    const sy = cardRect.top + cardRect.height / 2
    const tx = imgRect.left + target.x * imgRect.width
    const ty = imgRect.top + target.y * imgRect.height
    const isDot = !ann.rect

    return (
      <g key={ann.id}>
        <line
          x1={sx} y1={sy} x2={tx} y2={ty}
          stroke={ann.color}
          strokeWidth={3.5}
          strokeDasharray="5 3"
          opacity={0.85}
        />
        {isDot && (
          <>
            <circle cx={tx} cy={ty} r={5} fill={ann.color} opacity={0.9} />
            <circle cx={tx} cy={ty} r={2} fill="#fff" />
          </>
        )}
        {isDot && (
          <circle
            cx={tx} cy={ty} r={10}
            fill="transparent"
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onMouseDown={(e) => handleDotMouseDown(e, ann.id)}
          />
        )}
      </g>
    )
  })

  const selectedDotAnnotation = selectedAnnotationId
    ? annotations.find((a) => a.id === selectedAnnotationId && !a.rect)
    : null

  const dotToolbarPos = ((): { left: number; top: number } | null => {
    if (!selectedDotAnnotation || !imageRef.current) return null
    const imgRect = imageRef.current.getBoundingClientRect()
    const target = getArrowTarget(selectedDotAnnotation)
    return {
      left: imgRect.left + target.x * imgRect.width,
      top: imgRect.top + target.y * imgRect.height,
    }
  })()

  return (
    <div
      style={styles.root}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDroppingFile && (
        <div style={styles.dropOverlay}>
          <div style={styles.dropBox}>
            <div style={styles.dropIcon}>↓</div>
            <p style={styles.dropLabel}>Drop image or project bundle to open</p>
          </div>
        </div>
      )}
      <TopBar
        onOpenProject={handleOpenProject}
        onSaveProject={handleSaveProject}
        onCopy={handleCopy}
        onCrop={handleStartCrop}
        hasImage={!!imageUrl}
        copyState={copyState}
        cropMode={cropMode}
      />

      <div style={styles.body}>
        <Sidebar
          annotations={annotations}
          newestId={newestId}
          onChangeText={handleChangeText}
          onDelete={handleDelete}
          onAddNote={handleAddNote}
          onCardRef={handleCardRef}
          onScroll={handleSidebarScroll}
          onReorder={handleReorder}
          onDragMove={handleDragMove}
          isExporting={isExporting}
        />

        <Canvas
          imageUrl={imageUrl}
          annotations={annotations}
          imageRef={imageRef}
          onImageClick={handleImageClick}
          onDeselectMarker={handleDeselectMarker}
          isDragReady={isDragReady}
          projectDragState={projectDragState}
          onBuildProjectBundleForDrag={handleBuildProjectBundleForDrag}
          cropMode={cropMode}
          onApplyCrop={handleApplyCrop}
          onCancelCrop={handleCancelCrop}
          selectedAnnotationId={selectedAnnotationId}
          onSelectAnnotation={setSelectedAnnotationId}
          onUpdateAnnotationRect={handleUpdateAnnotationRect}
          onAnnotationColorChange={handleAnnotationColorChange}
          onConvertToDot={handleConvertToDot}
        />
      </div>

      {/* Full-viewport SVG: arrows + draggable dots. Hidden while in crop mode. */}
      {cropMode === 'idle' && (
        <svg
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 10,
            overflow: 'visible',
          }}
        >
          {arrowElements}
        </svg>
      )}

      {/* Floating toolbar for selected dot markers */}
      {cropMode === 'idle' && selectedDotAnnotation && dotToolbarPos && (
        <div
          style={{
            position: 'fixed',
            left: dotToolbarPos.left,
            top: dotToolbarPos.top - 44,
            transform: 'translateX(-50%)',
            zIndex: 20,
            pointerEvents: 'all',
          }}
          onMouseDown={(e): void => e.stopPropagation()}
        >
          <MarkerToolbar
            color={selectedDotAnnotation.color}
            onColorChange={(c) => handleAnnotationColorChange(selectedDotAnnotation.id, c)}
            onSecondaryAction={() => handleConvertToBox(selectedDotAnnotation.id)}
            secondaryIcon={<Square size={12} strokeWidth={2.5} />}
            secondaryLabel="Convert to box"
          />
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--color-bg-canvas)',
  },
  body: {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    overflow: 'hidden',
  },
  dropOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: 'rgba(0, 0, 0, 0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  dropBox: {
    border: '2px dashed rgba(255,255,255,0.6)',
    borderRadius: 16,
    padding: '48px 64px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  dropIcon: {
    fontSize: 48,
    lineHeight: 1,
    color: '#fff',
    fontWeight: 300,
  },
  dropLabel: {
    fontSize: 18,
    fontWeight: 500,
    color: '#fff',
    letterSpacing: 0.2,
  },
}
