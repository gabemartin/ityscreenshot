import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Annotation, ISpeechRecognition, SpeechRecognitionEvent } from '../types'

interface AnnotationCardProps {
  annotation: Annotation
  autoFocus: boolean
  onChange: (id: string, text: string) => void
  onDelete: (id: string) => void
}

export default function AnnotationCard({
  annotation,
  autoFocus,
  onChange,
  onDelete,
}: AnnotationCardProps): React.ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<ISpeechRecognition | null>(null)

  // Auto-focus when the card is newly created
  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus()
    }
  }, [autoFocus])

  // Auto-resize textarea to fit content
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [annotation.text, resizeTextarea])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(annotation.id, e.target.value)
    resizeTextarea()
  }

  const handleMic = (): void => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    // Keep a snapshot of committed text before this session started
    const baseText = annotation.text

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''
      for (let i = event.results.length - 1; i >= 0; i--) {
        const result = event.results[i]
        if (result.isFinal) {
          final = result[0].transcript + ' '
          break
        } else {
          interim = result[0].transcript
        }
      }
      // Build the running text: base + all final segments + current interim
      let committed = baseText
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          committed += event.results[i][0].transcript + ' '
        }
      }
      void final // used implicitly above
      onChange(annotation.id, committed + interim)
      resizeTextarea()
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.onerror = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.start()
    setIsListening(true)
  }

  return (
    <div
      style={{
        ...styles.card,
        borderLeft: `3px solid ${annotation.color}`,
      }}
    >
      {/* Delete button */}
      <button
        style={styles.deleteBtn}
        onClick={() => onDelete(annotation.id)}
        title="Remove annotation"
        aria-label="Delete annotation"
      >
        ×
      </button>

      {/* Text area */}
      <textarea
        ref={textareaRef}
        style={styles.textarea}
        value={annotation.text}
        onChange={handleChange}
        placeholder="Add a note…"
        rows={2}
      />

      {/* Mic button */}
      <div style={styles.cardFooter}>
        <button
          style={{
            ...styles.micBtn,
            background: isListening ? annotation.color : 'transparent',
            color: isListening ? '#fff' : 'var(--color-text-secondary)',
          }}
          onClick={handleMic}
          title={isListening ? 'Stop recording' : 'Dictate note'}
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
    // Smooth shadow on hover is handled inline in the rendered element
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
    paddingRight: 20, // leave room for × button
    overflow: 'hidden',
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
  },
  listeningDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#E91E8C',
    animation: 'none',
  },
}
