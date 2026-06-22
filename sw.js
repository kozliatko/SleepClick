const CACHE_NAME = 'sleepclick-cache-v12';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './i18n.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './apple-touch-icon.png',
  './fonts/outfit-latin.woff2',
  './fonts/outfit-latin-ext.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        fetch(e.request).then(res => {
          if (res?.status === 200)
            caches.open(CACHE_NAME).then(c => c.put(e.request, res));
        }).catch(() => {});
        return cached;
      }
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        return res;
      });
    })
  );
});

// ─── NOTIFICATION CLICK ──────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const scope = self.registration.scope;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.startsWith(scope));

      if (e.action === 'stop') {
        if (existing) {
          existing.postMessage({ type: 'STOP_SLEEP' });
          return existing.focus();
        }
        return self.clients.openWindow(scope + '?action=stop');
      }

      if (existing) return existing.focus();
      return self.clients.openWindow(scope);
    })
  );
});
