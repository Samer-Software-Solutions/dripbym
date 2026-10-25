import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { effectivePrice, isSoldOut, type ProductRow } from '../lib/db'
import { useT } from './i18n'
import { Thumb } from './ui'

interface Props {
  products: ProductRow[]
  /** Quantity already in the order, per product id. */
  inOrder: Map<string, number>
  onPick: (productId: string) => void
  disabled?: boolean
}

/**
 * "Add a product" for the order window: a searchable list with photo, price and stock.
 * It stays open after a pick so several products can be added in a row.
 */
export default function ProductPicker({ products, inOrder, onPick, disabled }: Props) {
  const { t, productName, money } = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      [p.name_en, p.name_ar, p.description_en, p.description_ar].some((text) => text?.toLowerCase().includes(q)),
    )
  }, [products, query])

  const canPick = (p: ProductRow) => !isSoldOut(p)

  // Start on the first product that can be added.
  useEffect(() => setActive(Math.max(0, matches.findIndex((p) => !isSoldOut(p)))), [matches])

  // Focus the search field on open, and the "Add a product" button again after closing.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) inputRef.current?.focus()
    else if (wasOpen.current) openButtonRef.current?.focus()
    wasOpen.current = open
  }, [open])

  // Keep the highlighted row visible while moving with the arrow keys.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const pick = (p: ProductRow | undefined) => {
    if (p && canPick(p)) onPick(p.id)
  }

  const move = (step: number) => {
    if (!matches.length) return
    let next = active
    // Skip sold-out rows; give up after one full lap.
    for (let i = 0; i < matches.length; i++) {
      next = (next + step + matches.length) % matches.length
      if (canPick(matches[next])) break
    }
    setActive(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      pick(matches[active])
    } else if (event.key === 'Escape') {
      // Close only the list, not the order window around it.
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  if (!open) {
    return (
      <button
        ref={openButtonRef}
        type="button"
        className="ad-btn ad-btn--secondary ad-picker-open"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <Plus size={18} aria-hidden /> {t.addItemLabel}
      </button>
    )
  }

  const activeProduct = matches[active]

  return (
    <div className="ad-picker">
      <div className="ad-picker-head">
        <div className="ad-search">
          <Search size={18} aria-hidden />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label={t.addItemLabel}
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeProduct ? `${listId}-${activeProduct.id}` : undefined}
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
          />
        </div>
        <button type="button" className="ad-icon-btn" onClick={close} aria-label={t.close} title={t.close}>
          <X size={20} aria-hidden />
        </button>
      </div>

      <ul ref={listRef} id={listId} role="listbox" aria-label={t.addItemLabel} className="ad-picker-list">
        {matches.length === 0 && <li className="ad-picker-empty">{t.noMatch}</li>}
        {matches.map((p, index) => {
          const name = productName(p)
          const price = effectivePrice(p)
          const onSale = price < p.price
          const available = canPick(p)
          const qty = inOrder.get(p.id) ?? 0
          const description = productName({ name_en: p.description_en, name_ar: p.description_ar })
          return (
            <li
              key={p.id}
              id={`${listId}-${p.id}`}
              data-index={index}
              role="option"
              aria-selected={index === active}
              aria-disabled={!available}
              className={`ad-picker-option${index === active ? ' is-active' : ''}${available ? '' : ' is-disabled'}`}
              // Keep focus in the search field so typing and arrow keys keep working.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => available && setActive(index)}
              onClick={() => pick(p)}
            >
              <Thumb src={p.image_url} size={44} />
              <span className="ad-picker-name">
                <strong>{name}</strong>
                {description && description !== name && <span className="ad-muted ad-small">{description}</span>}
                <span className="ad-picker-tags">
                  {qty > 0 && <span className="ad-pill ad-pill--ok">{t.inOrder(qty)}</span>}
                  {!p.active && <span className="ad-badge">{t.hidden}</span>}
                </span>
              </span>
              <span className="ad-picker-meta">
                <span className="ad-picker-price">
                  <strong className={onSale ? 'ad-sale' : undefined}>{money(price)}</strong>
                  {onSale && (
                    <s className="ad-muted ad-small">
                      <span className="ad-sr-only">{t.wasPrice} </span>
                      {money(p.price)}
                    </s>
                  )}
                </span>
                {p.stock === null ? (
                  <span className="ad-pill ad-pill--neutral">{t.unlimited}</span>
                ) : available ? (
                  <span className="ad-small ad-muted">{t.inStockShort(p.stock)}</span>
                ) : (
                  <span className="ad-pill ad-pill--out">{t.soldOut}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
