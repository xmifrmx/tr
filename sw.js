// mifrm.eu.cc — Service Worker
// Amaç: SADECE cdn.jsdelivr.net'ten gelen statik CSS/JS/ikon dosyalarini hizlandirmak.
// Sayfa HTML'lerine, Blogger /feeds/ API'sine ve kendi domaininize KESINLIKLE dokunmaz —
// forum icerigi (konular/yorumlar) her zaman canli/guncel kalir.

const CACHE_NAME = 'mifrm-static-v1';
const STATIC_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const req = event.request;

  // Sadece GET istekleri
  if (req.method !== 'GET') return;

  // Sayfa gezinmelerine (HTML) hic dokunma — her zaman ag'dan gelsin
  if (req.mode === 'navigate') return;

  const url = new URL(req.url);

  // Kendi domaininize (mifrm.eu.cc uzerinden Blogger'a giden her sey) dokunma
  if (url.hostname === self.location.hostname) return;

  // Blogger feed/AJAX uclarina asla dokunma (forum verisi canli kalmali)
  if (url.pathname.indexOf('/feeds/') !== -1) return;

  // Sadece bilinen statik CDN host'larini cache'le
  if (STATIC_HOSTS.indexOf(url.hostname) === -1) return;

  // stale-while-revalidate: onbellekten hemen don, arka planda guncelle
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (cached) {
        const network = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          return cached;
        });
        return cached || network;
      });
    })
  );
});
