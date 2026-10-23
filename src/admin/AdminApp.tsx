import { useCallback, useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { ExternalLink, LayoutGrid, LogOut, Menu, Package, RefreshCw, Settings as SettingsIcon, ShieldAlert, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { CategoryRow, ProductRow, SettingsRow } from '../lib/db'
import { byOrder, fetchCategories, fetchProducts, fetchSettings, isAdmin, subscribeToStore } from './api'
import { I18nProvider, useT, type Dict } from './i18n'
import { LangToggle, Spinner, ToastProvider, useToast } from './ui'
import Login from './Login'
import ProductsPage from './ProductsPage'
import CategoriesPanel from './CategoriesPanel'
import SettingsPage from './SettingsPage'
import './admin.css'

type Tab = 'products' | 'categories' | 'settings'

const TABS: { id: Tab; label: (t: Dict) => string; icon: typeof Package }[] = [
  { id: 'products', label: (t) => t.tabProducts, icon: Package },
  { id: 'categories', label: (t) => t.tabCategories, icon: LayoutGrid },
  { id: 'settings', label: (t) => t.tabSettings, icon: SettingsIcon },
]

function readTab(): Tab {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return TABS.some((tab) => tab.id === hash) ? (hash as Tab) : 'products'
}

/** Inserts or replaces a row by id, keeping the list in display order. */
function upsertRow<T extends { id: string; sort_order: number; name_en: string }>(list: T[], row: T): T[] {
  const exists = list.some((item) => item.id === row.id)
  return (exists ? list.map((item) => (item.id === row.id ? row : item)) : [...list, row]).sort(byOrder)
}

export default function AdminApp() {
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    return () => robots.remove()
  }, [])

  return (
    <I18nProvider>
      <Root />
    </I18nProvider>
  )
}

function Root() {
  const { t, dir, lang } = useT()
  return (
    <div className="admin" dir={dir} lang={lang}>
      {supabase ? (
        <ToastProvider>
          <Gate client={supabase} />
        </ToastProvider>
      ) : (
        <div className="ad-center">
          <div className="ad-card ad-message">
            <div className="ad-message-top">
              <ShieldAlert size={32} aria-hidden />
              <LangToggle />
            </div>
            <h1>{t.notConfiguredTitle}</h1>
            <p>{t.notConfiguredNeeds}</p>
            <p dir="ltr">
              <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
            </p>
            <p>{t.notConfiguredFix}</p>
          </div>
        </div>
      )}
    </div>
  )
}

type Access = 'checking' | 'yes' | 'no' | 'error'

function Gate({ client }: { client: SupabaseClient }) {
  const { t, errorText } = useT()
  const toast = useToast()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [access, setAccess] = useState<Access>('checking')
  const [accessError, setAccessError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let active = true
    client.auth
      .getSession()
      .then(({ data }) => active && setSession(data.session))
      .catch(() => active && setSession(null))
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [client])

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    let active = true
    setAccess('checking')
    isAdmin(userId)
      .then((ok) => active && setAccess(ok ? 'yes' : 'no'))
      .catch((e) => {
        if (!active) return
        setAccessError(e)
        setAccess('error')
      })
    return () => {
      active = false
    }
  }, [userId, attempt])

  const signOut = useCallback(async () => {
    setSigningOut(true)
    const { error } = await client.auth.signOut()
    if (error) {
      // Still clear this browser's session if the server could not be reached.
      await client.auth.signOut({ scope: 'local' })
      toast.error(t.signedOutLocally(errorText(error)))
    }
    setSigningOut(false)
  }, [client, toast, t, errorText])

  if (session === undefined) {
    return (
      <div className="ad-center">
        <Spinner size={24} label={t.loading} />
      </div>
    )
  }

  if (!session) return <Login client={client} />

  if (access === 'checking') {
    return (
      <div className="ad-center">
        <Spinner size={24} label={t.checkingAccess} />
      </div>
    )
  }

  if (access !== 'yes') {
    return (
      <div className="ad-center">
        <div className="ad-card ad-message">
          <div className="ad-message-top">
            <ShieldAlert size={32} aria-hidden />
            <LangToggle />
          </div>
          {access === 'no' ? (
            <>
              <h1>{t.noAccessTitle}</h1>
              <p>
                {t.signedInAs} <strong dir="ltr">{session.user.email}</strong>. {t.noAccessHint}
              </p>
            </>
          ) : (
            <>
              <h1>{t.accessErrorTitle}</h1>
              <p>{errorText(accessError)}</p>
            </>
          )}
          <div className="ad-actions">
            {access === 'error' && (
              <button type="button" className="ad-btn ad-btn--secondary" onClick={() => setAttempt((n) => n + 1)}>
                <RefreshCw size={18} aria-hidden /> {t.tryAgain}
              </button>
            )}
            <button type="button" className="ad-btn ad-btn--primary" onClick={signOut} disabled={signingOut}>
              {signingOut ? <Spinner size={18} /> : <LogOut size={18} aria-hidden className="ad-flip" />} {t.signOut}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <Shell email={session.user.email ?? ''} onSignOut={signOut} signingOut={signingOut} />
}

interface ShellProps {
  email: string
  onSignOut: () => void
  signingOut: boolean
}

function Shell({ email, onSignOut, signingOut }: ShellProps) {
  const { t, errorText } = useT()
  const [tab, setTab] = useState<Tab>(readTab)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [settings, setSettings] = useState<SettingsRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [live, setLive] = useState(false)
  const [showOffline, setShowOffline] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Only mention the connection when it has been down for a while (not while it first connects).
  useEffect(() => {
    if (live || !loaded) {
      setShowOffline(false)
      return
    }
    const timer = window.setTimeout(() => setShowOffline(true), 5000)
    return () => window.clearTimeout(timer)
  }, [live, loaded])

  // Phone menu: close with Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    const onHash = () => {
      setTab(readTab())
      setMenuOpen(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [p, c, s] = await Promise.all([fetchProducts(), fetchCategories(), fetchSettings()])
      setProducts(p.sort(byOrder))
      setCategories(c.sort(byOrder))
      setSettings(s)
      setLoaded(true)
    } catch (e) {
      setLoadError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Live updates from other devices, once the first load has finished.
  useEffect(() => {
    if (!loaded) return
    return subscribeToStore({
      onProduct: (change) =>
        setProducts((list) =>
          change.type === 'delete' ? list.filter((p) => p.id !== change.id) : upsertRow(list, change.row),
        ),
      onCategory: (change) =>
        setCategories((list) =>
          change.type === 'delete' ? list.filter((c) => c.id !== change.id) : upsertRow(list, change.row),
        ),
      onSettings: (row) => setSettings(row),
      onStatus: setLive,
    })
  }, [loaded])

  const hasData = products.length > 0 || categories.length > 0 || settings !== null

  const logo = (
    <a href="#/products" className="ad-logo">
      <span dir="ltr">Drip by M</span>
      <span className="ad-logo-sub">{t.adminLabel}</span>
    </a>
  )

  return (
    <div className="ad-shell">
      {/* Phone only: slim bar with the menu button. Not a <header>: the shop stylesheet styles bare header/footer. */}
      <div className="ad-topbar" role="banner">
        <button
          type="button"
          className="ad-icon-btn ad-menu-btn"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? t.closeMenu : t.openMenu}
          aria-expanded={menuOpen}
          aria-controls="ad-sidebar"
        >
          {menuOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
        </button>
        {logo}
      </div>

      {menuOpen && <div className="ad-sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden />}

      <aside id="ad-sidebar" className={`ad-sidebar${menuOpen ? ' is-open' : ''}`}>
        <div className="ad-sidebar-brand">{logo}</div>

        <nav className="ad-sidenav" aria-label={t.navLabel}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#/${id}`} className="ad-sidenav-link" aria-current={tab === id ? 'page' : undefined}>
              <Icon size={19} aria-hidden />
              {label(t)}
            </a>
          ))}
        </nav>

        <div className="ad-sidebar-foot">
          {showOffline && (
            <p className="ad-offline" title={t.offlineTitle}>
              <span className="ad-offline-dot" aria-hidden />
              {t.offline}
            </p>
          )}
          <span className="ad-sidebar-email" title={email} dir="ltr">
            {email}
          </span>
          <LangToggle className="ad-btn--ghost ad-sidebar-btn" />
          <a className="ad-btn ad-btn--ghost ad-sidebar-btn" href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={17} aria-hidden className="ad-flip" />
            <span>
              {t.viewShop}
              <span className="ad-sr-only"> {t.opensNewTab}</span>
            </span>
          </a>
          <button type="button" className="ad-btn ad-btn--ghost ad-sidebar-btn" onClick={onSignOut} disabled={signingOut}>
            {signingOut ? <Spinner size={17} /> : <LogOut size={17} aria-hidden className="ad-flip" />}
            <span>{t.signOut}</span>
          </button>
        </div>
      </aside>

      <main className="ad-main">
        {loading && !hasData ? (
          <div className="ad-loading">
            <Spinner size={24} label={t.loadingData} />
          </div>
        ) : loadError != null && !hasData ? (
          <div className="ad-card ad-message">
            <ShieldAlert size={32} aria-hidden />
            <h1>{t.loadErrorTitle}</h1>
            <p>{errorText(loadError)}</p>
            <div className="ad-actions">
              <button type="button" className="ad-btn ad-btn--primary" onClick={() => void load()}>
                <RefreshCw size={18} aria-hidden /> {t.tryAgain}
              </button>
            </div>
          </div>
        ) : (
          <>
            {loadError != null && (
              <p className="ad-banner ad-banner--error" role="alert">
                {t.refreshFailed(errorText(loadError))}
              </p>
            )}
            {tab === 'products' && (
              <ProductsPage
                products={products}
                setProducts={setProducts}
                categories={categories}
                settings={settings}
                onReload={load}
                reloading={loading}
              />
            )}
            {tab === 'categories' && (
              <CategoriesPanel
                categories={categories}
                setCategories={setCategories}
                products={products}
                setProducts={setProducts}
              />
            )}
            {tab === 'settings' && <SettingsPage settings={settings} setSettings={setSettings} />}
          </>
        )}
      </main>
    </div>
  )
}
