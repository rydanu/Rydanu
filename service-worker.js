// Ryvio — simple offline-friendly cache-first service worker
const CACHE_NAME = 'ryvio-cache-v126';
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
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clean.clone()));
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
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clean.clone()));
          }
          return clean;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
