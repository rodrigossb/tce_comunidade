/* Service worker: deixa o app utilizável sem sinal depois da primeira visita.
   Páginas: network-first (pega versão nova quando há rede). _next/static (nomes com hash) e imagens: cache-first.
   Ao publicar, o nome do cache muda pela VERSION; os chunks antigos saem na ativação. */
const VERSION = 'tce-comunidade-v66';
const PAGES = ['./', './index.html', './tv.html', './totem.html', './manifest.webmanifest', './img/tce-logo.png', './img/tce-mark.png', './img/planta-jn.jpg', './img/planta-manga.jpg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(PAGES.map((p) => c.add(p)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const immutable = url.pathname.includes('/_next/static/') || /\.(png|jpe?g|svg|webp|woff2?)$/.test(url.pathname);
  if (immutable) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })));
  } else {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))));
  }
});
