import { Heart, Plus } from 'lucide-react'
import { effectivePrice, isLowStock, isSoldOut, type ProductRow } from '../lib/db'
import { useShop } from '../state'

interface CollectionProps {
  category: string
  onCategoryChange: (category: string) => void
  onOpenProduct: (product: ProductRow) => void
}

export function Collection({ category, onCategoryChange, onOpenProduct }: CollectionProps) {
  const { t, content, store, categoryName } = useShop()

  // Only show tabs for categories that have something in them.
  const usedCategories = store.categories.filter((c) => store.products.some((p) => p.category_id === c.id))
  const visible = category === 'all' ? store.products : store.products.filter((p) => p.category_id === category)

  return (
    <section className="collection-section" id="collection">
      <div className="section-heading reveal">
        <div>
          <p className="eyebrow">{t.collectionLabel}</p>
          <h2>{content('collectionTitle')}</h2>
        </div>
        <p>{content('collectionText')}</p>
      </div>

      <div className="category-filters" role="group" aria-label={t.categories}>
        <button type="button" className={category === 'all' ? 'active' : ''} aria-pressed={category === 'all'} onClick={() => onCategoryChange('all')}>
          {t.allProducts}
        </button>
        {usedCategories.map((c) => (
          <button
            type="button"
            key={c.id}
            className={category === c.id ? 'active' : ''}
            aria-pressed={category === c.id}
            onClick={() => onCategoryChange(c.id)}
          >
            {categoryName(c.id)}
          </button>
        ))}
      </div>

      <div className="product-grid">
        {visible.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} onOpen={() => onOpenProduct(product)} />
        ))}
      </div>
    </section>
  )
}

function ProductCard({ product, index, onOpen }: { product: ProductRow; index: number; onOpen: () => void }) {
  const { t, store, name, description, categoryName, cart, maxQty, wishlist, toggleWishlist, addToBag } = useShop()
  const saved = wishlist.includes(product.id)
  const soldOut = isSoldOut(product)
  const lowStock = isLowStock(product, store.settings.low_stock_threshold)
  const maxedOut = !soldOut && (cart[product.id] || 0) >= maxQty(product)
  const price = effectivePrice(product)
  const onSale = price < product.price
  const title = name(product)
  const subtitle = description(product)

  return (
    <article className={`product-card reveal ${soldOut ? 'sold-out' : ''}`} style={{ animationDelay: `${index * 110}ms` }}>
      <div className="product-image-wrap">
        <button type="button" className="product-image-button" onClick={onOpen} aria-label={`${t.details}: ${title}`}>
          <img src={product.image_url} alt={title} loading="lazy" />
        </button>
        {soldOut ? (
          <span className="product-tag sold-out">{t.soldOut}</span>
        ) : lowStock ? (
          <span className="product-tag low-stock">{t.onlyLeft.replace('{n}', String(product.stock))}</span>
        ) : onSale ? (
          <span className="product-tag special-offer">{t.sale}</span>
        ) : null}
        <button
          type="button"
          className={`wishlist-button ${saved ? 'active' : ''}`}
          onClick={() => toggleWishlist(product.id)}
          aria-label={saved ? t.removeWishlist : t.wishlist}
          aria-pressed={saved}
        >
          <Heart size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>

      <div className="product-info">
        <div>
          <p>{categoryName(product.category_id)}</p>
          <h3>{title}</h3>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <strong>
          {onSale && <del>{product.price}</del>}
          {price} {t.qar}
        </strong>
      </div>

      <div className="product-actions">
        <button type="button" className="details-button" onClick={onOpen}>
          {t.details}
        </button>
        <button type="button" className="add-button" disabled={soldOut || maxedOut} onClick={() => addToBag(product)}>
          {soldOut ? (
            t.soldOut
          ) : maxedOut ? (
            t.maxInBag
          ) : (
            <>
              {t.add}
              <Plus size={17} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </article>
  )
}
