// Shapes of the rows stored in Supabase. Shared by the shop and the admin panel.

export interface CategoryRow {
  id: string
  name_en: string
  name_ar: string
  sort_order: number
}

export interface ProductRow {
  id: string
  name_en: string
  name_ar: string
  /** Short line under the name (size, pack count…). Empty to hide. */
  description_en: string
  description_ar: string
  /** Longer text shown in the product details window. */
  details_en: string
  details_ar: string
  category_id: string | null
  price: number
  /** Sale price; shown with the regular price struck through. Null when not on sale. */
  discount_price: number | null
  /** Either a site path (/images/x.webp) or a Supabase Storage public URL. */
  image_url: string
  /** Units in stock. Null means unlimited / not tracked. */
  stock: number | null
  /** Hidden from the shop when false. */
  active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface LocalizedText {
  en: string
  ar: string
}

export const CONTENT_FIELDS = [
  { key: 'announcement', label: 'Announcement bar', multiline: false },
  { key: 'heroTitleA', label: 'Homepage title (line 1)', multiline: false },
  { key: 'heroTitleB', label: 'Homepage title (line 2, italic)', multiline: false },
  { key: 'heroText', label: 'Homepage intro text', multiline: true },
  { key: 'collectionTitle', label: 'Collection title', multiline: false },
  { key: 'collectionText', label: 'Collection intro text', multiline: true },
  { key: 'flavourTitle', label: '"Cup for every mood" title', multiline: false },
  { key: 'flavourText', label: '"Cup for every mood" text', multiline: true },
  { key: 'brewingTitle', label: 'Brewing corner title', multiline: false },
  { key: 'brewingText', label: 'Brewing corner text', multiline: true },
  { key: 'storyTitle', label: 'Our story title', multiline: false },
  { key: 'storyText', label: 'Our story text', multiline: true },
  { key: 'policyDelivery', label: 'Delivery policy', multiline: true },
  { key: 'policyReturns', label: 'Returns policy', multiline: true },
  { key: 'policyPrivacy', label: 'Privacy policy', multiline: true },
] as const

export type ContentKey = (typeof CONTENT_FIELDS)[number]['key']
export type SiteContent = Record<ContentKey, LocalizedText>

export interface SettingsRow {
  id: 1
  /** International format, digits only, e.g. 97451750557. Empty disables checkout. */
  whatsapp: string
  instagram: string
  delivery_inside_fee: number
  delivery_outside_fee: number
  /** Stock at or below this shows "Only X left" on the shop and appears in the admin low-stock list. */
  low_stock_threshold: number
  content: SiteContent
  updated_at?: string
}

export type OrderStatus = 'pending' | 'approved' | 'cancelled'

/** One line of an order: a copy of the product as it was when it was added to the order. */
export interface OrderItem {
  product_id: string
  name_en: string
  name_ar: string
  image_url: string
  unit_price: number
  qty: number
}

export interface OrderRow {
  id: string
  /** Short order number shown to the customer in the WhatsApp message, e.g. 1042. */
  number: number
  status: OrderStatus
  customer_name: string
  /** 8 digits, without +974. */
  customer_phone: string
  zone: 'inside' | 'outside'
  items: OrderItem[]
  subtotal: number
  delivery_fee: number
  total: number
  approved_at: string | null
  cancelled_at: string | null
  /** When the order was placed, or last moved back to pending. */
  pending_since: string
  created_at: string
  updated_at: string
}

/** Pending orders are deleted this long after `pending_since` (see the cron job in Supabase). */
export const PENDING_ORDER_LIFETIME_HOURS = 60

/** Price the customer pays: the sale price when it is lower than the regular price. */
export const effectivePrice = (p: Pick<ProductRow, 'price' | 'discount_price'>) =>
  p.discount_price != null && p.discount_price < p.price ? p.discount_price : p.price

export const isSoldOut = (p: Pick<ProductRow, 'stock'>) => p.stock !== null && p.stock <= 0

export const isLowStock = (p: Pick<ProductRow, 'stock'>, threshold: number) =>
  p.stock !== null && p.stock > 0 && p.stock <= threshold
