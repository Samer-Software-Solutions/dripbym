// Service worker for the admin panel (scope /admin): shows new-order push notifications.
// It has no fetch handler on purpose, so it never caches or changes how pages load.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Drip by M', {
      body: data.body || '',
      tag: data.tag,
      icon: '/images/admin-icon-192.png',
      badge: '/images/admin-icon-192.png',
      data: { url: data.url || '/admin#/orders' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/admin#/orders', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const admin = windows.find((client) => new URL(client.url).pathname.startsWith('/admin'))
      if (admin) {
        // The panel switches to the Orders tab itself (see push.ts).
        admin.postMessage({ type: 'open-orders' })
        return admin.focus()
      }
      return self.clients.openWindow(url)
    })(),
  )
})
