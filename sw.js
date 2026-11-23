// 離線快取
// 開啟頁面：先試網路（最多等 3 秒），失敗或太慢就用 iPad 裡的備份 → 球場沒網路也能開
// 圖示等其他檔案：直接用備份，背景更新
const CACHE = 'waseda-scorebook-v7';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// iOS Safari 不接受「經過轉址」的快取回應，這裡重新包裝成乾淨的回應
async function clean(r) {
  if (!r || !r.redirected) return r;
  const body = await r.blob();
  return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
}
function timeout(ms) { return new Promise(res => setTimeout(() => res(null), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(async r => {
        if (r && r.ok) { const c = await clean(r.clone()); await cache.put('./index.html', c); }
        return r;
      }).catch(() => null);
      const r = await Promise.race([net, timeout(3000)]);
      if (r && r.ok) return clean(r);
      const cached = await cache.match('./index.html');
      return clean(cached || (await net) || new Response('離線且沒有備份，請連網後再開一次', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    })());
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req, { cache: 'no-cache' }).then(async r => { if (r && r.ok) await cache.put(req, await clean(r.clone())); return r; }).catch(() => null);
    return clean(cached || (await net) || Response.error());
  })());
});
