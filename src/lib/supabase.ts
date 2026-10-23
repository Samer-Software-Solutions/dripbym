import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Null when the env vars are missing; the shop then falls back to its built-in data. */
export const supabase = url && key ? createClient(url, key) : null

export const PRODUCT_IMAGES_BUCKET = 'product-images'
