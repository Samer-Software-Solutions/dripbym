import { ArrowRight } from 'lucide-react'
import { useShop } from '../state'

export function Hero() {
  const { t, content } = useShop()
  return (
    <section className="coffee-hero" id="top" aria-label={t.heroLabel}>
      <div className="coffee-hero-photo">
        <img src="/images/coffee-hero-v2.webp" alt={t.heroImageAlt} {...{ fetchpriority: 'high' }} />
      </div>
      <div className="coffee-hero-content">
        <p className="coffee-kicker">{t.heroKicker}</p>
        <h1>
          {content('heroTitleA')}
          <br />
          <em>{content('heroTitleB')}</em>
        </h1>
        <p className="coffee-intro">{content('heroText')}</p>
        <a href="#collection" className="coffee-shop-button">
          {t.heroCta}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
        <div className="coffee-hero-meta">
          <span>{t.heroMetaA}</span>
          <i />
          <span>{t.heroMetaB}</span>
        </div>
      </div>
      <span className="coffee-photo-caption">{t.heroCaption}</span>
    </section>
  )
}
