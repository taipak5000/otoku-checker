// service-worker.js — stale-while-revalidate 方式のオフライン対応。
//
// 方針(このプロジェクトの決めごと):
// - キャッシュがあれば速度優先で即座にそれを返す
// - 同時に裏側でネットワークから最新版を取得し、成功していればキャッシュを更新する
//   (表示はこのネットワーク取得の完了を待たない)
// - キャッシュが無い初回リクエストだけ、ネットワークの完了を待って返す
// これにより、サイトを一度開くだけで裏側から自動的に最新化されるため、
// CACHE_NAME の更新を忘れても「更新したのに反映されない」という実害が出にくい。
// CACHE_NAME はキャッシュの「入れ物」を区別するためだけのもので、
// 中身の更新のたびに上げる必要はない(そこが cache-first-then-network 方式との違い)。

const CACHE_NAME = 'otoku-checker-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './calc.js',
  './storage.js',
  './motion.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 同一オリジンのみ対象

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const revalidate = (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone());
          }
          return res;
        } catch (err) {
          return cached; // オフライン等はキャッシュへフォールバック
        }
      })();

      if (cached) {
        event.waitUntil(revalidate); // 裏側の更新はレスポンスを待たせず継続させる
        return cached;
      }
      return revalidate; // キャッシュが無い初回はネットワークの完了を待つ
    })()
  );
});
