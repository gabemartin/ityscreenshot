import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Annotation } from './types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'

// ─── Drag helpers ─────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ANNOTATION_COLORS = ['#E91E8C', '#2979FF', '#00BFA5', '#FF6D00']

function randomColor(): string {
  return ANNOTATION_COLORS[Math.floor(Math.random() * ANNOTATION_COLORS.length)]
}

function generateId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [newestId, setNewestId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle')
  const colorIndexRef = useRef(0)

  // Refs for viewport-level SVG arrow overlay
  const cardElsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const imageRef = useRef<HTMLImageElement>(null)
  // tick forces a re-render whenever card or image layout changes
  const [tick, setTick] = useState(0)

  // ── Point dragging ───────────────────────────────────────────────────────
  const draggingIdRef = useRef<string | null>(null)

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
    draggingIdRef.current = id
    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      const id = draggingIdRef.current
      if (!id || !imageRef.current) return
      const rect = imageRef.current.getBoundingClientRect()
      const x = clamp01((e.clientX - rect.left) / rect.width)
      const y = clamp01((e.clientY - rect.top) / rect.height)
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, point: { x, y } } : a))
      )
    }
    const onMouseUp = (): void => {
      if (!draggingIdRef.current) return
      draggingIdRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
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
  }, [])

  const loadFromClipboard = useCallback(async (): Promise<void> => {
    try {
      const dataUrl = await window.electronAPI.readClipboardImage()
      if (dataUrl) loadImage(dataUrl)
    } catch (err) {
      console.error('Failed to read clipboard image:', err)
    }
  }, [loadImage])

  // On mount: try to load any image already in the clipboard
  useEffect(() => {
    loadFromClipboard()
  }, [loadFromClipboard])

  // ── Drag-and-drop image into window ─────────────────────────────────────

  const [isDroppingFile, setIsDroppingFile] = useState(false)
  // Counter tracks nested dragenter/dragleave so the overlay stays visible
  // while the cursor moves across child elements inside the root div.
  const dragDepthRef = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    if (Array.from(e.dataTransfer.items).some((i) => i.kind === 'file' && i.type.startsWith('image/'))) {
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

  const handleDrop = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    dragDepthRef.current = 0
    setIsDroppingFile(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev): void => {
      const result = ev.target?.result
      if (typeof result === 'string') loadImage(result)
    }
    reader.readAsDataURL(file)
  }, [loadImage])

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

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!imageUrl) return
    setCopyState('Copying')
    const dataUrl = await capture()
    if (dataUrl) {
      await window.electronAPI.writeClipboardImage(dataUrl)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1800)
    } else {
      setCopyState('idle')
    }
  }, [imageUrl, capture])

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

    // Arrow starts at right-center of the sidebar card
    const sx = cardRect.right
    const sy = cardRect.top + cardRect.height / 2

    // Arrow ends at the annotation point on the image
    const tx = imgRect.left + ann.point.x * imgRect.width
    const ty = imgRect.top + ann.point.y * imgRect.height

    return (
      <g key={ann.id}>
        <line
          x1={sx} y1={sy} x2={tx} y2={ty}
          stroke={ann.color}
          strokeWidth={1.5}
          strokeDasharray="5 3"
          opacity={0.85}
        />
        <circle cx={tx} cy={ty} r={5} fill={ann.color} opacity={0.9} />
        <circle cx={tx} cy={ty} r={2} fill="#fff" />
        {/* Transparent hit-area that enables drag */}
        <circle
          cx={tx} cy={ty} r={10}
          fill="transparent"
          style={{ pointerEvents: 'all', cursor: 'move' }}
          onMouseDown={(e) => handleDotMouseDown(e, ann.id)}
        />
      </g>
    )
  })

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
            <p style={styles.dropLabel}>Drop image to open</p>
          </div>
        </div>
      )}
      <TopBar onSave={handleSave} onCopy={handleCopy} hasImage={!!imageUrl} copyState={copyState} />

      <div style={styles.body}>
        <Sidebar
          annotations={annotations}
          newestId={newestId}
          onChangeText={handleChangeText}
          onDelete={handleDelete}
          onAddNote={handleAddNote}
          onCardRef={handleCardRef}
          onScroll={handleSidebarScroll}
          isExporting={isExporting}
        />

        <Canvas
          imageUrl={imageUrl}
          annotations={annotations}
          imageRef={imageRef}
          onImageClick={handleImageClick}
          isDragReady={isDragReady}
        />
      </div>

      {/* Full-viewport SVG: arrows + draggable dots. pointerEvents none on the SVG
          itself so clicks pass through to the canvas; individual dots override to all. */}
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
