import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Annotation } from './types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'
import { renderAnnotatedImage } from './utils/export'

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
  // Track which color to use next (cycle through palette)
  const colorIndexRef = useRef(0)

  // Refs for viewport-level SVG arrow overlay
  const cardElsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const imageRef = useRef<HTMLImageElement>(null)
  // tick forces a re-render whenever card or image layout changes
  const [tick, setTick] = useState(0)

  const handleCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardElsRef.current.set(id, el)
    } else {
      cardElsRef.current.delete(id)
    }
    setTick((t) => t + 1)
  }, [])

  // Re-render arrows when the image element resizes (e.g. window resize)
  useEffect(() => {
    const el = imageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageRef.current])

  // ── Load image from clipboard ────────────────────────────────────────────

  const loadFromClipboard = useCallback(async (): Promise<void> => {
    try {
      const dataUrl = await window.electronAPI.readClipboardImage()
      if (dataUrl) {
        setImageUrl(dataUrl)
        setAnnotations([])
        setNewestId(null)
      }
    } catch (err) {
      console.error('Failed to read clipboard image:', err)
    }
  }, [])

  // On mount: try to load any image already in the clipboard
  useEffect(() => {
    loadFromClipboard()
  }, [loadFromClipboard])

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

  const handleSave = useCallback(async (): Promise<void> => {
    if (!imageUrl) return
    const flat = await renderAnnotatedImage(imageUrl, annotations)
    window.electronAPI.saveImage(flat)
  }, [imageUrl, annotations])

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!imageUrl) return
    const flat = await renderAnnotatedImage(imageUrl, annotations)
    window.electronAPI.writeClipboardImage(flat)
  }, [imageUrl, annotations])

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
      </g>
    )
  })

  return (
    <div style={styles.root}>
      <TopBar onSave={handleSave} onCopy={handleCopy} hasImage={!!imageUrl} />

      <div style={styles.body}>
        <Sidebar
          annotations={annotations}
          newestId={newestId}
          onChangeText={handleChangeText}
          onDelete={handleDelete}
          onAddNote={handleAddNote}
          onCardRef={handleCardRef}
        />

        <Canvas
          imageUrl={imageUrl}
          annotations={annotations}
          imageRef={imageRef}
          onImageClick={handleImageClick}
        />
      </div>

      {/* Full-viewport SVG that draws arrows from sidebar cards to image points */}
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
}
