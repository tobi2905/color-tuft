import { useEffect, useRef, useState } from 'react'
import type { ImageGrid } from '../../core/types'
import { cropToBlob } from '../../render/cropToBlob'
import { loadImageFile } from '../../render/loadImage'
import { photoCropBox, photoPixelAt, photoSampleRadius, sampleHex } from './photoSample'

type Props = {
  /** Called with the colour code each time a spot is clicked. */
  onSample(hex: string): void
  /** If given: called with a small crop around each clicked spot, to keep as the yarn's photo. */
  onCrop?(photo: Blob): void
  onClose(): void
}

/** Take a yarn's colour from a photo: upload a photo of the cone, click on the yarn. */
export function PhotoSampler({ onSample, onCrop, onClose }: Props) {
  const [photo, setPhoto] = useState<ImageGrid | null>(null)
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  // Cropping takes a moment; only the crop of the latest click is kept.
  const lastClick = useRef(0)

  // Draw the photo, and a ring showing the patch that was sampled.
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !photo) return
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(photo.data), photo.width, photo.height),
      0,
      0,
    )
    if (!spot) return
    const r = photoSampleRadius(photo)
    const line = Math.max(2, r / 4)
    ctx.lineWidth = line
    for (const [colour, extra] of [
      ['#000', line],
      ['#fff', 0],
    ] as const) {
      ctx.strokeStyle = colour
      ctx.beginPath()
      ctx.arc(spot.x, spot.y, r + extra, 0, 2 * Math.PI)
      ctx.stroke()
    }
  }, [photo, spot])

  async function open(file: File | undefined) {
    if (!file) return
    setMessage(null)
    setSpot(null)
    try {
      setPhoto((await loadImageFile(file)).grid)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  function click(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!photo) return
    const at = photoPixelAt(
      { x: e.clientX, y: e.clientY },
      e.currentTarget.getBoundingClientRect(),
      photo,
    )
    if (!at) return
    const hex = sampleHex(photo, at)
    if (!hex) {
      setMessage('That spot is transparent: click on the yarn.')
      return
    }
    setMessage(null)
    setSpot(at)
    onSample(hex)
    if (onCrop) {
      const click = ++lastClick.current
      void cropToBlob(photo, photoCropBox(photo, at)).then((blob) => {
        if (click === lastClick.current) onCrop(blob)
      })
    }
  }

  return (
    <div className="photo-sampler">
      <label className="field">
        Photo of the yarn
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => void open(e.target.files?.[0])}
        />
      </label>
      {photo && (
        <>
          <canvas
            ref={ref}
            className="photo-canvas"
            width={photo.width}
            height={photo.height}
            role="img"
            aria-label="Photo of the yarn: click on the yarn to take its colour"
            onClick={click}
          />
          <p className="hint">
            {spot
              ? 'Colour taken from the ring. Click elsewhere to try another spot.'
              : 'Click on the yarn, away from shiny highlights and deep shadows.'}{' '}
            Photos in daylight give the truest colour.
          </p>
        </>
      )}
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          {spot ? 'Done' : 'Close'}
        </button>
      </div>
    </div>
  )
}
