import { useMemo, useRef, useState } from 'react'
import type { ImageGrid } from '../../core/types'
import { cropToBlob } from '../../render/cropToBlob'
import { loadImageFile } from '../../render/loadImage'
import { ClickableImage } from './ClickableImage'
import { photoCropBox, photoSampleRadius, sampleHex } from './photoSample'

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
  // Cropping takes a moment; only the crop of the latest click is kept.
  const lastClick = useRef(0)

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

  // Memoised: a new list would redraw the whole photo on every render.
  const marks = useMemo(
    () => (photo && spot ? [{ ...spot, r: photoSampleRadius(photo) }] : []),
    [photo, spot],
  )

  function pick(at: { x: number; y: number }) {
    if (!photo) return
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
          <ClickableImage
            image={photo}
            marks={marks}
            onPick={pick}
            label="Photo of the yarn: click on the yarn to take its colour"
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
