import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { effectivePrice, isLowStock, isSoldOut, type ProductRow } from '../lib/db'
import { useShop } from '../state'
import { Overlay } from './Overlay'

interface ProductDialogProps {
  product: ProductRow | null
  onClose: () => void
}

export function ProductDialog({ product, onClose }: ProductDialogProps) {
  const { t, isRtl, store, name, description, details, categoryName, cart, maxQty, addToBag } = useShop()
  // Keep the last product rendered while the dialog animates closed.
  const [shown, setShown] = useState<ProductRow | null>(product)

  useEffect(() => {
    if (product) setShown(product)
  }, [product])

  const soldOut = shown ? isSoldOut(shown) : false
  const lowStock = shown ? isLowStock(shown, store.settings.low_stock_threshold) : false
  const maxedOut = shown ? !soldOut && (cart[shown.id] || 0) >= maxQty(shown) : false
  const price = shown ? effectivePrice(shown) : 0

  return (
    <Overlay
      open={!!product}
      onClose={onClose}
      variant="dialog"
      className="product-dialog"
      labelledBy="product-dialog-title"
      describedBy="product-dialog-description"
      closeLabel={t.close}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {shown && (
        <>
          <div className="product-gallery">
            <img key={shown.image_url} src={shown.image_url} alt={name(shown)} />
          </div>

          <div className="product-dialog-copy">
            <div className="dialog-header">
              <p className="eyebrow">{categoryName(shown.category_id)}</p>
              <h2 id="product-dialog-title" className="dialog-title">
                {name(shown)}
              </h2>
              <p id="product-dialog-description" className="dialog-description">
                {description(shown)}
              </p>
            </div>
            <strong className="dialog-price">
              {price < shown.price && <del>{shown.price}</del>}
              {price} {t.qar}
            </strong>
            {(soldOut || lowStock) && (
              <p className={`stock-note ${soldOut ? 'sold-out' : 'low-stock'}`}>
                {soldOut ? t.soldOut : t.onlyLeft.replace('{n}', String(shown.stock))}
              </p>
            )}
            {details(shown) && (
              <div className="dialog-detail">
                <span>{t.productDetails}</span>
                <p>{details(shown)}</p>
              </div>
            )}
            <div className="dialog-detail">
              <span>{t.packaging}</span>
              <p>{t.packagingText}</p>
            </div>
            <button
              type="button"
              className="primary-button dark full"
              disabled={soldOut || maxedOut}
              onClick={() => {
                addToBag(shown)
                onClose()
              }}
            >
              {soldOut ? (
                t.soldOut
              ) : maxedOut ? (
                t.maxInBag
              ) : (
                <>
                  {t.add}
                  <ShoppingBag size={16} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </Overlay>
  )
}
