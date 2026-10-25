// Sends a Web Push notification about a new shop order to every admin device that turned
// notifications on (Admin → Orders). Called by the orders INSERT trigger
// (private.notify_new_order) through pg_net, with a shared secret instead of a JWT.
//
// Keys live in Supabase Vault and are read with public.push_config() (service role only):
//   push_vapid_public_key, push_vapid_private_key, push_vapid_subject, push_notify_secret
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface PushConfig {
  push_vapid_public_key: string
  push_vapid_private_key: string
  push_vapid_subject: string
  push_notify_secret: string
}

interface Target {
  endpoint: string
  p256dh: string
  auth: string
  lang: 'en' | 'ar'
}

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Same style as the admin panel: whole numbers as is, otherwise two decimals.
const qar = (value: number, lang: Target['lang']) =>
  `${Number.isInteger(value) ? String(value) : value.toFixed(2)} ${lang === 'ar' ? 'ر.ق' : 'QAR'}`

function message(order: { id: string; number: number; customer_name: string; total: number }, lang: Target['lang']) {
  const total = qar(Number(order.total), lang)
  return JSON.stringify({
    title: lang === 'ar' ? `طلب جديد #${order.number}` : `New order #${order.number}`,
    body: lang === 'ar' ? `من ${order.customer_name} · ${total}` : `From ${order.customer_name} · ${total}`,
    tag: `order-${order.id}`,
    url: '/admin#/orders',
  })
}

/** Constant-time comparison, so the secret can't be guessed one character at a time. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const { data: config, error: configError } = await supabase.rpc('push_config')
  if (configError || !config) return json({ error: 'config_unavailable' }, 500)
  const keys = config as PushConfig
  if (!keys.push_notify_secret || !sameSecret(req.headers.get('x-notify-secret') ?? '', keys.push_notify_secret)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const { order_id } = (await req.json().catch(() => ({}))) as { order_id?: string }
  if (!order_id) return json({ error: 'missing_order_id' }, 400)

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, number, customer_name, total')
    .eq('id', order_id)
    .maybeSingle()
  if (orderError) return json({ error: orderError.message }, 500)
  if (!order) return json({ error: 'order_missing' }, 404)

  const { data: targets, error: targetsError } = await supabase.rpc('push_targets')
  if (targetsError) return json({ error: targetsError.message }, 500)

  webpush.setVapidDetails(keys.push_vapid_subject, keys.push_vapid_public_key, keys.push_vapid_private_key)

  const expired: string[] = []
  let sent = 0
  let failed = 0
  await Promise.all(
    (targets as Target[]).map(async (target) => {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          message(order, target.lang),
          { TTL: 60 * 60 * 12, urgency: 'high' },
        )
        sent++
      } catch (e) {
        const { statusCode: status, body } = e as { statusCode?: number; body?: string }
        // 404/410: the browser dropped this subscription (app removed, permission revoked…).
        if (status === 404 || status === 410) expired.push(target.endpoint)
        else {
          failed++
          console.error('push failed', new URL(target.endpoint).host, status, body || (e as Error).message)
        }
      }
    }),
  )

  if (expired.length > 0) {
    const { error } = await supabase.from('push_subscriptions').delete().in('endpoint', expired)
    if (error) console.error('could not delete expired subscriptions', error.message)
  }

  return json({ sent, failed, expired: expired.length })
})
