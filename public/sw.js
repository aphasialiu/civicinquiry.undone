// 離線閱讀用 Service Worker（ADR-006）。原則：
// 1. 只快取同源 GET；絕不快取 /api/（搜尋結果不得離線保存）與 /content/status.json（狀態必須新鮮，
//    離線時讀不到就是「歷史閱讀」，這是設計）。
// 2. 外殼（HTML）與內容 JSON 一律「網路優先」，離線才退回快取；雜湊檔名的 /assets/ 用快取優先。
// 3. 版本識別碼綁整個建置：新版啟用時刪除舊快取，避免舊外殼配新內容。
const VERSION = '__BUILD_ID__';
const CACHE = `civic-inquiry-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('civic-inquiry-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname === '/content/status.json') return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!cacheable(url)) return; // 交給瀏覽器照常處理（不經快取）

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))),
  );
});
