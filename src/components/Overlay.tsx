import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const EXIT_MS = 280
const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

interface OverlayProps {
  open: boolean
  onClose: () => void
  variant: 'sheet-right' | 'sheet-left' | 'dialog'
  className?: string
  labelledBy: string
  describedBy?: string
  closeLabel: string
  dir?: 'ltr' | 'rtl'
  children: ReactNode
}

/** Accessible modal used for the bag drawer and product dialog: portal, scroll lock, Esc, focus trap. */
export function Overlay({ open, onClose, variant, className = '', labelledBy, describedBy, closeLabel, dir, children }: OverlayProps) {
  const [mounted, setMounted] = useState(open)
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow, paddingRight } = document.body.style
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`

    // Focus the panel itself so screen readers announce it without scrolling to a button.
    const focusTimer = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 30)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!mounted) return null
  const state = open ? 'open' : 'closed'

  return createPortal(
    <div className="overlay-root" data-state={state}>
      <div className="overlay-backdrop" data-state={state} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        dir={dir}
        data-state={state}
        className={`overlay-panel ${variant} ${className}`}
      >
        {children}
        <button type="button" className="overlay-close" onClick={onClose}>
          <X size={16} aria-hidden="true" />
          <span className="sr-only">{closeLabel}</span>
        </button>
      </div>
    </div>,
    document.body,
  )
}
