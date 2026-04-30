import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Annotation } from '../types'

interface AnnotationCardProps {
  annotation: Annotation
  autoFocus: boolean
  onChange: (id: string, text: string) => void
  onDelete: (id: string) => void
  onRef: (id: string, el: HTMLDivElement | null) => void
}

export default function AnnotationCard({
  annotation,
  autoFocus,
  onChange,
  onDelete,
  onRef,
}: AnnotationCardProps): React.ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isListening, setIsListening] = useState(false)
  // Track committed text before this speech session started
  const baseTextRef = useRef('')

  // Auto-focus when newly created
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => { resizeTextarea() }, [annotation.text, resizeTextarea])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(annotation.id, e.target.value)
    resizeTextarea()
  }

  // Subscribe to speech results from the main process
  useEffect(() => {
    const unsub = window.electronAPI.onSpeechResult((payload) => {
      if (payload.annotationId !== annotation.id) return

      if (payload.type === 'interim' && payload.text !== undefined) {
        onChange(annotation.id, baseTextRef.current + payload.text)
        resizeTextarea()
      } else if (payload.type === 'final' && payload.text !== undefined) {
        const committed = baseTextRef.current + payload.text + ' '
        baseTextRef.current = committed
        onChange(annotation.id, committed)
        resizeTextarea()
      } else if (payload.type === 'stopped' || payload.type === 'error') {
        setIsListening(false)
      }
    })
    return unsub
  }, [annotation.id, onChange, resizeTextarea])

  const handleMic = useCallback(async (): Promise<void> => {
    if (isListening) {
      await window.electronAPI.stopSpeech()
      setIsListening(false)
    } else {
      baseTextRef.current = annotation.text
      await window.electronAPI.startSpeech(annotation.id)
      setIsListening(true)
    }
  }, [isListening, annotation.id, annotation.text])

  // Stable ref callback — avoids infinite re-render loop from inline arrow fns
  const cardRef = useCallback(
    (el: HTMLDivElement | null) => onRef(annotation.id, el),
    [annotation.id, onRef],
  )

  return (
    <div
      ref={cardRef}
      style={{ ...styles.card, borderLeft: `3px solid ${annotation.color}` }}
    >
      <button
        style={styles.deleteBtn}
        onClick={() => onDelete(annotation.id)}
        title="Remove annotation"
        aria-label="Delete annotation"
      >
        ×
      </button>

      <textarea
        ref={textareaRef}
        style={styles.textarea}
        value={annotation.text}
        onChange={handleChange}
        placeholder="Add a note…"
        rows={2}
      />

      <div style={styles.cardFooter}>
        <button
          style={{
            ...styles.micBtn,
            background: isListening ? annotation.color : 'transparent',
            color: isListening ? '#fff' : 'var(--color-text-secondary)',
          }}
          onClick={handleMic}
          title={isListening ? 'Stop recording' : 'Dictate note (macOS Speech)'}
          aria-label={isListening ? 'Stop recording' : 'Start speech to text'}
        >
          🎤
        </button>
        {isListening && <span style={styles.listeningDot} />}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: 'relative',
    background: '#ffffff',
    borderRadius: 8,
    boxShadow: 'var(--color-card-shadow)',
    padding: '10px 10px 8px 12px',
    marginBottom: 8,
  },
  deleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--color-text-muted)',
    fontSize: 16,
    lineHeight: '20px',
    textAlign: 'center',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'color 0.1s, background 0.1s',
  },
  textarea: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    lineHeight: 1.5,
    minHeight: 40,
    paddingRight: 20,
    overflow: 'hidden',
    resize: 'none',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  micBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: '1px solid transparent',
    transition: 'background 0.15s',
    cursor: 'pointer',
  },
  listeningDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#E91E8C',
  },
}
