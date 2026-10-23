import { ArrowRight, Coffee } from 'lucide-react'
import { brewingCornerId, featuredIds } from '../data/store'
import { useShop } from '../state'

export function Flavours() {
  const { t, content, store, name, categoryName } = useShop()
  const featured = featuredIds
    .map((id) => store.products.find((p) => p.id === id))
    .filter((p) => p !== undefined)

  return (
    <section className="flavours-section" id="flavours">
      <div className="flavour-intro reveal">
        <p className="eyebrow">{t.flavourLabel}</p>
        <h2>{content('flavourTitle')}</h2>
        <p>{content('flavourText')}</p>
        <a href="#collection" className="text-link">
          {t.shop}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className="flavour-grid">
        {featured.map((product, i) => (
          <article key={product.id} className="flavour-card reveal">
            <div className="flavour-image">
              <img src={product.image_url} alt={name(product)} loading="lazy" />
              <span>{String(i + 1).padStart(2, '0')}</span>
            </div>
            <h3>{name(product)}</h3>
            <p>{categoryName(product.category_id)}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function BrewingCorner({ onExplore }: { onExplore: () => void }) {
  const { t, content, store } = useShop()
  const image = store.products.find((p) => p.id === brewingCornerId)?.image_url ?? '/images/denx.webp'

  return (
    <section className="gifting-section" id="gifting">
      <div className="gifting-image">
        <img src={image} alt="DENX complete coffee brewing kit" loading="lazy" />
      </div>
      <div className="gifting-copy reveal">
        <p className="eyebrow">{t.brewingLabel}</p>
        <h2>{content('brewingTitle')}</h2>
        <p>{content('brewingText')}</p>
        <ul>
          {t.brewingPoints.map((point) => (
            <li key={point}>
              <Coffee size={17} strokeWidth={1.4} aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
        <a className="primary-button dark" href="#collection" onClick={onExplore}>
          {t.brewingCta}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}

export function Story() {
  const { t, content } = useShop()
  return (
    <section className="story-section" id="story">
      <div className="story-monogram" aria-hidden="true">
        <img src="/images/drip-logo.webp" alt="" loading="lazy" />
      </div>
      <div className="story-copy reveal">
        <p className="eyebrow">{t.storyLabel}</p>
        <h2>{content('storyTitle')}</h2>
        <p>{content('storyText')}</p>
      </div>
      <a className="instagram-link" href="#collection">
        <ArrowRight size={19} aria-hidden="true" />
        {t.follow}
      </a>
    </section>
  )
}

export function Policies() {
  const { t, content } = useShop()
  const items = [
    [t.policyDelivery, content('policyDelivery')],
    [t.policyReturns, content('policyReturns')],
    [t.policyPrivacy, content('policyPrivacy')],
  ]
  return (
    <section className="policy-strip" aria-label={t.policies}>
      <span>{t.policies}</span>
      {items.map(([title, text]) => (
        <details key={title}>
          <summary>{title}</summary>
          <p>{text}</p>
        </details>
      ))}
    </section>
  )
}

export function Footer() {
  const { t, store } = useShop()
  const whatsapp = store.settings.whatsapp.replace(/\D/g, '')
  const { instagram } = store.settings
  return (
    <footer>
      <img src="/images/drip-logo.webp" alt="Drip by M" loading="lazy" />
      <p>{t.footer}</p>
      <div>
        {instagram && (
          <a href={instagram} target="_blank" rel="noreferrer">
            Instagram
          </a>
        )}
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        )}
        <a href="#collection">{t.shopShort}</a>
      </div>
    </footer>
  )
}
