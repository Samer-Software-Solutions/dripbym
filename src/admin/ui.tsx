// Shared building blocks for the admin panel: toasts, dialogs, form fields.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertCircle, CheckCircle2, ImageOff, Languages, Loader2, X } from 'lucide-react'
import { useT } from './i18n'

/* ---------- Toasts ---------- */

interface Toast {
  id: number
  kind: 'success' | 'error'
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useT()
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((item) => item.id !== id)), [])

  const push = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 3500)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ad-toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`ad-toast ad-toast--${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            {toast.kind === 'success' ? <CheckCircle2 size={18} aria-hidden /> : <AlertCircle size={18} aria-hidden />}
            <span>{toast.message}</span>
            <button
              type="button"
              className="ad-icon-btn ad-icon-btn--small"
              onClick={() => dismiss(toast.id)}
              aria-label={t.dismiss}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside ToastProvider')
  return api
}

/* ---------- Spinner ---------- */

export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span className="ad-spinner" role={label ? 'status' : undefined}>
      <Loader2 size={size} aria-hidden />
      {label && <span>{label}</span>}
    </span>
  )
}

/* ---------- Language switch ---------- */

export function LangToggle({ className = '' }: { className?: string }) {
  const { t, toggleLang } = useT()
  return (
    <button
      type="button"
      className={`ad-btn ad-btn--small ad-lang ${className}`}
      onClick={toggleLang}
      aria-label={t.switchLangLabel}
      lang={t.switchLang === 'English' ? 'en' : 'ar'}
    >
      <Languages size={16} aria-hidden />
      <span>{t.switchLang}</span>
    </button>
  )
}

/* ---------- Modal ---------- */

// Stack of open dialogs, so Escape / focus trapping only affect the top one.
const modalStack: number[] = []
let modalCounter = 0

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'small' | 'large'
  closeOnBackdrop?: boolean
  /** Prevents closing (e.g. while saving). */
  locked?: boolean
}

export function Modal({ title, onClose, children, footer, size = 'small', closeOnBackdrop = true, locked = false }: ModalProps) {
  const { t } = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  const lockedRef = useRef(locked)
  closeRef.current = onClose
  lockedRef.current = locked

  useEffect(() => {
    const id = ++modalCounter
    modalStack.push(id)
    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current

    // Focus the first form field (or the dialog itself). On touch screens focus the dialog
    // instead, so the on-screen keyboard doesn't pop up over the form straight away.
    const touch = window.matchMedia?.('(pointer: coarse)').matches
    const first = (!touch && dialog?.querySelector<HTMLElement>('[data-autofocus]')) || dialog
    first?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id || !dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!lockedRef.current) closeRef.current()
      } else if (event.key === 'Tab') {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
        if (!items.length) return
        const firstItem = items[0]
        const lastItem = items[items.length - 1]
        if (event.shiftKey && (document.activeElement === firstItem || document.activeElement === dialog)) {
          event.preventDefault()
          lastItem.focus()
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault()
          firstItem.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      const index = modalStack.indexOf(id)
      if (index !== -1) modalStack.splice(index, 1)
      if (modalStack.length === 0) document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return (
    <div
      className="ad-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop && !locked) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={`ad-modal ad-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* Plain divs: the shop stylesheet styles bare <header>/<footer> elements. */}
        <div className="ad-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ad-icon-btn" onClick={onClose} disabled={locked} aria-label={t.close}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="ad-modal-body">{children}</div>
        {footer && <div className="ad-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Confirm dialog ---------- */

interface ConfirmProps {
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  danger?: boolean
  /** Optional middle action, e.g. "Hide instead". */
  secondary?: { label: string; onClick: () => void }
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, busy, danger, secondary }: ConfirmProps) {
  const { t } = useT()
  return (
    <Modal
      title={title}
      onClose={onCancel}
      locked={busy}
      footer={
        <>
          <button type="button" className="ad-btn ad-btn--ghost" onClick={onCancel} disabled={busy} data-autofocus>
            {t.cancel}
          </button>
          {secondary && (
            <button type="button" className="ad-btn ad-btn--secondary" onClick={secondary.onClick} disabled={busy}>
              {secondary.label}
            </button>
          )}
          <button
            type="button"
            className={`ad-btn ${danger ? 'ad-btn--danger' : 'ad-btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Spinner size={16} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="ad-confirm-text">{message}</div>
    </Modal>
  )
}

/* ---------- Form pieces ---------- */

interface FieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  return (
    <div className={`ad-field${error ? ' ad-field--error' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <p className="ad-field-error" id={`${htmlFor}-error`}>
          {error}
        </p>
      ) : (
        hint && (
          <p className="ad-field-hint" id={`${htmlFor}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/** aria-describedby value matching the hint / error rendered by <Field>. */
export const describedBy = (id: string, error?: string, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** Visually hide the label (it is still read by screen readers). */
  hideLabel?: boolean
  disabled?: boolean
  busy?: boolean
  id?: string
}

export function Switch({ checked, onChange, label, hideLabel, disabled, busy, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      className={`ad-switch${checked ? ' is-on' : ''}${busy ? ' is-busy' : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled || busy}
    >
      <span className="ad-switch-track" aria-hidden>
        <span className="ad-switch-thumb" />
      </span>
      <span className={hideLabel ? 'ad-sr-only' : 'ad-switch-label'}>{label}</span>
    </button>
  )
}

/* ---------- Product thumbnail ---------- */

export function Thumb({ src, alt = '', size = 48 }: { src: string; alt?: string; size?: number }) {
  const { t } = useT()
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  const style = { width: size, height: size }
  if (!src || broken) {
    return (
      <span className="ad-thumb ad-thumb--empty" style={style} aria-hidden={!alt} title={alt ? t.noPhoto(alt) : undefined}>
        <ImageOff size={Math.round(size * 0.4)} aria-hidden />
      </span>
    )
  }
  return <img className="ad-thumb" style={style} src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
}
