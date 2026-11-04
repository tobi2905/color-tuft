import { useEffect, useRef } from 'react'
import type { Pt, RugSize } from '../core/types'
import { drawCut, drawPattern } from '../render/patternCanvas'
import { useProject } from './store/useProject'
import { labelOrNull, mmAt, viewSize } from './viewGeometry'

export type HoverProps = { highlight: number | null; onHover(label: number | null): void }

/**
 * The pattern on a canvas, the whole map (`rug`: its size in mm). Optional: the cut line drawn
 * dashed, and clicks reported in mm.
 */
export function PatternView({
  rug,
  highlight,
  onHover,
  showCut = false,
  onClickMm,
}: { rug: RugSize; showCut?: boolean; onClickMm?(at: Pt): void } & HoverProps) {
  const pattern = useProject((s) => s.result!.pattern)
  const map = useProject((s) => s.result!.map)
  const palette = useProject((s) => s.palette)
  const cut = useProject((s) => s.result!.cut)
  const ref = useRef<HTMLCanvasElement>(null)
  const size = viewSize(rug)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx)
      drawPattern(ctx, pattern, palette, {
        scale: size.scale,
        numbers: true,
        outlines: true,
        highlight,
      })
    if (ctx && showCut && cut) drawCut(ctx, cut, size.scale)
  }, [pattern, palette, highlight, size.scale, showCut, cut])

  return (
    <canvas
      ref={ref}
      className={onClickMm ? 'view clickable' : 'view'}
      width={size.width}
      height={size.height}
      role="img"
      aria-label="The pattern, each area numbered with its colour"
      onMouseMove={(e) => onHover(labelOrNull(map, mmAt(e, rug)))}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => onClickMm?.(mmAt(e, rug))}
    />
  )
}
