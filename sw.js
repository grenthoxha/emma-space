const CACHE_NAME = "emma-space-v20-personal-tools";
const APP_SHELL = [
  "./",
  "./index.html",
  "./schedule-pdf.js",
  "./journal-editor.js",
  "./journal-pdf.js",
  "./space-model.js",
  "./account-storage.js?v=20",
  "./life-tools.js?v=20",
  "./reminders.js?v=20",
  "./app-improvements.js?v=20",
  "./improvements.css?v=20",
  "./responsive.css",
  "./responsive.js",
  "./auth.css",
  "./auth-config.js?v=20",
  "./admin.html",
  "./admin.css?v=18",
  "./admin-service.js?v=20",
  "./admin-ui.js?v=20",
  "./vendor/supabase.js",
  "./supabase-auth.js?v=20",
  "./auth-service.js?v=17",
  "./auth-ui.js?v=20",
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

self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  const base=new URL('./',self.registration.scope);
  let target=new URL('#study',base);
  try{const candidate=new URL(payload.url,base);if(candidate.origin===base.origin&&candidate.pathname===base.pathname)target=candidate;}catch{}
  event.waitUntil(self.registration.showNotification('Emma’s Space',{
    body:typeof payload.body==='string'?payload.body.slice(0,180):'Ke një kujtesë të re.',
    icon:new URL('icon-192.png',base).href,badge:new URL('icon-192.png',base).href,
    tag:typeof payload.tag==='string'?payload.tag.slice(0,240):'emma-reminder',
    data:{url:target.href}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const base=new URL('./',self.registration.scope);let target=new URL('#study',base);
  try{const candidate=new URL(event.notification.data?.url);if(candidate.origin===base.origin&&candidate.pathname===base.pathname)target=candidate;}catch{}
  event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(client=>client.url.startsWith(base.href));if(existing){await existing.navigate(target.href);await existing.focus();}else await self.clients.openWindow(target.href);})());
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
  if (url.origin !== self.location.origin || ['code','error','access_token','refresh_token','token_hash'].some(key => url.searchParams.has(key))) return;
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
