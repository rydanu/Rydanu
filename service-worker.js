// Rydanu — simple offline-friendly cache-first service worker
const CACHE_NAME = 'rydanu-cache-v287';
const CORE_ASSETS = [
  './',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function stripRedirect(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clean = stripRedirect(res);
          if (clean && clean.status === 200) {
            // Bugfix (20.8., Joerg gemeldet ueber Konsolen-Fehler "Response body is already
            // used"): .clone() muss SOFORT/synchron passieren, direkt hier -- nicht erst
            // innerhalb des asynchronen caches.open().then(...). Vorher lief das Zurueckgeben der
            // Antwort an die Seite (naechste Zeile) oft schneller als der Cache-Put, wodurch der
            // Cache manchmal eine kaputte/leere Kopie bekam (Wettlauf-Bedingung). Das konnte zu
            // fehlerhaft ausgelieferten CSS-/Font-/Bild-Dateien beim naechsten Laden fuehren.
            const cacheCopy = clean.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
          }
          return clean;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          const clean = stripRedirect(networkResponse);
          if (clean && clean.status === 200) {
            // Gleicher Bugfix wie oben: sofort/synchron klonen statt erst im async .then().
            const cacheCopy = clean.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
          }
          return clean;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ============================================================
// Villa Partner Phase 1 — Push-Benachrichtigungen
// Wird von der Edge Function notify-villa-request ausgeloest, sobald eine neue Villa-Anfrage
// zu einem passenden Fahrer passt. Payload-Form (siehe Edge Function): { title, body, url, requestId }
// ============================================================
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Rydanu', body: event.data ? event.data.text() : 'Neue Benachrichtigung' };
  }
  const title = payload.title || 'Rydanu';
  const options = {
    body: payload.body || '',
    icon: './apple-touch-icon.png',
    badge: './apple-touch-icon.png',
    data: { url: payload.url || './', requestId: payload.requestId || null },
    tag: payload.requestId ? ('villa-' + payload.requestId) : undefined
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
