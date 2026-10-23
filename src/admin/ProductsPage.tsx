import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { AlertTriangle, CheckCircle2, Minus, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { effectivePrice, isLowStock, isSoldOut, type CategoryRow, type ProductRow, type SettingsRow } from '../lib/db'
import { AdminError, ConflictError, byOrder, updateProduct } from './api'
import { numberToField, parseNumber } from './format'
import { useT } from './i18n'
import { Spinner, Switch, Thumb, useToast } from './ui'
import ProductEditor from './ProductEditor'

interface Props {
  products: ProductRow[]
  setProducts: Dispatch<SetStateAction<ProductRow[]>>
  categories: CategoryRow[]
  settings: SettingsRow | null
  onReload: () => Promise<void>
  reloading: boolean
}

const NO_CATEGORY = '__none'

export default function ProductsPage({ products, setProducts, categories, settings, onReload, reloading }: Props) {
  const { t, categoryName } = useT()
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  // undefined = editor closed, null = new product. This is the row as it was when the editor opened.
  const [editing, setEditing] = useState<ProductRow | null | undefined>(undefined)

  const threshold = settings?.low_stock_threshold ?? 5
  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, categoryName(c)])), [categories, categoryName])

  const replaceProduct = (row: ProductRow) =>
    setProducts((list) => {
      const exists = list.some((p) => p.id === row.id)
      const next = exists ? list.map((p) => (p.id === row.id ? row : p)) : [...list, row]
      return next.sort(byOrder)
    })

  const removeProduct = (id: string) => setProducts((list) => list.filter((p) => p.id !== id))

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryFilter === NO_CATEGORY ? p.category_id !== null : categoryFilter && p.category_id !== categoryFilter) {
        return false
      }
      if (!q) return true
      return [p.name_en, p.name_ar, p.description_en, p.description_ar].some((text) => text?.toLowerCase().includes(q))
    })
  }, [products, query, categoryFilter])

  const hiddenCount = products.filter((p) => !p.active).length
  // The current version of the product open in the editor (kept up to date by live updates).
  const liveEditing = editing ? products.find((p) => p.id === editing.id) ?? null : null

  return (
    <div className="ad-page">
      <StockAlerts products={products} threshold={threshold} onEdit={setEditing} />

      <section className="ad-card ad-products" aria-labelledby="products-title">
        <div className="ad-section-head">
          <div>
            <h1 id="products-title">{t.productsTitle}</h1>
            <p className="ad-muted">
              {t.productCount(products.length)}
              {hiddenCount > 0 && ` · ${t.hiddenCount(hiddenCount)}`}
            </p>
          </div>
          <div className="ad-head-buttons">
            <button
              type="button"
              className="ad-icon-btn ad-icon-btn--bordered"
              onClick={() => void onReload()}
              disabled={reloading}
              aria-label={t.refreshList}
              title={t.refreshList}
            >
              {reloading ? <Spinner size={18} /> : <RefreshCw size={18} aria-hidden />}
            </button>
            <button type="button" className="ad-btn ad-btn--primary" onClick={() => setEditing(null)}>
              <Plus size={18} aria-hidden /> {t.addProduct}
            </button>
          </div>
        </div>

        <div className="ad-toolbar">
          <div className="ad-search">
            <Search size={18} aria-hidden />
            <label htmlFor="product-search" className="ad-sr-only">
              {t.searchLabel}
            </label>
            <input
              id="product-search"
              type="search"
              placeholder={t.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label htmlFor="product-category-filter" className="ad-sr-only">
            {t.filterLabel}
          </label>
          <select id="product-category-filter" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">{t.allCategories}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c)}
              </option>
            ))}
            <option value={NO_CATEGORY}>{t.noCategory}</option>
          </select>
        </div>

        {products.length === 0 ? (
          <div className="ad-empty">
            <p>{t.noProducts}</p>
            <button type="button" className="ad-btn ad-btn--primary" onClick={() => setEditing(null)}>
              <Plus size={18} aria-hidden /> {t.addFirstProduct}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="ad-empty">
            <p>{t.noMatch}</p>
            <button
              type="button"
              className="ad-btn ad-btn--ghost"
              onClick={() => {
                setQuery('')
                setCategoryFilter('')
              }}
            >
              {t.clearFilters}
            </button>
          </div>
        ) : (
          <>
            <div className="ad-prow ad-prow--head" aria-hidden>
              <span />
              <span>{t.colName}</span>
              <span className="ad-prow-meta">
                <span>{t.colCategory}</span>
                <span>{t.colPrice}</span>
              </span>
              <span>{t.colStock}</span>
              <span>{t.colOnShop}</span>
              <span />
            </div>
            <ul className="ad-plist">
              {visible.map((p) => (
                <ProductListItem
                  key={p.id}
                  product={p}
                  categoryName={p.category_id ? categoryNames.get(p.category_id) ?? '—' : t.noCategory}
                  threshold={threshold}
                  onEdit={() => setEditing(p)}
                  onUpdated={replaceProduct}
                  onRemoved={removeProduct}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {editing !== undefined && (
        <ProductEditor
          key={editing?.id ?? 'new'}
          product={editing}
          liveProduct={liveEditing}
          categories={categories}
          products={products}
          onClose={() => setEditing(undefined)}
          onSaved={(row) => {
            replaceProduct(row)
            setEditing(undefined)
          }}
          onLatest={replaceProduct}
          onRemoved={removeProduct}
          onDeleted={(id) => {
            removeProduct(id)
            setEditing(undefined)
          }}
        />
      )}
    </div>
  )
}

/* ---------- Low stock / sold out ---------- */

function StockAlerts({
  products,
  threshold,
  onEdit,
}: {
  products: ProductRow[]
  threshold: number
  onEdit: (product: ProductRow) => void
}) {
  const { t, productName } = useT()
  const soldOut = products.filter(isSoldOut)
  const low = products
    .filter((p) => isLowStock(p, threshold))
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0) || a.name_en.localeCompare(b.name_en))

  const chip = (p: ProductRow, tone: 'out' | 'low') => (
    <li key={p.id}>
      <button type="button" className={`ad-chip ad-chip--${tone}`} onClick={() => onEdit(p)}>
        <Thumb src={p.image_url} size={28} />
        <span className="ad-chip-name">{productName(p)}</span>
        <span className="ad-chip-count">{t.left(p.stock ?? 0)}</span>
        {!p.active && <span className="ad-badge">{t.hidden}</span>}
      </button>
    </li>
  )

  return (
    <section className="ad-card ad-alerts" aria-labelledby="alerts-title">
      <h2 id="alerts-title">{t.stockAlerts}</h2>
      {soldOut.length === 0 && low.length === 0 ? (
        <p className="ad-alerts-ok">
          <CheckCircle2 size={20} aria-hidden /> {t.allStocked(threshold)}
        </p>
      ) : (
        <div className="ad-alert-groups">
          {soldOut.length > 0 && (
            <div className="ad-alert-group">
              <h3 className="ad-alert-title ad-alert-title--out">
                <AlertTriangle size={16} aria-hidden /> {t.soldOut} ({soldOut.length})
              </h3>
              <ul className="ad-chips">{soldOut.map((p) => chip(p, 'out'))}</ul>
            </div>
          )}
          {low.length > 0 && (
            <div className="ad-alert-group">
              <h3 className="ad-alert-title ad-alert-title--low">
                <AlertTriangle size={16} aria-hidden /> {t.runningLow} ({low.length})
              </h3>
              <ul className="ad-chips">{low.map((p) => chip(p, 'low'))}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/* ---------- One product in the list ---------- */

interface ItemProps {
  product: ProductRow
  categoryName: string
  threshold: number
  onEdit: () => void
  onUpdated: (row: ProductRow) => void
  onRemoved: (id: string) => void
}

function ProductListItem({ product, categoryName, threshold, onEdit, onUpdated, onRemoved }: ItemProps) {
  const { t, productName, errorText, money } = useT()
  const toast = useToast()
  const [toggling, setToggling] = useState(false)
  const name = productName(product)
  const onSale = product.discount_price != null && product.discount_price < product.price

  async function toggleActive(active: boolean) {
    setToggling(true)
    try {
      const row = await updateProduct(product.id, { active })
      onUpdated(row)
      toast.success(active ? t.nowVisible(productName(row)) : t.nowHidden(productName(row)))
    } catch (e) {
      if (e instanceof AdminError && e.code === 'deleted') {
        onRemoved(product.id)
        toast.error(t.deletedElsewhere(name))
      } else {
        toast.error(t.updateFailed(name, errorText(e)))
      }
    } finally {
      setToggling(false)
    }
  }

  return (
    <li className={`ad-prow${product.active ? '' : ' is-hidden'}`}>
      <button type="button" className="ad-prow-thumb" onClick={onEdit} tabIndex={-1} aria-hidden>
        <Thumb src={product.image_url} size={56} />
      </button>
      <div className="ad-prow-name">
        <button type="button" className="ad-link-btn" onClick={onEdit}>
          {name}
        </button>
        {product.description_en && (
          <span className="ad-muted ad-small">
            {productName({ name_en: product.description_en, name_ar: product.description_ar })}
          </span>
        )}
        {!product.active && <span className="ad-badge">{t.hidden}</span>}
      </div>
      <div className="ad-prow-meta">
        <span className="ad-prow-cat">{categoryName}</span>
        <span className="ad-prow-price">
          {onSale ? (
            <>
              <strong className="ad-sale">{money(effectivePrice(product))}</strong>{' '}
              <s className="ad-muted">
                <span className="ad-sr-only">{t.wasPrice} </span>
                {money(product.price)}
              </s>
            </>
          ) : (
            <strong>{money(product.price)}</strong>
          )}
        </span>
      </div>
      <div className="ad-prow-stock">
        <StockControl product={product} threshold={threshold} onSaved={onUpdated} onRemoved={onRemoved} />
      </div>
      <div className="ad-prow-vis">
        <Switch checked={product.active} onChange={toggleActive} busy={toggling} label={t.showOnShop(name)} hideLabel />
        <span className="ad-small ad-muted" aria-hidden>
          {product.active ? t.visible : t.hidden}
        </span>
      </div>
      <div className="ad-prow-edit">
        <button type="button" className="ad-icon-btn ad-icon-btn--bordered" onClick={onEdit} aria-label={t.editProduct(name)}>
          <Pencil size={18} aria-hidden />
        </button>
      </div>
    </li>
  )
}

/* ---------- Quick stock editing ---------- */

function StockControl({
  product,
  threshold,
  onSaved,
  onRemoved,
}: {
  product: ProductRow
  threshold: number
  onSaved: (row: ProductRow) => void
  onRemoved: (id: string) => void
}) {
  const { t, productName, errorText } = useT()
  const toast = useToast()
  const name = productName(product)
  // `basis` is the stock value the draft started from; the save only goes through if the
  // database still has that value (otherwise someone else changed it meanwhile).
  const [basis, setBasis] = useState(product.stock)
  const [draft, setDraft] = useState(numberToField(product.stock))
  const [saving, setSaving] = useState(false)
  const inputId = `stock-${product.id}`

  const parsed = parseNumber(draft)
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 0)
  const dirty = valid ? parsed !== basis : true

  // Follow live stock changes, unless the user has an unsaved change of their own.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (dirtyRef.current) return
    setBasis(product.stock)
    setDraft(numberToField(product.stock))
  }, [product.stock])

  const reset = (stock: number | null) => {
    setBasis(stock)
    setDraft(numberToField(stock))
  }

  const step = (delta: number) => {
    if (parsed === null || !valid) return
    setDraft(String(Math.max(0, parsed + delta)))
  }

  async function save() {
    if (!valid) {
      toast.error(t.stockInvalid)
      return
    }
    if (!dirty || saving) return
    setSaving(true)
    try {
      const row = await updateProduct(product.id, { stock: parsed }, { stock: basis })
      reset(row.stock)
      onSaved(row)
      toast.success(row.stock === null ? t.stockSetUnlimited(productName(row)) : t.stockSet(productName(row), row.stock))
    } catch (e) {
      if (e instanceof ConflictError) {
        const latest = e.latest as ProductRow
        reset(latest.stock)
        onSaved(latest)
        toast.error(t.stockConflict(name, latest.stock === null ? t.unlimited : String(latest.stock)))
      } else if (e instanceof AdminError && e.code === 'deleted') {
        onRemoved(product.id)
        toast.error(t.deletedElsewhere(name))
      } else {
        toast.error(t.stockFailed(name, errorText(e)))
      }
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void save()
    } else if (event.key === 'Escape') {
      reset(product.stock)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      step(1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      step(-1)
    }
  }

  let status: { text: string; tone: string } | null = null
  if (product.stock === null) status = { text: t.unlimited, tone: 'neutral' }
  else if (isSoldOut(product)) status = { text: t.soldOut, tone: 'out' }
  else if (isLowStock(product, threshold)) status = { text: t.low, tone: 'low' }

  return (
    <div className="ad-stock">
      <div className="ad-stepper">
        <button
          type="button"
          className="ad-step-btn"
          onClick={() => step(-1)}
          disabled={saving || parsed === null || !valid || parsed <= 0}
          aria-label={t.oneLess(name)}
        >
          <Minus size={18} aria-hidden />
        </button>
        <label htmlFor={inputId} className="ad-sr-only">
          {t.stockFor(name)}
        </label>
        <input
          id={inputId}
          className={`ad-stock-input${valid ? '' : ' is-invalid'}`}
          type="text"
          inputMode="numeric"
          placeholder="∞"
          title={t.blankUnlimited}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={saving}
          aria-invalid={!valid}
        />
        <button
          type="button"
          className="ad-step-btn"
          onClick={() => step(1)}
          disabled={saving || parsed === null || !valid}
          aria-label={t.oneMore(name)}
        >
          <Plus size={18} aria-hidden />
        </button>
      </div>
      {dirty ? (
        <span className="ad-stock-actions">
          <button
            type="button"
            className="ad-btn ad-btn--primary ad-btn--small"
            onClick={() => void save()}
            disabled={saving || !valid}
          >
            {saving && <Spinner size={14} />}
            {t.save}
          </button>
          <button
            type="button"
            className="ad-btn ad-btn--ghost ad-btn--small"
            onClick={() => reset(product.stock)}
            disabled={saving}
          >
            {t.undo}
          </button>
        </span>
      ) : (
        status && <span className={`ad-pill ad-pill--${status.tone}`}>{status.text}</span>
      )}
    </div>
  )
}
