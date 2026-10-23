import { ArrowRight, Check } from 'lucide-react'
import { useShop } from '../state'

export function AddToast() {
  const { t, toast, dismissToast, setBagOpen } = useShop()
  if (!toast) return null
  return (
    <div className="add-toast" role="status" aria-live="polite">
      <span>
        <Check size={16} aria-hidden="true" />
      </span>
      <div>
        <strong>{t.added}</strong>
        <p>{toast}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          dismissToast()
          setBagOpen(true)
        }}
      >
        {t.viewBag}
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
