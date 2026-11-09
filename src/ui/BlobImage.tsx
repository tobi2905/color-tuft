import { useEffect, useRef } from 'react'

/** An <img> showing a Blob. Its temporary URL is released when the Blob changes or the image
 *  goes away. */
export function BlobImage({ blob, ...props }: { blob: Blob } & React.ComponentProps<'img'>) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    ref.current!.src = url
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return <img ref={ref} {...props} />
}
