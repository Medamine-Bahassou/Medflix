// images survive navigation and reloads without depending on third-party cache headers.
const PREFIX = 'medflix-images-v1-', WEEK = 7 * 86400e3, LIMIT = 128;
const flights = new Map();
let activeCache = '';
const cacheName = () => PREFIX + Math.floor(Date.now() / WEEK);
async function imageCache() {
  const name = cacheName();
  if (activeCache !== name) {
    activeCache = name;
    await Promise.all((await caches.keys()).filter(k => k.startsWith('medflix-images-') && k !== name).map(k => caches.delete(k)));
  }
  return caches.open(name);
}
async function imageResponse(request) {
  const key = request.url;
  if (!flights.has(key)) {
    const pending = (async () => {
      const cache = await imageCache().catch(() => null);
      const hit = await cache?.match(request).catch(() => null);
      if (hit) return hit;
      const response = await fetch(request);
      if (cache && (response.ok || response.type === 'opaque')) {
        try {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          await Promise.all(keys.slice(0, Math.max(0, keys.length - LIMIT)).map(k => cache.delete(k)));
        } catch {} // quota / private browsing: the network image still works
      }
      return response;
    })().finally(() => flights.delete(key));
    flights.set(key, pending);
  }
  return (await flights.get(key)).clone();
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const r = event.request;
  // cors images (e.g. a canvas export), videos, documents and API calls stay out of this cache.
  if (r.method === 'GET' && r.destination === 'image' && r.mode === 'no-cors' && /^https?:/.test(r.url)) {
    event.respondWith(imageResponse(r));
  }
});
self.addEventListener('message', event => {
  if (event.data?.type === 'image-error' && /^https?:/.test(event.data.url || '')) {
    event.waitUntil(caches.open(cacheName()).then(cache => cache.delete(event.data.url)).catch(() => {}));
  }
});
