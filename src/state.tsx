import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fallbackStore, type Lang, type StoreData } from './data/store'
import { effectivePrice, type ContentKey, type ProductRow } from './lib/db'
import { supabase } from './lib/supabase'
import { strings, type Strings } from './i18n'

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStorage(key, initial))
  useEffect(() => writeStorage(key, value), [key, value])
  return [value, setValue] as const
}

function readStorage<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : initial
  } catch {
    return initial
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable (private mode); the site still works without it.
  }
}

const STORE_CACHE_KEY = 'drip:store'

/** Live store data from Supabase. Starts from the last visit's copy (or the built-in one) and refreshes. */
function useStoreData() {
  const [data, setData] = useState<StoreData>(() => {
    const cached = readStorage<StoreData | null>(STORE_CACHE_KEY, null)
    return cached?.products && cached.settings ? cached : fallbackStore
  })

  useEffect(() => {
    const client = supabase
    if (!client) return
    let cancelled = false
    let refreshTimer: number | undefined

    const load = async () => {
      const [products, categories, settings] = await Promise.all([
        client.from('products').select('*').eq('active', true).order('sort_order'),
        client.from('categories').select('*').order('sort_order'),
        client.from('settings').select('*').eq('id', 1).single(),
      ])
      if (cancelled || products.error || categories.error || settings.error) return
      const live: StoreData = {
        products: products.data.map((p) => ({
          ...p,
          price: Number(p.price),
          discount_price: p.discount_price == null ? null : Number(p.discount_price),
        })),
        categories: categories.data,
        settings: {
          ...settings.data,
          delivery_inside_fee: Number(settings.data.delivery_inside_fee),
          delivery_outside_fee: Number(settings.data.delivery_outside_fee),
          content: { ...fallbackStore.settings.content, ...settings.data.content },
        },
      }
      setData(live)
      writeStorage(STORE_CACHE_KEY, live)
    }

    // Several changes often arrive together (e.g. a product save); reload once after they settle.
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => void load(), 400)
    }

    void load()

    // Live updates: stock, prices and text change on open pages as soon as the admin saves.
    const channel = client
      // Unique name: supabase reuses channels by name, and React may mount this twice in development.
      .channel(`shop-store-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, scheduleRefresh)
      .subscribe()

    // Visitors only receive changes to products they can see, so a product being hidden
    // isn't pushed to them. Catch up whenever the tab comes back into view.
    const onVisible = () => document.visibilityState === 'visible' && scheduleRefresh()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearTimeout(refreshTimer)
      document.removeEventListener('visibilitychange', onVisible)
      void client.removeChannel(channel)
    }
  }, [])

  return data
}

type Cart = Record<string, number>
export type DeliveryZone = 'inside' | 'outside'

export interface Customer {
  name: string
  phone: string
  zone: DeliveryZone | null
}

interface Shop {
  lang: Lang
  t: Strings
  isRtl: boolean
  toggleLang: () => void
  store: StoreData
  /** Site text edited in the admin panel, in the current language. */
  content: (key: ContentKey) => string
  name: (p: ProductRow) => string
  description: (p: ProductRow) => string
  details: (p: ProductRow) => string
  categoryName: (id: string | null) => string
  cart: Cart
  cartCount: number
  cartLines: { product: ProductRow; qty: number; unit: number }[]
  subtotal: number
  deliveryFee: (zone: DeliveryZone | null) => number
  /** Most units of a product that can be in the bag (Infinity when stock isn't tracked). */
  maxQty: (p: ProductRow) => number
  changeQty: (id: string, delta: number) => void
  addToBag: (product: ProductRow) => void
  wishlist: string[]
  toggleWishlist: (id: string) => void
  bagOpen: boolean
  setBagOpen: (open: boolean) => void
  toast: string | null
  dismissToast: () => void
  customer: Customer
  setCustomer: (update: Partial<Customer>) => void
  /** Saves the order for the admin panel and returns the WhatsApp link carrying its number. */
  placeOrder: () => Promise<string | undefined>
}

/** The order last saved from this browser, so tapping checkout again doesn't create a duplicate. */
interface LastOrder {
  key: string
  number: number
  at: number
}

const REUSE_ORDER_MS = 60 * 60 * 1000

const ShopContext = createContext<Shop | null>(null)

export function ShopProvider({ children }: { children: ReactNode }) {
  const store = useStoreData()
  const [lang, setLang] = usePersistentState<Lang>('drip:lang', 'en')
  const [cart, setCart] = usePersistentState<Cart>('drip:cart', {})
  const [wishlist, setWishlist] = usePersistentState<string[]>('drip:wishlist', [])
  const [customer, setCustomerState] = usePersistentState<Customer>('drip:customer', { name: '', phone: '', zone: null })
  const [lastOrder, setLastOrder] = usePersistentState<LastOrder | null>('drip:last-order', null)
  const [bagOpen, setBagOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>()

  const t = strings[lang]
  const isRtl = lang === 'ar'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr'
  }, [lang, isRtl])

  const productsById = useMemo(() => new Map(store.products.map((p) => [p.id, p])), [store.products])
  const maxQty = useCallback((p: ProductRow) => (p.stock === null ? Infinity : Math.max(0, p.stock)), [])

  // Keep the bag in line with the live stock: drop removed/sold-out items, cap quantities.
  useEffect(() => {
    setCart((prev) => {
      let changed = false
      const next: Cart = {}
      for (const [id, qty] of Object.entries(prev)) {
        const product = productsById.get(id)
        const allowed = product ? Math.min(qty, maxQty(product)) : 0
        if (allowed !== qty) changed = true
        if (allowed > 0) next[id] = allowed
      }
      return changed ? next : prev
    })
  }, [productsById, maxQty, setCart])

  const cartLines = useMemo(
    () =>
      store.products
        .filter((p) => cart[p.id])
        .map((product) => ({ product, qty: cart[product.id], unit: effectivePrice(product) })),
    [store.products, cart],
  )
  const cartCount = cartLines.reduce((sum, line) => sum + line.qty, 0)
  const subtotal = cartLines.reduce((sum, line) => sum + line.unit * line.qty, 0)

  const deliveryFee = (zone: DeliveryZone | null) =>
    zone === 'inside' ? store.settings.delivery_inside_fee : zone === 'outside' ? store.settings.delivery_outside_fee : 0

  const changeQty = useCallback(
    (id: string, delta: number) =>
      setCart((prev) => {
        const product = productsById.get(id)
        const limit = product ? maxQty(product) : 0
        const qty = Math.min(limit, Math.max(0, (prev[id] || 0) + delta))
        const next = { ...prev, [id]: qty }
        if (qty === 0) delete next[id]
        return next
      }),
    [productsById, maxQty, setCart],
  )

  const name = useCallback((p: ProductRow) => (lang === 'ar' && p.name_ar ? p.name_ar : p.name_en), [lang])
  const description = (p: ProductRow) => (lang === 'ar' && p.description_ar ? p.description_ar : p.description_en)
  const details = (p: ProductRow) => (lang === 'ar' && p.details_ar ? p.details_ar : p.details_en)
  const categoryName = (id: string | null) => {
    const c = store.categories.find((cat) => cat.id === id)
    return c ? (lang === 'ar' && c.name_ar ? c.name_ar : c.name_en) : ''
  }
  const content = (key: ContentKey) => {
    const text = store.settings.content[key] ?? fallbackStore.settings.content[key]
    return (lang === 'ar' ? text.ar : text.en) || text.en
  }

  const addToBag = useCallback(
    (product: ProductRow) => {
      if ((cart[product.id] || 0) >= maxQty(product)) return
      changeQty(product.id, 1)
      setToast(name(product))
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(null), 3300)
    },
    [cart, maxQty, changeQty, name],
  )

  const toggleWishlist = (id: string) =>
    setWishlist((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  /** Saves the order (once per bag + details) and returns the WhatsApp link with its number. */
  const placeOrder = async () => {
    const whatsapp = store.settings.whatsapp.replace(/\D/g, '')
    if (!whatsapp) return undefined
    const phone = customer.phone.replace(/\D/g, '')
    const items = cartLines.map(({ product, qty }) => ({ product_id: product.id, qty }))
    const key = JSON.stringify([customer.name.trim(), phone, customer.zone, items])

    let orderNumber: number | undefined
    if (lastOrder?.key === key && Date.now() - lastOrder.at < REUSE_ORDER_MS) {
      orderNumber = lastOrder.number
    } else if (supabase) {
      const { data, error } = await supabase
        .rpc('place_order', { p_name: customer.name, p_phone: phone, p_zone: customer.zone, p_items: items })
        .single<{ number: number }>()
      // If saving fails the customer can still order; the message just has no order number.
      if (error) console.warn('Could not save the order', error.message)
      else {
        orderNumber = data.number
        setLastOrder({ key, number: data.number, at: Date.now() })
      }
    }
    return buildWhatsAppUrl(whatsapp, orderNumber)
  }

  const buildWhatsAppUrl = (number: string, orderNumber: number | undefined) => {
    const fee = deliveryFee(customer.zone)
    const zoneLabel = customer.zone === 'outside' ? 'Outside Doha' : 'Inside Doha'
    const message = [
      orderNumber ? `Drip by M order #${orderNumber}` : 'Drip by M order',
      '',
      ...cartLines.map(({ product, qty, unit }) => `${product.name_en} × ${qty} — ${unit * qty} QAR`),
      '',
      `Subtotal: ${subtotal} QAR`,
      `Delivery (${zoneLabel}): ${fee ? `${fee} QAR` : 'Free'}`,
      `Total: ${subtotal + fee} QAR`,
      '',
      `Name: ${customer.name.trim()}`,
      `Phone: +974 ${customer.phone.replace(/\D/g, '')}`,
    ].join('\n')
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
  }

  const value: Shop = {
    lang,
    t,
    isRtl,
    toggleLang: () => setLang(lang === 'en' ? 'ar' : 'en'),
    store,
    content,
    name,
    description,
    details,
    categoryName,
    cart,
    cartCount,
    cartLines,
    subtotal,
    deliveryFee,
    maxQty,
    changeQty,
    addToBag,
    wishlist,
    toggleWishlist,
    bagOpen,
    setBagOpen,
    toast,
    dismissToast: () => setToast(null),
    customer,
    setCustomer: (update) => setCustomerState((prev) => ({ ...prev, ...update })),
    placeOrder,
  }

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used inside <ShopProvider>')
  return ctx
}
