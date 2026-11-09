import { useEffect, useRef } from 'react'
import type { ImageGrid } from '../../core/types'
import { photoPixelAt } from './photoSample'

/** A ring on the image (in image pixels), with an optional label beside it. */
export type Mark = { x: number; y: number; r: number; label?: string }

type Props = {
  image: ImageGrid
  marks: Mark[]
  /** A click on the image, in image pixels. */
  onPick(at: { x: number; y: number }): void
  label: string
}

/** An uploaded image (a yarn photo or a colour chart) that reports clicks and shows rings
 *  where colours were taken. */
export function ClickableImage({ image, marks, onPick, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      0,
      0,
    )
    // Sized for the screen: one CSS pixel in image pixels, so rings and labels stay readable
    // however much the image is scaled down to fit.
    const unit = image.width / (ref.current!.clientWidth || image.width)
    ctx.font = `600 ${Math.round(13 * unit)}px system-ui, sans-serif`
    ctx.textBaseline = 'middle'
    for (const m of marks) {
      const line = 1.5 * unit
      // At least a few pixels across on screen, even where only a tiny patch is sampled.
      const r = Math.max(m.r, 5 * unit)
      ctx.lineWidth = line
      // Black under white: visible on any colour.
      for (const [colour, extra] of [
        ['#000', line],
        ['#fff', 0],
      ] as const) {
        ctx.strokeStyle = colour
        ctx.beginPath()
        ctx.arc(m.x, m.y, r + extra, 0, 2 * Math.PI)
        ctx.stroke()
      }
      if (m.label) {
        const x = m.x + r + 4 * unit
        ctx.lineWidth = 3 * unit
        ctx.strokeStyle = '#000'
        ctx.strokeText(m.label, x, m.y)
        ctx.fillStyle = '#fff'
        ctx.fillText(m.label, x, m.y)
      }
    }
  }, [image, marks])

  return (
    <canvas
      ref={ref}
      className="photo-canvas"
      width={image.width}
      height={image.height}
      role="img"
      aria-label={label}
      onClick={(e) => {
        const at = photoPixelAt(
          { x: e.clientX, y: e.clientY },
          e.currentTarget.getBoundingClientRect(),
          image,
        )
        if (at) onPick(at)
      }}
    />
  )
}
