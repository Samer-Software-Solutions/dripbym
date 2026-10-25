// All reads and writes the admin panel makes to Supabase live here.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { PRODUCT_IMAGES_BUCKET, supabase } from '../lib/supabase'
import type { CategoryRow, OrderRow, ProductRow, SettingsRow } from '../lib/db'

export type ProductInput = Omit<ProductRow, 'id' | 'created_at' | 'updated_at'>
export type CategoryInput = Omit<CategoryRow, 'id'>
export type SettingsInput = Omit<SettingsRow, 'id' | 'updated_at'>

/** Errors the UI should show in the admin's own language (see i18n `errors`). */
export type AdminErrorCode = 'notConfigured' | 'nothingSaved' | 'deleted' | 'notAllowed' | 'productUnavailable'

export class AdminError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code)
  }
}

/** A product in an order the database couldn't take out of stock. */
export interface StockProblem {
  product_id: string
  needed: number
  /** Null when the product no longer exists. */
  stock: number | null
  missing: boolean
}

/** Approving was refused because some products don't have enough stock (or were deleted). */
export class StockError extends Error {
  constructor(readonly problems: StockProblem[]) {
    super('insufficient_stock')
  }
}

/**
 * Someone else (another device or tab) changed this row after it was loaded, so the save
 * was refused instead of silently overwriting their change. `latest` is the current row.
 */
export class ConflictError<T> extends Error {
  constructor(readonly latest: T) {
    super('conflict')
  }
}

function client() {
  if (!supabase) throw new AdminError('notConfigured')
  return supabase
}

/** Turns anything thrown (Error, Supabase error object, string) into text. Known codes are left to the caller. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  if (typeof error === 'string' && error) return error
  return ''
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message)
}

// Postgres numeric columns can arrive as strings; make sure they are numbers.
export const toProduct = (row: ProductRow): ProductRow => ({
  ...row,
  price: Number(row.price),
  discount_price: row.discount_price == null ? null : Number(row.discount_price),
  stock: row.stock == null ? null : Number(row.stock),
  sort_order: Number(row.sort_order),
})

export const toCategory = (row: CategoryRow): CategoryRow => ({ ...row, sort_order: Number(row.sort_order) })

export const toSettings = (row: SettingsRow): SettingsRow => ({
  ...row,
  delivery_inside_fee: Number(row.delivery_inside_fee),
  delivery_outside_fee: Number(row.delivery_outside_fee),
  low_stock_threshold: Number(row.low_stock_threshold),
  content: (row.content ?? {}) as SettingsRow['content'],
})

export const toOrder = (row: OrderRow): OrderRow => ({
  ...row,
  number: Number(row.number),
  subtotal: Number(row.subtotal),
  delivery_fee: Number(row.delivery_fee),
  total: Number(row.total),
  items: (row.items ?? []).map((item) => ({ ...item, unit_price: Number(item.unit_price), qty: Number(item.qty) })),
})

/** Newest first. */
export const byNewest = (a: OrderRow, b: OrderRow) => b.created_at.localeCompare(a.created_at)

export const byOrder = <T extends { sort_order: number; name_en: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en)

/* ---------- Auth ---------- */

export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await client().from('admins').select('user_id').eq('user_id', userId).maybeSingle()
  fail(error)
  return data != null
}

/* ---------- Products ---------- */

export async function fetchProducts(): Promise<ProductRow[]> {
  const { data, error } = await client().from('products').select('*').order('sort_order').order('name_en')
  fail(error)
  return (data as ProductRow[]).map(toProduct)
}

async function fetchProduct(id: string): Promise<ProductRow | null> {
  const { data, error } = await client().from('products').select('*').eq('id', id).maybeSingle()
  fail(error)
  return data ? toProduct(data as ProductRow) : null
}

export async function createProduct(input: ProductInput): Promise<ProductRow> {
  const { data, error } = await client().from('products').insert(input).select()
  fail(error)
  if (!data?.length) throw new AdminError('nothingSaved')
  return toProduct(data[0] as ProductRow)
}

/**
 * What the row looked like when this screen loaded it. The save only goes through if the
 * row still matches, so two devices can't silently overwrite each other.
 * - `updated_at`: for full edits (product editor).
 * - `stock`: for quick stock changes.
 */
export type ProductGuard = { updated_at: string } | { stock: number | null }

/**
 * Updates a product. With a guard, throws ConflictError (holding the latest row) when the
 * product was changed elsewhere since it was loaded; throws AdminError('deleted') if it's gone.
 */
export async function updateProduct(id: string, patch: Partial<ProductInput>, guard?: ProductGuard): Promise<ProductRow> {
  let query = client().from('products').update(patch).eq('id', id)
  if (guard && 'updated_at' in guard) query = query.eq('updated_at', guard.updated_at)
  if (guard && 'stock' in guard) query = guard.stock === null ? query.is('stock', null) : query.eq('stock', guard.stock)
  const { data, error } = await query.select()
  fail(error)
  if (data?.length) return toProduct(data[0] as ProductRow)

  const latest = await fetchProduct(id)
  if (!latest) throw new AdminError('deleted')
  if (guard) throw new ConflictError(latest)
  throw new AdminError('nothingSaved')
}

export async function deleteProduct(id: string): Promise<void> {
  const { data, error } = await client().from('products').delete().eq('id', id).select('id')
  fail(error)
  if (!data?.length) throw new AdminError('nothingSaved')
}

/* ---------- Categories ---------- */

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await client().from('categories').select('*').order('sort_order').order('name_en')
  fail(error)
  return (data as CategoryRow[]).map(toCategory)
}

export async function createCategory(input: CategoryInput): Promise<CategoryRow> {
  const { data, error } = await client().from('categories').insert(input).select()
  fail(error)
  if (!data?.length) throw new AdminError('nothingSaved')
  return toCategory(data[0] as CategoryRow)
}

export async function updateCategory(id: string, patch: Partial<CategoryInput>): Promise<CategoryRow> {
  const { data, error } = await client().from('categories').update(patch).eq('id', id).select()
  fail(error)
  if (!data?.length) throw new AdminError('nothingSaved')
  return toCategory(data[0] as CategoryRow)
}

export async function deleteCategory(id: string): Promise<void> {
  const { data, error } = await client().from('categories').delete().eq('id', id).select('id')
  fail(error)
  if (!data?.length) throw new AdminError('nothingSaved')
}

/* ---------- Settings ---------- */

export async function fetchSettings(): Promise<SettingsRow | null> {
  const { data, error } = await client().from('settings').select('*').eq('id', 1).maybeSingle()
  fail(error)
  return data ? toSettings(data as SettingsRow) : null
}

/**
 * Saves settings only if nobody else saved them since `expectedUpdatedAt` (the `updated_at`
 * of the settings this form was loaded from). Otherwise throws ConflictError with the latest row.
 */
export async function saveSettings(patch: Partial<SettingsInput>, expectedUpdatedAt?: string): Promise<SettingsRow> {
  let query = client().from('settings').update(patch).eq('id', 1)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)
  const { data, error } = await query.select()
  fail(error)
  if (data?.length) return toSettings(data[0] as SettingsRow)

  const latest = await fetchSettings()
  if (latest && expectedUpdatedAt) throw new ConflictError(latest)
  throw new AdminError('nothingSaved')
}

/* ---------- Orders ---------- */

export async function fetchOrders(): Promise<OrderRow[]> {
  const { data, error } = await client().from('orders').select('*').order('created_at', { ascending: false }).limit(500)
  fail(error)
  return (data as OrderRow[]).map(toOrder)
}

async function fetchOrder(id: string): Promise<OrderRow | null> {
  const { data, error } = await client().from('orders').select('*').eq('id', id).maybeSingle()
  fail(error)
  return data ? toOrder(data as OrderRow) : null
}

/**
 * Runs one of the order functions in Supabase. `updatedAt` is the version of the order on
 * screen: if the order changed since (another device), throws ConflictError with the latest row.
 */
async function orderAction(fn: string, id: string, updatedAt: string, args: Record<string, unknown> = {}): Promise<OrderRow> {
  const { data, error } = await client().rpc(fn, { p_order_id: id, p_expected_updated_at: updatedAt, ...args })
  if (!error) return toOrder(data as OrderRow)

  switch (error.message) {
    case 'insufficient_stock':
      throw new StockError(JSON.parse(error.details || '[]') as StockProblem[])
    case 'order_missing':
      throw new AdminError('deleted')
    case 'not_allowed':
      throw new AdminError('notAllowed')
    case 'product_unavailable':
      throw new AdminError('productUnavailable')
    case 'order_changed':
    case 'order_wrong_status': {
      const latest = await fetchOrder(id)
      if (!latest) throw new AdminError('deleted')
      throw new ConflictError(latest)
    }
  }
  throw new Error(error.message)
}

/** Replaces the items of a pending order. New products are added at their current price. */
export const updateOrderItems = (order: OrderRow, items: { product_id: string; qty: number }[]) =>
  orderAction('update_order_items', order.id, order.updated_at, { p_items: items })

/** Approves a pending order and takes its items out of stock (all or nothing). */
export const approveOrder = (order: OrderRow) => orderAction('approve_order', order.id, order.updated_at)

/** Cancels a pending or approved order. An approved order's items go back in stock. */
export const cancelOrder = (order: OrderRow) => orderAction('cancel_order', order.id, order.updated_at)

/** Moves an approved or cancelled order back to pending. Undoing an approval puts its items back in stock. */
export const reopenOrder = (order: OrderRow) => orderAction('reopen_order', order.id, order.updated_at)

/* ---------- Live updates ---------- */

export interface LiveHandlers {
  onProduct: (change: { type: 'upsert'; row: ProductRow } | { type: 'delete'; id: string }) => void
  onCategory: (change: { type: 'upsert'; row: CategoryRow } | { type: 'delete'; id: string }) => void
  onSettings: (row: SettingsRow) => void
  /** 'insert' is a new order from the shop. */
  onOrder: (change: { type: 'insert' | 'update'; row: OrderRow } | { type: 'delete'; id: string }) => void
  /** true while connected and receiving changes. */
  onStatus: (live: boolean) => void
}

/**
 * Pushes every change to products, categories, settings and orders (from any device) to this screen.
 * Returns an unsubscribe function.
 */
export function subscribeToStore(handlers: LiveHandlers): () => void {
  if (!supabase) return () => undefined
  const channel: RealtimeChannel = supabase
    // Unique name: supabase reuses channels by name, and React may mount this twice in development.
    .channel(`admin-store-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
      if (payload.eventType === 'DELETE') handlers.onProduct({ type: 'delete', id: (payload.old as { id: string }).id })
      else handlers.onProduct({ type: 'upsert', row: toProduct(payload.new as ProductRow) })
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (payload) => {
      if (payload.eventType === 'DELETE') handlers.onCategory({ type: 'delete', id: (payload.old as { id: string }).id })
      else handlers.onCategory({ type: 'upsert', row: toCategory(payload.new as CategoryRow) })
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings' }, (payload) => {
      handlers.onSettings(toSettings(payload.new as SettingsRow))
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
      if (payload.eventType === 'DELETE') handlers.onOrder({ type: 'delete', id: (payload.old as { id: string }).id })
      else
        handlers.onOrder({
          type: payload.eventType === 'INSERT' ? 'insert' : 'update',
          row: toOrder(payload.new as OrderRow),
        })
    })
    .subscribe((status) => handlers.onStatus(status === 'SUBSCRIBED'))

  return () => {
    handlers.onStatus(false)
    void supabase?.removeChannel(channel)
  }
}

/* ---------- Product images (Storage) ---------- */

const PUBLIC_MARKER = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`

/** The file path inside our bucket, or null for site images like /images/x.webp. */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const index = url.indexOf(PUBLIC_MARKER)
  if (index === -1) return null
  const path = url.slice(index + PUBLIC_MARKER.length).split(/[?#]/)[0]
  return path ? decodeURIComponent(path) : null
}

export async function uploadProductImage(blob: Blob, baseName: string, ext: string): Promise<string> {
  const safeBase = baseName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'product'
  const path = `products/${safeBase}-${Date.now()}.${ext}`
  const bucket = client().storage.from(PRODUCT_IMAGES_BUCKET)
  const { error } = await bucket.upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: false,
  })
  fail(error)
  return bucket.getPublicUrl(path).data.publicUrl
}

/** Deletes an image from our bucket. Site images are left alone. Never throws. */
export async function removeStorageImage(url: string | null | undefined): Promise<void> {
  const path = storagePathFromUrl(url)
  if (!path || !supabase) return
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path])
  if (error) console.warn('Could not delete old product image', path, error.message)
}
