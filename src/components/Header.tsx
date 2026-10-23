import { useState } from 'react'
import { Menu, ShoppingBag, X } from 'lucide-react'
import { useShop } from '../state'

const SECTION_LINKS = ['#collection', '#flavours', '#gifting', '#story']

export function Header() {
  const { t, content, toggleLang, cartCount, setBagOpen } = useShop()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <div className="announcement">
        <span>{content('announcement')}</span>
        <span aria-hidden="true">✦</span>
        <span>{t.brewYourMoment}</span>
      </div>

      <header className="site-header">
        <a href="#top" className="brand-mark" aria-label="Drip by M home">
          <img src="/images/drip-icon-v3.webp" alt="Drip by M" width={73} height={73} />
          <span>
            DRIP<small>BY M</small>
          </span>
        </a>

        <nav className="desktop-nav" aria-label="Main navigation">
          {t.nav.map((label, i) => (
            <a key={label} href={SECTION_LINKS[i]}>
              {label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <button type="button" className="language-button" onClick={toggleLang} aria-label={t.switchLang}>
            {t.langButton}
          </button>
          <button
            type="button"
            className="bag-button"
            onClick={() => setBagOpen(true)}
            aria-label={`${t.bag}, ${cartCount} items`}
            aria-haspopup="dialog"
          >
            <ShoppingBag size={19} strokeWidth={1.6} aria-hidden="true" />
            <span>{cartCount}</span>
          </button>
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? t.closeMenu : t.menu}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation">
          {t.nav.map((label, i) => (
            <a key={label} href={SECTION_LINKS[i]} onClick={() => setMenuOpen(false)}>
              {label}
            </a>
          ))}
        </nav>
      )}
    </>
  )
}
