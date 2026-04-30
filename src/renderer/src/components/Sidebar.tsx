import React from 'react'
import { Annotation } from '../types'
import AnnotationCard from './AnnotationCard'

interface SidebarProps {
  annotations: Annotation[]
  newestId: string | null
  onChangeText: (id: string, text: string) => void
  onDelete: (id: string) => void
  onAddNote: () => void
  onCardRef: (id: string, el: HTMLDivElement | null) => void
  isExporting: boolean
}

export default function Sidebar({
  annotations,
  newestId,
  onChangeText,
  onDelete,
  onAddNote,
  onCardRef,
  isExporting,
}: SidebarProps): React.ReactElement {
  return (
    <div style={styles.sidebar}>
      <div style={styles.scrollArea}>
        {annotations.length === 0 ? (
          <p style={styles.empty}>Click the image to add annotations.</p>
        ) : (
          annotations.map((ann) => (
            <AnnotationCard
              key={ann.id}
              annotation={ann}
              autoFocus={ann.id === newestId}
              onChange={onChangeText}
              onDelete={onDelete}
              onRef={onCardRef}
            />
          ))
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
