/* Service worker mínimo: permite instalar el sitio como app y abrirlo sin
   internet (muestra la última versión). Siempre intenta la red primero,
   así cada cambio que subas a GitHub se ve enseguida. Solo guarda archivos
   del propio sitio: nunca tus datos ni las llamadas a Supabase. */
const CACHE = 'bnz-v1';
const BASE = ['./', 'index.html', 'config.js', 'puente.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
