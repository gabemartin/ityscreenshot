import React from 'react'
import { Annotation } from '../types'

interface AnnotationOverlayProps {
  annotations: Annotation[]
  /** Pixel width of the rendered image element */
  imageWidth: number
  /** Pixel height of the rendered image element */
  imageHeight: number
  /** Pixel width of the sidebar — used to compute arrow start x */
  sidebarWidth: number
}

/**
 * Renders an SVG absolutely positioned over the canvas area.
 * For each annotation it draws a line from just right of the sidebar edge
 * to the annotation's fractional point on the image.
 */
export default function AnnotationOverlay({
  annotations,
  imageWidth,
  imageHeight,
  sidebarWidth,
}: AnnotationOverlayProps): React.ReactElement | null {
  if (annotations.length === 0) return null

  // The canvas area starts at x = sidebarWidth within the full window.
  // The SVG coordinate space covers the full window width so we can draw
  // across the sidebar/canvas boundary cleanly.
  const svgWidth = sidebarWidth + imageWidth
  const svgHeight = imageHeight

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: svgWidth,
        height: svgHeight,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      width={svgWidth}
      height={svgHeight}
    >
      {annotations.map((ann) => {
        // Target point in SVG coords
        const tx = sidebarWidth + ann.point.x * imageWidth
        const ty = ann.point.y * imageHeight

        // Arrow start: right edge of sidebar minus a small gap
        const sx = sidebarWidth - 4
        // Vertical position: midpoint of the card is hard to calculate without
        // DOM refs; use the same ty as a reasonable approximation
        const sy = ty

        return (
          <g key={ann.id}>
            <line
              x1={sx}
              y1={sy}
              x2={tx}
              y2={ty}
              stroke={ann.color}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.85}
            />
            <circle
              cx={tx}
              cy={ty}
              r={5}
              fill={ann.color}
              opacity={0.9}
            />
            {/* Small arrow head */}
            <circle
              cx={tx}
              cy={ty}
              r={2}
              fill="#fff"
              opacity={0.9}
            />
          </g>
        )
      })}
    </svg>
  )
}
