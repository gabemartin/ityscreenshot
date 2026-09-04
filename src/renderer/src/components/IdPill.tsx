import React, { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { copyToClipboard } from '../utils/clipboard'

const COPY_FEEDBACK_MS = 1200

interface IdPillProps {
  /** Full stable ID (e.g. `ann_...`). The last 5 chars, uppercased, are shown and copied. */
  id: string
  /** Accent border color — usually the parent item's own color, for quick visual matching. */
  color: string
  /** Positioning overrides (position/left/top/transform/zIndex/pointerEvents). */
  style?: React.CSSProperties
}

/**
 * Small, high-contrast "ID tag" used to label notes, arrows, and shapes.
 *
 * Deliberately uses fixed (non-theme) colors rather than CSS variables: these
 * pills get baked into exported screenshots that are often read by an LLM
 * vision model, so contrast must stay maximal and consistent regardless of
 * the app's light/dark theme or the screenshot's own background.
 *
 * Click copies the displayed ID to the clipboard, with brief checkmark feedback.
 */
export default function IdPill({ id, color, style }: IdPillProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return (): void => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const label = id.slice(-5).toUpperCase()

  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    copyToClipboard(label)
    setCopied(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
  }

  return (
    <div
      role="button"
      tabIndex={-1}
      onMouseDown={(e): void => e.stopPropagation()}
      onClick={handleClick}
      title="Copy ID to clipboard"
      aria-label="Copy ID to clipboard"
      style={{ ...baseStyle, borderColor: color, ...style }}
    >
      {copied ? <Check size={11} strokeWidth={3} /> : label}
    </div>
  )
}

const baseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  minWidth: 22,
  // Fixed (not theme-driven) for maximal, consistent contrast in exports.
  background: '#ffffff',
  border: '2px solid',
  borderRadius: 999,
  padding: '2px 7px',
  fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.02em',
  lineHeight: 1.3,
  color: '#0a0a0a',
  boxShadow: '0 1px 4px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.1)',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}
