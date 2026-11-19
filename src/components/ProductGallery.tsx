import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useShop } from '../state'

interface ProductGalleryProps {
  images: string[]
  alt: string
}

/**
 * Swipeable product photos. Uses native horizontal scrolling with snap points, so touch swiping,
 * trackpads and right-to-left layouts work without a library. Arrows and dots appear with 2+ photos.
 * Photos after the first load lazily, so a product's extra photos are only downloaded when it's opened.
 */
export function ProductGallery({ images, alt }: ProductGalleryProps) {
  const { t } = useShop()
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const count = images.length
  const many = count > 1

  // A different product: start again from its cover.
  useEffect(() => {
    setIndex(0)
    track.current?.scrollTo({ left: 0 })
  }, [images])

  function onScroll() {
    const el = track.current
    if (!el || !el.clientWidth) return
    // scrollLeft is negative in right-to-left layouts; the slide number is the same either way.
    const next = Math.round(Math.abs(el.scrollLeft) / el.clientWidth)
    setIndex(Math.min(count - 1, Math.max(0, next)))
  }

  function go(target: number) {
    const el = track.current
    if (!el) return
    const i = (target + count) % count
    const rtl = getComputedStyle(el).direction === 'rtl'
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: (rtl ? -1 : 1) * i * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
    setIndex(i)
  }

  const photoOf = (n: number) => t.photoOf.replace('{n}', String(n)).replace('{total}', String(count))

  return (
    <div
      className="product-gallery"
      role={many ? 'region' : undefined}
      aria-roledescription={many ? 'carousel' : undefined}
      aria-label={many ? alt : undefined}
    >
      <div
        ref={track}
        className="product-gallery-track"
        onScroll={many ? onScroll : undefined}
        tabIndex={many ? 0 : undefined}
        onKeyDown={(e) => {
          if (!many) return
          const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            go(index + (rtl ? -1 : 1))
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            go(index + (rtl ? 1 : -1))
          }
        }}
      >
        {images.map((src, i) => (
          <div
            key={`${i}-${src}`}
            className="product-gallery-slide"
            role={many ? 'group' : undefined}
            aria-roledescription={many ? 'slide' : undefined}
            aria-label={many ? photoOf(i + 1) : undefined}
            aria-hidden={many && i !== index ? true : undefined}
          >
            <img src={src} alt={many ? `${alt} (${photoOf(i + 1)})` : alt} loading={i === 0 ? undefined : 'lazy'} draggable={false} />
          </div>
        ))}
      </div>

      {many && (
        <>
          <button type="button" className="gallery-prev" onClick={() => go(index - 1)} aria-label={t.prevPhoto}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="gallery-next" onClick={() => go(index + 1)} aria-label={t.nextPhoto}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <div className="gallery-dots">
            {images.map((src, i) => (
              <button
                type="button"
                key={`${i}-${src}`}
                className={i === index ? 'active' : ''}
                aria-label={photoOf(i + 1)}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
