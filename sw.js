/* Service worker: deixa o app utilizável sem sinal depois da primeira visita.
   Páginas: network-first (pega versão nova quando há rede). Estáticos: cache-first.
   Ao publicar mudanças, suba VERSION para descartar o cache antigo. */
const VERSION = 'tce-comunidade-v9';
const ASSETS = ['./', './index.html', './tv.html', './css/base.css', './css/app.css', './css/tv.css', './js/data.js', './js/shared.js', './js/icons.js', './js/app.js', './js/tv.js', './vendor/qrcode.js', './img/tce-logo.png', './img/tce-mark.png', './manifest.webmanifest', './css/map.css', './js/map.js', './img/planta-jn.jpg', './img/planta-manga.jpg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html');
  if (isPage) {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
  }
});
