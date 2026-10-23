// Shrinks a photo in the browser before upload: longest side at most 1200px, WebP.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** Why a photo couldn't be prepared. The editor shows translated text for each code. */
export type ImageErrorCode = 'notImage' | 'unreadable' | 'noCanvas' | 'tooLarge'

export class ImageError extends Error {
  constructor(readonly code: ImageErrorCode) {
    super(code)
  }
}

export interface PreparedImage {
  blob: Blob
  ext: 'webp' | 'jpg'
  width: number
  height: number
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageError('unreadable'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function prepareImage(file: File, maxSide = 1200, quality = 0.85): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new ImageError('notImage')

  const img = await loadImage(file)
  const sourceW = img.naturalWidth
  const sourceH = img.naturalHeight
  if (!sourceW || !sourceH) throw new ImageError('unreadable')

  const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH))
  const width = Math.max(1, Math.round(sourceW * scale))
  const height = Math.max(1, Math.round(sourceH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageError('noCanvas')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  let blob = await canvasToBlob(canvas, 'image/webp', quality)
  let ext: PreparedImage['ext'] = 'webp'

  // Older Safari cannot encode WebP and silently returns PNG; use JPEG instead.
  if (!blob || blob.type !== 'image/webp') {
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    ext = 'jpg'
  }

  if (!blob) throw new ImageError('noCanvas')
  if (blob.size > MAX_UPLOAD_BYTES) throw new ImageError('tooLarge')

  return { blob, ext, width, height }
}
