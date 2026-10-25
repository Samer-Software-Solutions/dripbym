// Phone notifications for new orders (Web Push).
// - public/admin-sw.js shows the notification and opens the Orders tab when it is tapped.
// - Subscriptions are saved in Supabase (push_subscriptions); the notify-new-order Edge Function
//   sends to them when a new order is inserted.
import { supabase } from '../lib/supabase'
import { AdminError } from './api'
import type { Lang } from './i18n'

/** Public half of the VAPID key pair. The private half is in Supabase Vault (push_vapid_private_key). */
const VAPID_PUBLIC_KEY = 'BMeex2rOOAFhAPNBMxXGi8Krqn6XtgG9WoZCualD9JywJKusP6qeyd86oVihcaICkGNZGvo0obg_LK_OiaUdDfM'

const SW_URL = '/admin-sw.js'
const SW_SCOPE = '/admin'

/**
 * - needs-install: iPhone/iPad Safari, which only allows notifications for web apps opened from the Home Screen.
 * - denied: the person blocked notifications for this site in the browser.
 */
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function needsHomeScreen(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return ios && !standalone
}

function keyBytes(base64url: string): Uint8Array {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

const toBase64url = (buffer: ArrayBuffer | null) =>
  buffer ? btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : ''

/** Registers the admin service worker. Safe to call on every load. */
export function registerAdminWorker(): void {
  if (!supported()) return
  navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch((e) => console.warn('Service worker not registered', e))
}

/** Tapping a notification while the panel is already open asks it to show the Orders tab. */
export function onOpenOrdersRequest(handler: () => void): () => void {
  if (!supported()) return () => undefined
  const listener = (event: MessageEvent) => {
    if ((event.data as { type?: string } | null)?.type === 'open-orders') handler()
  }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE)
  return (await registration?.pushManager.getSubscription()) ?? null
}

export async function readPushState(): Promise<PushState> {
  if (needsHomeScreen() && !supported()) return 'needs-install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

async function save(subscription: PushSubscription, lang: Lang): Promise<void> {
  if (!supabase) throw new AdminError('notConfigured')
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: toBase64url(subscription.getKey('p256dh')),
    p_auth: toBase64url(subscription.getKey('auth')),
    p_lang: lang,
  })
  if (error) throw error.message === 'not_allowed' ? new AdminError('notAllowed') : new Error(error.message)
}

/** Asks for permission and subscribes this device. Must be called straight from a tap/click. */
export async function enablePush(lang: Lang): Promise<PushState> {
  // Ask first, before any other await: Safari only shows the prompt during the tap itself.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
  const registration = await navigator.serviceWorker.ready
  const key = keyBytes(VAPID_PUBLIC_KEY)
  let subscription = await registration.pushManager.getSubscription()
  // A subscription made with an older key can't be reused.
  if (subscription && toBase64url(subscription.options.applicationServerKey) !== VAPID_PUBLIC_KEY) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })

  try {
    await save(subscription, lang)
  } catch (e) {
    await subscription.unsubscribe().catch(() => undefined)
    throw e
  }
  return 'on'
}

/** Stops notifications on this device. Never throws for the database part: the server drops dead subscriptions itself. */
export async function disablePush(): Promise<void> {
  if (!supported()) return
  const subscription = await currentSubscription()
  if (!subscription) return
  const { endpoint } = subscription
  await subscription.unsubscribe()
  const { error } = (await supabase?.from('push_subscriptions').delete().eq('endpoint', endpoint)) ?? { error: null }
  if (error) console.warn('Could not remove the push subscription', error.message)
}

/** Re-saves this device's subscription, so its language (and keys, if the browser renewed them) stay current. */
export async function refreshPush(lang: Lang): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return
  const subscription = await currentSubscription()
  if (subscription) await save(subscription, lang)
}
