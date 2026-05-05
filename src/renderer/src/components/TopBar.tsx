import React from 'react'

interface TopBarProps {
  onOpenProject: () => void
  onSaveProject: () => void
  onCopy: () => void
  onCrop: () => void
  hasImage: boolean
  copyState?: 'idle' | 'copying' | 'copied'
  cropMode?: 'idle' | 'active'
}

export default function TopBar({
  onOpenProject,
  onSaveProject,
  onCopy,
  onCrop,
  hasImage,
  copyState = 'idle',
  cropMode = 'idle',
}: TopBarProps): React.ReactElement {
  const isBusy = copyState === 'copying'
  const isCopied = copyState === 'copied'
  const copyActive = hasImage && !isBusy && cropMode === 'idle'
  const cropActive = hasImage && cropMode === 'idle'

  return (
    <div style={styles.topBar}>
      {/* Left spacer — leaves room for macOS traffic lights (hiddenInset) */}
      <div style={styles.trafficLightSpacer} />

      {/* Draggable title region */}
      <div style={styles.dragRegion} />

      {/* Action buttons */}
      <div style={styles.actions}>
        <button
          style={{
            ...styles.btn,
            ...styles.btnSecondary,
          }}
          onClick={onOpenProject}
          title="Open project bundle (.zip or .speck)"
        >
          Open Project
        </button>
        <button
          style={{
            ...styles.btn,
            ...styles.btnSecondary,
            opacity: cropActive ? 1 : 0.4,
            cursor: cropActive ? 'pointer' : 'not-allowed',
          }}
          onClick={cropActive ? onCrop : undefined}
          title="Crop the image (notes outside the crop are removed)"
        >
          Crop
        </button>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            style={{
              ...styles.btn,
              ...styles.btnSecondary,
              opacity: copyActive ? 1 : 0.4,
              cursor: copyActive ? 'pointer' : 'not-allowed',
              transition: 'opacity 0.15s',
            }}
            onClick={copyActive ? onCopy : undefined}
            title="Copy annotated screenshot to clipboard"
          >
            Copy Image
          </button>
          {isCopied && <div style={styles.copiedTooltip}>Copied!</div>}
        </div>
        <button
          style={{
            ...styles.btn,
            ...styles.btnPrimary,
            opacity: hasImage ? 1 : 0.4,
            cursor: hasImage ? 'pointer' : 'not-allowed',
          }}
          onClick={hasImage ? onSaveProject : undefined}
          title="Save project bundle (.zip)"
        >
          Save Project
        </button>
      </div>
    </div>
  )
}

// electron-vite / Chromium accepts -webkit-app-region as a CSS property.
// React's CSSProperties type doesn't include it, so we use an extended type.
type AppCSSProperties = React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

const styles: Record<string, AppCSSProperties> = {
  topBar: {
    height: 'var(--topbar-height)',
    minHeight: 'var(--topbar-height)',
    background: 'var(--color-bg-topbar)',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'row',
    // Make the whole bar draggable; buttons opt out below
    WebkitAppRegion: 'drag',
    userSelect: 'none',
    position: 'relative',
    zIndex: 10,
  },
  // Width to clear macOS traffic lights (80px is the standard safe zone)
  trafficLightSpacer: {
    width: 80,
    flexShrink: 0,
  },
  dragRegion: {
    flex: 1,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingRight: 16,
    // Opt out of drag so buttons are clickable
    WebkitAppRegion: 'no-drag',
  },
  btn: {
    height: 28,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'var(--font-family)',
    fontWeight: 500,
    lineHeight: 1,
    transition: 'background 0.12s',
  },
  btnPrimary: {
    background: 'var(--color-btn-primary-bg)',
    color: 'var(--color-btn-primary-text)',
  },
  btnSecondary: {
    background: 'var(--color-btn-secondary-bg)',
    color: 'var(--color-btn-secondary-text)',
  },
  copiedTooltip: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#00BFA5',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 100,
  },
}
