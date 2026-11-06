/* Madvert Labs Patches CRM service worker: new RFQ notifications, opening the right lead, and an offline note. */
const OFFLINE = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui;padding:32px;text-align:center;color:#0b172a"><h1>You are offline</h1><p>Your leads load again as soon as you are back online.</p></body>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Pages always come from the network so data is live; only a dropped connection shows the offline note.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html' } })));
});

self.addEventListener('push', (event) => {
  let msg = { title: 'Madvert Labs Patches CRM', body: 'You have a new update.', url: '/patches/notifications', tag: 'crm' };
  try { msg = { ...msg, ...event.data.json() }; } catch (e) { /* plain text push */ }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // An open CRM window plays the cha-ching and shows its own popup, then refreshes the data.
    wins.forEach((w) => {
      if (msg.alert) w.postMessage({ type: 'crm-new-lead', alert: msg.alert });
      w.postMessage({ type: 'crm-refresh' });
    });
    // The phone notification, with the Madvert Labs logo. Browsers play the phone's own notification sound;
    // the vibration pattern gives it a cash register feel (cha... ching-ching).
    await self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      renotify: true,
      requireInteraction: !!msg.urgent,
      icon: '/crm/icon-192.png',
      badge: '/crm/badge-96.png',
      vibrate: [90, 60, 220, 80, 220],
      timestamp: Date.now(),
      data: { url: msg.url },
      actions: msg.alert ? [{ action: 'open', title: 'Open lead' }] : [],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/patches/notifications', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.includes('/patches') && 'focus' in w) { await w.navigate(url).catch(() => undefined); return w.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
