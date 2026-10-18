const CACHE_NAME = 'basari-istasyonu-v1.2';
const urlsToCache = [
  '/',
  '/index.html',
  '/deneme.html',
  '/hata_defteri.html',
  '/pomodoro.html',
  '/ozet.html'
];

// 1. Kurulum ve önbelleğe alma
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 2. Aktif olma ve eski önbellekleri temizleme
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 3. Ağ isteklerini yakalama ve önbellekten sunma
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});

// 4. Sayfadan gelen yerel bildirim isteklerini dinleme
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const title = event.data.title || 'Başarı İstasyonu';
    const options = {
      body: event.data.body || 'Sıradaki etkinliği kaçırma!',
      icon: event.data.icon || '/android-chrome-192x192.png',
      badge: event.data.badge || '/favicon-32x32.png',
      vibrate: [200, 100, 200],
      tag: event.data.tag || 'basari-istasyonu-notification',
      renotify: true,
      data: {
        url: event.data.url || '/'
      }
    };

    self.registration.showNotification(title, options);
  }
});

// 5. Bildirime tıklandığında uygulamayı açma veya odaklanma
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 6. Arka plan/Push bildirimleri dinleyici (Sunucudan gelenler)
self.addEventListener('push', (event) => {
  let data = { title: 'Başarı İstasyonu', body: 'Yeni bir hatırlatma var!', url: '/' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});