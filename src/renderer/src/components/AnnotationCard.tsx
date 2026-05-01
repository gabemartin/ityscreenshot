import React, { useEffect, useRef, useCallback } from 'react'
import { Annotation } from '../types'

interface AnnotationCardProps {
  annotation: Annotation
  index: number
  autoFocus: boolean
  onChange: (id: string, text: string) => void
  onDelete: (id: string) => void
  onRef: (id: string, el: HTMLDivElement | null) => void
  isDragging: boolean
  dragDeltaY: number
  onGripMouseDown: (e: React.MouseEvent) => void
}

function GripHandle(): React.ReactElement {
  return (
    <svg
      width="8"
      height="14"
      viewBox="0 0 8 14"
      fill="currentColor"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx="2" cy="2.5" r="1.4" />
      <circle cx="6" cy="2.5" r="1.4" />
      <circle cx="2" cy="7" r="1.4" />
      <circle cx="6" cy="7" r="1.4" />
      <circle cx="2" cy="11.5" r="1.4" />
      <circle cx="6" cy="11.5" r="1.4" />
    </svg>
  )
}

export default function AnnotationCard({
  annotation,
  index,
  autoFocus,
  onChange,
  onDelete,
  onRef,
  isDragging,
  dragDeltaY,
  onGripMouseDown,
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
      data-annotation-card
      style={{
        ...styles.card,
        border: `1px solid ${annotation.color}`,
        // translateY follows the mouse; getBoundingClientRect() reflects this,
        // so App's arrow overlay redraws to the card's actual visual position.
        transform: isDragging ? `translateY(${dragDeltaY}px)` : undefined,
        zIndex: isDragging ? 100 : 'auto',
        boxShadow: isDragging
          ? '0 8px 24px rgba(0,0,0,0.35)'
          : 'var(--color-card-shadow)',
        userSelect: isDragging ? 'none' : undefined,
      }}
    >
      <div style={styles.cardTop}>
        <div style={styles.handleAndNumber}>
          <span
            style={{ ...styles.grip, cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={onGripMouseDown}
            title="Drag to reorder"
          >
            <GripHandle />
          </span>
          <span style={{ ...styles.cardNumber, color: annotation.color }}>
            {index + 1}
          </span>
        </div>

        <button
          style={styles.deleteBtn}
          onClick={() => onDelete(annotation.id)}
          title="Remove annotation"
          aria-label="Delete annotation"
        >
          ×
        </button>
      </div>

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
    padding: '8px 10px 10px 10px',
    marginBottom: 8,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  handleAndNumber: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  grip: {
    color: 'var(--color-text-muted)',
    opacity: 0.5,
    display: 'flex',
    alignItems: 'center',
  },
  cardNumber: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  deleteBtn: {
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
    flexShrink: 0,
  },
  textarea: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    lineHeight: 1.5,
    minHeight: 40,
    overflow: 'hidden',
    resize: 'none',
    cursor: 'text',
  },
}
