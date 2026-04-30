import React, { useEffect, useRef, useCallback } from 'react'
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

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

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

  const cardRef = useCallback(
    (el: HTMLDivElement | null) => onRef(annotation.id, el),
    [annotation.id, onRef],
  )

  return (
    <div
      ref={cardRef}
      style={{ ...styles.card, border: `1px solid ${annotation.color}` }}
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
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: 'relative',
    background: 'var(--color-bg-card)',
    borderRadius: 6,
    boxShadow: 'var(--color-card-shadow)',
    padding: '10px 10px 10px 12px',
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
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
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
}
