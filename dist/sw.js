const CACHE_NAME = "emma-space-v15-header-scroll-clip";
const APP_SHELL = [
  "./",
  "./index.html",
  "./schedule-pdf.js",
  "./journal-editor.js",
  "./journal-pdf.js",
  "./space-model.js",
  "./responsive.css",
  "./responsive.js",
  "./auth.css",
  "./auth-config.js",
  "./auth-service.js",
  "./auth-ui.js",
  "./vendor/pdf.js",
  "./vendor/pdf.worker.js",
  "./manifest.webmanifest",
  "./avatar.webp",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('emma-space-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const mayCache = response => response && response.ok && !/no-store|private/i.test(response.headers.get('Cache-Control') || '');

self.addEventListener("fetch", event => {
  // Never cache credentials, session checks, registration or private auth APIs.
  // Reserve /api/ for the future same-origin backend; no app-shell fallback here.
  const url = new URL(event.request.url);
  if (event.request.cache === 'no-store' || (url.origin === self.location.origin && /\/(?:api|auth)(?:\/|$)/.test(url.pathname))) return;
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if(mayCache(response)){
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request)
        .then(response => {
          if (mayCache(response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
