import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Annotation } from './types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'
import { renderAnnotatedImage } from './utils/export'

// ─── Constants ───────────────────────────────────────────────────────────────

const ANNOTATION_COLORS = ['#E91E8C', '#2979FF', '#00BFA5', '#FF6D00']
const SIDEBAR_WIDTH = 280 // matches CSS var --sidebar-width

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
        />

        <Canvas
          imageUrl={imageUrl}
          annotations={annotations}
          sidebarWidth={SIDEBAR_WIDTH}
          onImageClick={handleImageClick}
        />
      </div>
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
