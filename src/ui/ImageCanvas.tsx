import { useEffect, useRef } from 'react'
import type { ImageGrid } from '../core/types'

/** Draws an ImageGrid at its own pixel size; CSS scales it to fit. */
export function ImageCanvas({ grid, label }: { grid: ImageGrid; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(grid.data), grid.width, grid.height), 0, 0)
  }, [grid])
  return (
    <canvas
      ref={ref}
      className="image-canvas"
      width={grid.width}
      height={grid.height}
      role="img"
      aria-label={label}
    />
  )
}
