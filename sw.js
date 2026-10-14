const CACHE_NAME = 'basari-istasyonu-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/deneme.html',
  '/hata_defteri.html',
  '/pomodoro.html',
  '/ozet.html'
];

// Kurulum ve önbelleğe alma
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// İstekleri yakalama
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});
