import React, { useEffect, useRef, useState } from 'react'
import { Annotation } from '../types'
import AnnotationCard from './AnnotationCard'

interface DragState {
  dragIndex: number
  startY: number      // mouse clientY at drag start
  deltaY: number      // current Y translation applied to the dragged card
  dropIndex: number   // insertion position (insert-before index)
  cardCenters: number[] // clientY midpoint of each card measured at drag start
}

interface SidebarProps {
  annotations: Annotation[]
  newestId: string | null
  onChangeText: (id: string, text: string) => void
  onDelete: (id: string) => void
  onAddNote: () => void
  onCardRef: (id: string, el: HTMLDivElement | null) => void
  onScroll: () => void
  onReorder: (fromIndex: number, insertBefore: number) => void
  onDragMove: () => void
  isExporting: boolean
}

export default function Sidebar({
  annotations,
  newestId,
  onChangeText,
  onDelete,
  onAddNote,
  onCardRef,
  onScroll,
  onReorder,
  onDragMove,
  isExporting,
}: SidebarProps): React.ReactElement {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  // Ref mirrors state so the mousemove closure always reads the latest values
  const dragStateRef = useRef<DragState | null>(null)

  const handleGripMouseDown = (index: number, e: React.MouseEvent): void => {
    e.preventDefault()
    // Measure the clientY midpoint of every card at the moment dragging begins.
    // [data-annotation-card] is set on each card div so we select only cards.
    const cards = scrollAreaRef.current?.querySelectorAll<HTMLElement>('[data-annotation-card]')
    if (!cards || cards.length === 0) return
    const cardCenters = Array.from(cards).map((el) => {
      const r = el.getBoundingClientRect()
      return r.top + r.height / 2
    })
    const state: DragState = {
      dragIndex: index,
      startY: e.clientY,
      deltaY: 0,
      dropIndex: index,
      cardCenters,
    }
    dragStateRef.current = state
    setDragState(state)
  }

  // Attach window-level listeners only while a drag is active
  const isDragging = dragState !== null
  useEffect(() => {
    if (!isDragging) return

    const onMouseMove = (e: MouseEvent): void => {
      const state = dragStateRef.current
      if (!state) return

      const deltaY = e.clientY - state.startY
      const { cardCenters, dragIndex } = state

      // Determine where the dragged card's center is now
      const draggedCenter = cardCenters[dragIndex] + deltaY

      // Find the insertion point by comparing against non-dragged cards' centers
      let dropIndex = 0
      for (let i = 0; i < cardCenters.length; i++) {
        if (i === dragIndex) continue
        if (draggedCenter > cardCenters[i]) dropIndex = i + 1
      }

      const newState = { ...state, deltaY, dropIndex }
      dragStateRef.current = newState
      setDragState(newState)
      // Bump App's tick so arrows redraw from the card's new transformed position
      onDragMove()
    }

    const onMouseUp = (): void => {
      const state = dragStateRef.current
      if (!state) return
      const { dragIndex, dropIndex } = state
      // Only reorder if the card actually moved to a different position
      if (dropIndex !== dragIndex && dropIndex !== dragIndex + 1) {
        onReorder(dragIndex, dropIndex)
      }
      dragStateRef.current = null
      setDragState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, onDragMove, onReorder])

  // Show the drop-indicator line at a given array position only when it's not a no-op
  const shouldShowIndicator = (atIndex: number): boolean => {
    if (!dragState) return false
    const { dropIndex, dragIndex } = dragState
    if (dropIndex !== atIndex) return false
    return dropIndex !== dragIndex && dropIndex !== dragIndex + 1
  }

  return (
    <div style={styles.sidebar}>
      <div ref={scrollAreaRef} style={styles.scrollArea} onScroll={onScroll}>
        {annotations.length === 0 ? (
          <p style={styles.empty}>Click the image or + Add note to add annotations.</p>
        ) : (
          <>
            {annotations.map((ann, i) => (
              <React.Fragment key={ann.id}>
                {shouldShowIndicator(i) && <div style={styles.dropIndicator} />}
                <AnnotationCard
                  annotation={ann}
                  index={i}
                  autoFocus={ann.id === newestId}
                  onChange={onChangeText}
                  onDelete={onDelete}
                  onRef={onCardRef}
                  isDragging={dragState?.dragIndex === i}
                  dragDeltaY={dragState?.dragIndex === i ? dragState.deltaY : 0}
                  onGripMouseDown={(e) => handleGripMouseDown(i, e)}
                />
              </React.Fragment>
            ))}
            {shouldShowIndicator(annotations.length) && (
              <div style={styles.dropIndicator} />
            )}
          </>
        )}
      </div>

      {!isExporting && (
        <div style={styles.footer}>
          <button style={styles.addBtn} onClick={onAddNote}>
            + Add note
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    maxWidth: 'var(--sidebar-width)',
    background: 'var(--color-bg-sidebar)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 12px 0 12px',
  },
  empty: {
    color: 'var(--color-text-muted)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 1.6,
  },
  dropIndicator: {
    height: 2,
    borderRadius: 2,
    background: 'var(--color-text-primary)',
    opacity: 0.4,
    marginBottom: 4,
  },
  footer: {
    padding: '10px 12px 14px',
    borderTop: '1px solid var(--color-border)',
  },
  addBtn: {
    width: '100%',
    height: 32,
    borderRadius: 6,
    background: 'var(--color-btn-secondary-bg)',
    color: 'var(--color-text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    border: '1px dashed var(--color-border)',
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
}
