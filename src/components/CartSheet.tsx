import { useState } from 'react'
import { ArrowRight, Minus, Plus, ShoppingBag } from 'lucide-react'
import { useShop, type DeliveryZone } from '../state'
import { Overlay } from './Overlay'

const QATAR_PHONE = /^[3-7]\d{7}$/

export function CartSheet() {
  const {
    t,
    isRtl,
    store,
    name,
    bagOpen,
    setBagOpen,
    cartCount,
    cartLines,
    changeQty,
    maxQty,
    subtotal,
    deliveryFee,
    customer,
    setCustomer,
    placeOrder,
  } = useShop()
  const [showErrors, setShowErrors] = useState(false)
  const [placing, setPlacing] = useState(false)

  const hasWhatsApp = !!store.settings.whatsapp.replace(/\D/g, '')
  const phoneDigits = customer.phone.replace(/\D/g, '')
  const errors = {
    zone: !customer.zone,
    name: customer.name.trim().length < 2,
    phone: !QATAR_PHONE.test(phoneDigits),
  }
  const fee = deliveryFee(customer.zone)
  const formatFee = (amount: number) => (amount ? `${amount} ${t.qar}` : t.free)

  const checkout = async () => {
    if (errors.zone || errors.name || errors.phone) {
      setShowErrors(true)
      return
    }
    if (placing) return
    // Open the tab now, while the tap still counts as the user's action, so browsers don't
    // block it as a popup once the order has been saved.
    const tab = window.open('', '_blank')
    setPlacing(true)
    try {
      const url = await placeOrder()
      if (!url) tab?.close()
      else if (tab) {
        tab.opener = null
        tab.location.href = url
      } else window.location.href = url
    } finally {
      setPlacing(false)
    }
  }

  const zones: { id: DeliveryZone; label: string }[] = [
    { id: 'inside', label: t.insideDoha },
    { id: 'outside', label: t.outsideDoha },
  ]

  return (
    <Overlay
      open={bagOpen}
      onClose={() => setBagOpen(false)}
      variant={isRtl ? 'sheet-left' : 'sheet-right'}
      className="cart-sheet"
      labelledBy="cart-title"
      describedBy="cart-description"
      closeLabel={t.close}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="cart-header">
        <h2 id="cart-title" className="cart-title">
          {t.bag}
        </h2>
        <p id="cart-description">{t.bagDescription}</p>
      </div>

      <div className="cart-body">
        {cartCount === 0 ? (
          <div className="empty-cart">
            <ShoppingBag size={34} strokeWidth={1.2} aria-hidden="true" />
            <p>{t.empty}</p>
          </div>
        ) : (
          <>
            {cartLines.map(({ product, qty, unit }) => (
              <article className="cart-item" key={product.id}>
                <img src={product.image_url} alt="" />
                <div>
                  <h3>{name(product)}</h3>
                  <p>
                    {unit} {t.qar}
                  </p>
                  <div className="quantity-control">
                    <button type="button" onClick={() => changeQty(product.id, -1)} aria-label={t.decrease}>
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <span aria-live="polite">{qty}</span>
                    <button type="button" onClick={() => changeQty(product.id, 1)} aria-label={t.increase} disabled={qty >= maxQty(product)}>
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            ))}

            <fieldset className="checkout-group">
              <legend>{t.chooseDelivery}</legend>
              <div className="delivery-choice" role="radiogroup" aria-label={t.chooseDelivery}>
                {zones.map((zone) => {
                  const zoneFee = zone.id === 'inside' ? store.settings.delivery_inside_fee : store.settings.delivery_outside_fee
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={customer.zone === zone.id}
                      key={zone.id}
                      className={customer.zone === zone.id ? 'active' : ''}
                      onClick={() => setCustomer({ zone: zone.id })}
                    >
                      {zone.label}
                      <small>{formatFee(zoneFee)}</small>
                    </button>
                  )
                })}
              </div>
              {showErrors && errors.zone && <p className="field-error">{t.errZone}</p>}
            </fieldset>

            <fieldset className="checkout-group">
              <legend>{t.yourDetails}</legend>
              <label className="checkout-field">
                <span>{t.fullName}</span>
                <input
                  value={customer.name}
                  onChange={(e) => setCustomer({ name: e.target.value })}
                  autoComplete="name"
                  maxLength={100}
                  aria-invalid={showErrors && errors.name}
                />
              </label>
              {showErrors && errors.name && <p className="field-error">{t.errName}</p>}
              <label className="checkout-field">
                <span>{t.phone}</span>
                <div className="phone-input" dir="ltr">
                  <b>+974</b>
                  <input
                    value={customer.phone}
                    onChange={(e) => setCustomer({ phone: e.target.value.replace(/[^\d ]/g, '').slice(0, 9) })}
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="5555 1234"
                    aria-invalid={showErrors && errors.phone}
                  />
                </div>
              </label>
              {showErrors && errors.phone && <p className="field-error">{t.errPhone}</p>}
            </fieldset>
          </>
        )}
      </div>

      <div className="cart-footer">
        <div className="subtotal">
          <span>{t.subtotal}</span>
          <strong>
            {subtotal} {t.qar}
          </strong>
        </div>
        {cartCount > 0 && (
          <>
            <div className="subtotal delivery-total">
              <span>{t.delivery}</span>
              <strong>{customer.zone ? formatFee(fee) : '—'}</strong>
            </div>
            <div className="subtotal grand-total">
              <span>{t.total}</span>
              <strong>
                {subtotal + fee} {t.qar}
              </strong>
            </div>
          </>
        )}
        <button
          type="button"
          className={`primary-button full ${cartCount > 0 && hasWhatsApp ? '' : 'disabled'}`}
          onClick={() => void checkout()}
          disabled={cartCount === 0 || !hasWhatsApp || placing}
        >
          {!hasWhatsApp ? t.orderingSoon : placing ? t.placingOrder : t.checkout}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
        <p>{hasWhatsApp ? t.checkoutNote : t.orderingSoonNote}</p>
      </div>
    </Overlay>
  )
}
