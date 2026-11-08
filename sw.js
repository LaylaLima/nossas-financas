// Deixa o app instalável e abrindo offline. Sempre tenta a rede primeiro (código atualizado).
const CACHE = 'financas-v6';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'crypto.js', 'backend.js', 'data.js', 'charts.js', 'xlsx.js', 'insights.js', 'buys.js', 'obra.js', 'config.js', 'manifest.json', 'icon.svg', 'icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // dados do Supabase nunca vão para o cache
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request)));
});
