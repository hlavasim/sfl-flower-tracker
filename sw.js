// Tombstone service worker — the PWA was removed (backend-split migration).
//
// This stub REPLACES the old caching service worker so that already-installed
// clients tear themselves down. The browser re-fetches /sw.js on its own update
// check during navigation (independent of any page-side register() call, which is
// also gone), sees this new byte content, installs it, and on activate it deletes
// every cache this origin created, unregisters itself, and reloads open windows so
// they drop out of SW control and fetch fresh content directly from the network.
//
// It intentionally registers NO fetch handler: while briefly active it must not
// intercept or serve anything from cache. Keep this file in place — deleting it
// (404) does not reliably retire a deployed service worker; serving this does.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) client.navigate(client.url);
  })());
});
