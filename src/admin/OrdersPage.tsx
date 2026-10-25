import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, Bell, BellOff, MessageCircle, Minus, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import {
  PENDING_ORDER_LIFETIME_HOURS,
  effectivePrice,
  type OrderItem,
  type OrderRow,
  type OrderStatus,
  type ProductRow,
} from '../lib/db'
import { AdminError, ConflictError, approveOrder, cancelOrder, reopenOrder, updateOrderItems } from './api'
import { normalizeDigits, roundMoney } from './format'
import { useT, type Dict, type Lang } from './i18n'
import { ConfirmDialog, Modal, Spinner, Thumb, useToast } from './ui'
import ProductPicker from './ProductPicker'
import PushToggle from './PushToggle'

interface Props {
  orders: OrderRow[]
  setOrders: Dispatch<SetStateAction<OrderRow[]>>
  products: ProductRow[]
  soundOn: boolean
  onToggleSound: () => void
  onReload: () => Promise<void>
  reloading: boolean
}

type Filter = OrderStatus | 'all'

const FILTERS: { id: Filter; label: (t: Dict) => string }[] = [
  { id: 'pending', label: (t) => t.statusPending },
  { id: 'approved', label: (t) => t.statusApproved },
  { id: 'cancelled', label: (t) => t.statusCancelled },
  { id: 'all', label: (t) => t.statusAll },
]

/* ---------- Helpers ---------- */

/** Why a product in an order can't be taken out of stock right now. */
type LineProblem = { kind: 'missing' } | { kind: 'short'; stock: number; needed: number }

/** Checks an order's items against the live stock. Keyed by product id. */
function stockProblems(items: OrderItem[], productsById: Map<string, ProductRow>): Map<string, LineProblem> {
  const problems = new Map<string, LineProblem>()
  for (const item of items) {
    const product = productsById.get(item.product_id)
    if (!product) problems.set(item.product_id, { kind: 'missing' })
    else if (product.stock !== null && product.stock < item.qty) {
      problems.set(item.product_id, { kind: 'short', stock: product.stock, needed: item.qty })
    }
  }
  return problems
}

const unitCount = (items: OrderItem[]) => items.reduce((sum, item) => sum + item.qty, 0)
const itemsSubtotal = (items: OrderItem[]) => roundMoney(items.reduce((sum, item) => sum + item.unit_price * item.qty, 0))
const sameItems = (a: OrderItem[], b: OrderItem[]) =>
  a.length === b.length && a.every((item, i) => item.product_id === b[i].product_id && item.qty === b[i].qty)

const formatPhone = (digits: string) => `+974 ${digits.slice(0, 4)} ${digits.slice(4)}`
const whatsAppLink = (digits: string) => `https://wa.me/974${digits}`

// Western digits in both languages, like the rest of the panel.
const locale = (lang: Lang) => (lang === 'ar' ? 'ar-QA-u-nu-latn' : 'en-GB')

function timeAgo(iso: string, now: number, lang: Lang): string {
  const format = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' })
  const minutes = Math.round((Date.parse(iso) - now) / 60_000)
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return format.format(hours, 'hour')
  return format.format(Math.round(hours / 24), 'day')
}

const dateTime = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

/** Whole hours until a pending order is removed automatically. */
const hoursLeft = (order: OrderRow, now: number) =>
  Math.max(0, Math.ceil((Date.parse(order.pending_since) + PENDING_ORDER_LIFETIME_HOURS * 3_600_000 - now) / 3_600_000))

/** Re-renders every minute so "5 min ago" and "removed in 12 h" stay current. */
function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useT()
  const [text, tone] =
    status === 'pending'
      ? [t.statusPending, 'low']
      : status === 'approved'
        ? [t.statusApproved, 'ok']
        : [t.statusCancelled, 'neutral']
  return <span className={`ad-pill ad-pill--${tone}`}>{text}</span>
}

/* ---------- Page ---------- */

export default function OrdersPage({ orders, setOrders, products, soundOn, onToggleSound, onReload, reloading }: Props) {
  const { t, lang, productName, money } = useT()
  const [filter, setFilter] = useState<Filter>('pending')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const now = useNow()

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { pending: 0, approved: 0, cancelled: 0, all: orders.length }
    for (const order of orders) result[order.status]++
    return result
  }, [orders])

  const visible = useMemo(() => {
    const q = normalizeDigits(query).trim().toLowerCase().replace(/^#/, '')
    const digits = q.replace(/\D/g, '')
    return orders.filter((order) => {
      if (filter !== 'all' && order.status !== filter) return false
      if (!q) return true
      return (
        String(order.number).includes(q) ||
        order.customer_name.toLowerCase().includes(q) ||
        (digits !== '' && order.customer_phone.includes(digits))
      )
    })
  }, [orders, filter, query])

  const replaceOrder = (row: OrderRow) => setOrders((list) => list.map((order) => (order.id === row.id ? row : order)))
  const removeOrder = (id: string) => setOrders((list) => list.filter((order) => order.id !== id))

  return (
    <div className="ad-page">
      <section className="ad-card ad-orders" aria-labelledby="orders-title">
        <div className="ad-section-head">
          <div>
            <h1 id="orders-title">{t.ordersTitle}</h1>
            <p className="ad-muted">{t.ordersWaiting(counts.pending)}</p>
          </div>
          <div className="ad-head-buttons">
            <button
              type="button"
              className="ad-icon-btn ad-icon-btn--bordered"
              onClick={onToggleSound}
              aria-label={soundOn ? t.soundOnLabel : t.soundOffLabel}
              title={soundOn ? t.soundOnLabel : t.soundOffLabel}
            >
              {soundOn ? <Bell size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
            </button>
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
          </div>
        </div>

        <PushToggle />

        <div className="ad-toolbar ad-orders-toolbar">
          <div className="ad-segment" role="group" aria-label={t.statusFilter}>
            {FILTERS.map(({ id, label }) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label(t)}
                <span className="ad-segment-count">{counts[id]}</span>
              </button>
            ))}
          </div>
          <div className="ad-search">
            <Search size={18} aria-hidden />
            <label htmlFor="order-search" className="ad-sr-only">
              {t.searchOrders}
            </label>
            <input
              id="order-search"
              type="search"
              placeholder={t.searchOrdersPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="ad-empty">
            <p>{t.noOrders}</p>
            <p className="ad-small">{t.ordersHint}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="ad-empty">
            <p>{t.noOrdersHere}</p>
          </div>
        ) : (
          <ul className="ad-olist">
            {visible.map((order) => {
              const pending = order.status === 'pending'
              const blocked = pending && stockProblems(order.items, productsById).size > 0
              return (
                <li key={order.id}>
                  <button type="button" className={`ad-orow ad-orow--${order.status}`} onClick={() => setOpenId(order.id)}>
                    <span className="ad-orow-who">
                      <span className="ad-orow-title">
                        <strong dir="ltr">#{order.number}</strong>
                        <span className="ad-orow-name">{order.customer_name}</span>
                      </span>
                      <span className="ad-muted ad-small" dir="ltr">
                        {formatPhone(order.customer_phone)}
                      </span>
                    </span>
                    <span className="ad-orow-items ad-small">
                      {order.items.map((item) => `${productName(item)} × ${item.qty}`).join(lang === 'ar' ? '، ' : ', ')}
                    </span>
                    <span className="ad-orow-total">
                      <strong>{money(order.total)}</strong>
                      <span className="ad-muted ad-small">{t.itemCount(unitCount(order.items))}</span>
                    </span>
                    <span className="ad-orow-status">
                      <span className="ad-orow-pills">
                        <StatusPill status={order.status} />
                        {blocked && <span className="ad-pill ad-pill--out">{t.notEnoughStock}</span>}
                      </span>
                      <span className="ad-muted ad-small">{timeAgo(order.created_at, now, lang)}</span>
                      {pending && <span className="ad-muted ad-small">{t.removedIn(hoursLeft(order, now))}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {openId && (
        <OrderDialog
          key={openId}
          order={orders.find((order) => order.id === openId) ?? null}
          products={products}
          productsById={productsById}
          now={now}
          onClose={() => setOpenId(null)}
          onUpdated={replaceOrder}
          onRemoved={removeOrder}
        />
      )}
    </div>
  )
}

/* ---------- One order ---------- */

interface DialogProps {
  /** The live order, or null once it no longer exists. */
  order: OrderRow | null
  products: ProductRow[]
  productsById: Map<string, ProductRow>
  now: number
  onClose: () => void
  onUpdated: (row: OrderRow) => void
  onRemoved: (id: string) => void
}

function OrderDialog({ order, products, productsById, now, onClose, onUpdated, onRemoved }: DialogProps) {
  const { t, lang, productName, money, errorText } = useT()
  const toast = useToast()
  // The version the draft started from: what is shown, and what saves are checked against.
  const [base, setBase] = useState<OrderRow | null>(order)
  const [draft, setDraft] = useState<OrderItem[]>(order?.items ?? [])
  const [busy, setBusy] = useState<'save' | 'approve' | 'cancel' | 'reopen' | null>(null)
  const [confirm, setConfirm] = useState<'approve' | 'cancel' | 'reopen' | 'discard' | null>(null)

  const dirty = base !== null && !sameItems(draft, base.items)

  // Follow live changes from other devices, unless there are unsaved edits here.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (!order || dirtyRef.current) return
    setBase(order)
    setDraft(order.items)
  }, [order])

  if (!base) {
    return (
      <Modal title={t.ordersTitle} onClose={onClose}>
        <p>{t.orderGone}</p>
      </Modal>
    )
  }

  const gone = order === null
  const changedElsewhere = !gone && order.updated_at !== base.updated_at
  const pending = base.status === 'pending' && !gone
  const editable = pending && busy === null
  const problems = pending ? stockProblems(draft, productsById) : new Map<string, LineProblem>()
  const subtotal = itemsSubtotal(draft)
  const canApprove = pending && !dirty && draft.length > 0 && problems.size === 0 && !changedElsewhere

  const setQty = (productId: string, qty: number) =>
    setDraft((items) => items.map((item) => (item.product_id === productId ? { ...item, qty: Math.min(99, Math.max(1, qty)) } : item)))

  const removeItem = (productId: string) => setDraft((items) => items.filter((item) => item.product_id !== productId))

  const addItem = (productId: string) => {
    const product = productsById.get(productId)
    if (!product) return
    setDraft((items) =>
      items.some((item) => item.product_id === productId)
        ? items.map((item) => (item.product_id === productId ? { ...item, qty: Math.min(99, item.qty + 1) } : item))
        : [
            ...items,
            {
              product_id: product.id,
              name_en: product.name_en,
              name_ar: product.name_ar,
              image_url: product.image_url,
              unit_price: effectivePrice(product),
              qty: 1,
            },
          ],
    )
  }

  const loadLatest = () => {
    if (!order) return
    setBase(order)
    setDraft(order.items)
  }

  async function run(
    kind: 'save' | 'approve' | 'cancel' | 'reopen',
    action: () => Promise<OrderRow>,
    done: (row: OrderRow) => string,
    failed: (message: string) => string,
  ) {
    if (!base) return
    setBusy(kind)
    try {
      const row = await action()
      onUpdated(row)
      setBase(row)
      setDraft(row.items)
      setConfirm(null)
      toast.success(done(row))
      // After approving or cancelling you're done with the order; after an undo you may want to edit it.
      if (kind === 'approve' || kind === 'cancel') onClose()
    } catch (e) {
      setConfirm(null)
      if (e instanceof ConflictError) {
        const latest = e.latest as OrderRow
        onUpdated(latest)
        setBase(latest)
        setDraft(latest.items)
        toast.error(t.orderConflict)
      } else if (e instanceof AdminError && e.code === 'deleted') {
        onRemoved(base.id)
        toast.error(t.orderGone)
      } else {
        toast.error(failed(errorText(e)))
      }
    } finally {
      setBusy(null)
    }
  }

  const save = () =>
    run(
      'save',
      () => updateOrderItems(base, draft.map(({ product_id, qty }) => ({ product_id, qty }))),
      (row) => t.orderSaved(row.number),
      t.orderSaveFailed,
    )
  const approve = () => run('approve', () => approveOrder(base), (row) => t.orderApproved(row.number), t.approveFailed)
  const cancel = () => run('cancel', () => cancelOrder(base), (row) => t.orderCancelled(row.number), t.cancelFailed)
  const reopen = () => run('reopen', () => reopenOrder(base), (row) => t.orderReopened(row.number), t.reopenFailed)

  const requestClose = () => (dirty && !gone ? setConfirm('discard') : onClose())

  const problemText = (problem: LineProblem) =>
    problem.kind === 'missing' ? t.problemMissing : t.problemShort(problem.stock, problem.needed)

  const footer = (
    <>
      {(pending || (base.status === 'approved' && !gone)) && (
        <button
          type="button"
          className="ad-btn ad-btn--danger-ghost ad-foot-start"
          onClick={() => setConfirm('cancel')}
          disabled={busy !== null}
        >
          {t.cancelOrder}
        </button>
      )}
      {pending && dirty ? (
        <>
          <button type="button" className="ad-btn ad-btn--ghost" onClick={loadLatest} disabled={busy !== null}>
            {t.discard}
          </button>
          <button
            type="button"
            className="ad-btn ad-btn--primary"
            onClick={() => void save()}
            disabled={busy !== null || draft.length === 0}
          >
            {busy === 'save' && <Spinner size={16} />}
            {t.saveChanges}
          </button>
        </>
      ) : pending ? (
        <button
          type="button"
          className="ad-btn ad-btn--primary"
          onClick={() => setConfirm('approve')}
          disabled={!canApprove || busy !== null}
          aria-describedby={problems.size > 0 ? 'order-cant-approve' : undefined}
        >
          {t.approve}
        </button>
      ) : (
        <>
          {!gone && base.status !== 'pending' && (
            <button
              type="button"
              className="ad-btn ad-btn--secondary"
              onClick={() => setConfirm('reopen')}
              disabled={busy !== null}
            >
              {base.status === 'approved' ? t.undoApproval : t.undoCancel}
            </button>
          )}
          <button type="button" className="ad-btn ad-btn--ghost" onClick={onClose} disabled={busy !== null}>
            {t.close}
          </button>
        </>
      )}
    </>
  )

  return (
    <>
      <Modal title={t.orderNumber(base.number)} onClose={requestClose} size="large" locked={busy !== null} footer={footer}>
        <div className="ad-order">
          {gone && <p className="ad-notice ad-notice--error">{t.orderGone}</p>}
          {changedElsewhere && dirty && (
            <div className="ad-notice">
              <p>{t.orderChangedElsewhere}</p>
              <button type="button" className="ad-btn ad-btn--secondary ad-btn--small" onClick={loadLatest}>
                {t.loadLatestVersion}
              </button>
            </div>
          )}

          <dl className="ad-order-info">
            <div>
              <dt>{t.customer}</dt>
              <dd>
                <strong>{base.customer_name}</strong>
              </dd>
            </div>
            <div>
              <dt>{t.phone}</dt>
              <dd className="ad-order-phone">
                <span dir="ltr">{formatPhone(base.customer_phone)}</span>
                <a className="ad-btn ad-btn--secondary ad-btn--small" href={whatsAppLink(base.customer_phone)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={16} aria-hidden /> {t.chatOnWhatsApp}
                  <span className="ad-sr-only"> {t.opensNewTab}</span>
                </a>
              </dd>
            </div>
            <div>
              <dt>{t.deliveryArea}</dt>
              <dd>{base.zone === 'outside' ? t.zoneOutside : t.zoneInside}</dd>
            </div>
            <div>
              <dt>{t.status}</dt>
              <dd>
                <StatusPill status={base.status} />
              </dd>
            </div>
            <div>
              <dt>{t.placed}</dt>
              <dd>
                {dateTime(base.created_at, lang)} <span className="ad-muted">· {timeAgo(base.created_at, now, lang)}</span>
                {pending && <span className="ad-muted ad-small ad-block">{t.removedIn(hoursLeft(base, now))}</span>}
              </dd>
            </div>
            {base.approved_at && (
              <div>
                <dt>{t.approvedOn}</dt>
                <dd>{dateTime(base.approved_at, lang)}</dd>
              </div>
            )}
            {base.cancelled_at && (
              <div>
                <dt>{t.cancelledOn}</dt>
                <dd>{dateTime(base.cancelled_at, lang)}</dd>
              </div>
            )}
          </dl>

          <section aria-labelledby="order-items-title">
            <h3 id="order-items-title" className="ad-order-heading">
              {t.items}
            </h3>
            <ul className="ad-olines">
              {draft.map((item) => {
                const name = productName(item)
                const product = productsById.get(item.product_id)
                const problem = problems.get(item.product_id)
                return (
                  <li key={item.product_id} className={`ad-oline${problem ? ' has-problem' : ''}`}>
                    <Thumb src={item.image_url || product?.image_url || ''} size={48} />
                    <div className="ad-oline-name">
                      <strong>{name}</strong>
                      <span className="ad-muted ad-small">{t.each(money(item.unit_price))}</span>
                      {problem ? (
                        <span className="ad-oline-problem">
                          <AlertTriangle size={14} aria-hidden /> {problemText(problem)}
                        </span>
                      ) : (
                        pending &&
                        product &&
                        product.stock !== null && <span className="ad-muted ad-small">{t.inStockShort(product.stock)}</span>
                      )}
                    </div>
                    {pending ? (
                      <div className="ad-stepper ad-oline-qty">
                        <button
                          type="button"
                          className="ad-step-btn"
                          onClick={() => setQty(item.product_id, item.qty - 1)}
                          disabled={!editable || item.qty <= 1}
                          aria-label={t.oneLessItem(name)}
                        >
                          <Minus size={16} aria-hidden />
                        </button>
                        <span className="ad-qty" aria-label={t.qtyFor(name)} role="status">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          className="ad-step-btn"
                          onClick={() => setQty(item.product_id, item.qty + 1)}
                          disabled={!editable || item.qty >= 99}
                          aria-label={t.oneMoreItem(name)}
                        >
                          <Plus size={16} aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <span className="ad-oline-qty ad-oline-qty--fixed">× {item.qty}</span>
                    )}
                    <strong className="ad-oline-total">{money(roundMoney(item.unit_price * item.qty))}</strong>
                    {pending && (
                      <button
                        type="button"
                        className="ad-icon-btn ad-icon-btn--danger ad-oline-remove"
                        onClick={() => removeItem(item.product_id)}
                        disabled={!editable}
                        aria-label={t.removeItem(name)}
                        title={t.removeItem(name)}
                      >
                        <Trash2 size={18} aria-hidden />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>

            {draft.length === 0 && <p className="ad-notice">{t.emptyOrder}</p>}

            {pending && (
              <div className="ad-order-add">
                <ProductPicker
                  products={products}
                  inOrder={new Map(draft.map((item) => [item.product_id, item.qty]))}
                  onPick={addItem}
                  disabled={!editable}
                />
              </div>
            )}
          </section>

          <dl className="ad-order-totals">
            <div>
              <dt>{t.subtotal}</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            <div>
              <dt>
                {t.deliveryFee} <span className="ad-muted">({base.zone === 'outside' ? t.zoneOutside : t.zoneInside})</span>
              </dt>
              <dd>{base.delivery_fee ? money(base.delivery_fee) : t.free}</dd>
            </div>
            <div className="ad-order-grand">
              <dt>{t.total}</dt>
              <dd>{money(roundMoney(subtotal + base.delivery_fee))}</dd>
            </div>
          </dl>

          {problems.size > 0 && (
            <div className="ad-notice ad-notice--error ad-order-blocked" id="order-cant-approve">
              <p>
                <strong>{t.cantApproveTitle}</strong>
              </p>
              <ul>
                {draft
                  .filter((item) => problems.has(item.product_id))
                  .map((item) => (
                    <li key={item.product_id}>
                      {productName(item)}: {problemText(problems.get(item.product_id)!)}
                    </li>
                  ))}
              </ul>
              <p className="ad-order-blocked-hint">{t.cantApproveHint}</p>
            </div>
          )}
          {pending && dirty && problems.size === 0 && draft.length > 0 && (
            <p className="ad-muted ad-small">{t.saveBeforeApprove}</p>
          )}
        </div>
      </Modal>

      {confirm === 'approve' && (
        <ConfirmDialog
          title={t.approveTitle(base.number)}
          message={
            <>
              <p>{t.approveText}</p>
              <ul className="ad-stock-changes">
                {base.items.map((item) => {
                  const stock = productsById.get(item.product_id)?.stock ?? null
                  return (
                    <li key={item.product_id}>
                      <span>
                        {productName(item)} × {item.qty}
                      </span>
                      <span className="ad-muted" dir="ltr">
                        {stock === null ? t.stockNotTracked : t.stockChange(stock, stock - item.qty)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          }
          confirmLabel={t.approve}
          busy={busy === 'approve'}
          onConfirm={() => void approve()}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm === 'cancel' && (
        <ConfirmDialog
          title={t.cancelOrderTitle(base.number)}
          message={<p>{base.status === 'approved' ? t.cancelApprovedText : t.cancelPendingText}</p>}
          confirmLabel={t.cancelOrder}
          cancelLabel={t.keepOrder}
          danger
          busy={busy === 'cancel'}
          onConfirm={() => void cancel()}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm === 'reopen' && (
        <ConfirmDialog
          title={base.status === 'approved' ? t.undoApprovalTitle(base.number) : t.undoCancelTitle(base.number)}
          message={
            base.status === 'approved' ? (
              <>
                <p>{t.undoApprovalText}</p>
                <ul className="ad-stock-changes">
                  {base.items.map((item) => {
                    const stock = productsById.get(item.product_id)?.stock ?? null
                    return (
                      <li key={item.product_id}>
                        <span>
                          {productName(item)} × {item.qty}
                        </span>
                        <span className="ad-muted" dir="ltr">
                          {stock === null ? t.stockNotTracked : t.stockChange(stock, stock + item.qty)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p>{t.undoCancelText}</p>
            )
          }
          confirmLabel={base.status === 'approved' ? t.undoApproval : t.undoCancel}
          busy={busy === 'reopen'}
          onConfirm={() => void reopen()}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm === 'discard' && (
        <ConfirmDialog
          title={t.orderNumber(base.number)}
          message={<p>{t.discardChanges}</p>}
          confirmLabel={t.discard}
          danger
          onConfirm={onClose}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
