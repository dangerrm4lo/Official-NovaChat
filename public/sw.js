// ==========================================================
// sw.js — Service Worker для NovaChat (PWA)
// Кэширует статические файлы для работы офлайн
// ==========================================================

const CACHE_NAME = 'novachat-v1';

// Файлы, которые будут кэшироваться при установке
const ASSETS = [
  '/',
  '/index.html',
  '/chat.html',
  '/settings.html',
  '/css/style.css',
  '/css/auth.css',
  '/css/chat.css',
  '/css/settings.css',
  '/js/auth.js',
  '/js/chat.js',
  '/js/settings.js',
  '/manifest.json',
  '/assets/favicon.png',
  '/assets/logo.png',
  '/assets/icon-72x72.png',
  '/assets/icon-96x96.png',
  '/assets/icon-128x128.png',
  '/assets/icon-144x144.png',
  '/assets/icon-152x152.png',
  '/assets/icon-192x192.png',
  '/assets/icon-384x384.png',
  '/assets/icon-512x512.png'
];

// ===== УСТАНОВКА =====
self.addEventListener('install', (event) => {
  console.log('[SW] Установка...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Кэширование файлов...');
        return cache.addAll(ASSETS);
      })
      .then(() => {
        console.log('[SW] Все файлы закэшированы');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Ошибка кэширования:', error);
      })
  );
});

// ===== АКТИВАЦИЯ =====
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Удаление старого кэша:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Готов к работе');
        return self.clients.claim();
      })
  );
});

// ===== ПЕРЕХВАТ ЗАПРОСОВ =====
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Пропускаем запросы к API (они не кэшируются)
  if (request.url.includes('/api/')) {
    return;
  }

  // Пропускаем запросы к файлам, которые могут часто меняться
  if (request.url.includes('users.json') || request.url.includes('chats.json')) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Если есть в кэше — возвращаем
        if (cachedResponse) {
          return cachedResponse;
        }

        // Если нет — идём в сеть и кэшируем ответ
        return fetch(request)
          .then((response) => {
            // Кэшируем только успешные ответы
            if (response && response.status === 200) {
              const clonedResponse = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, clonedResponse);
                });
            }
            return response;
          })
          .catch(() => {
            // Если сеть недоступна — показываем страницу "Нет соединения"
            if (request.headers.get('Accept').includes('text/html')) {
              return caches.match('/offline.html');
            }
          });
      })
  );
});

// ===== УВЕДОМЛЕНИЯ (Push) =====
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || 'NovaChat';
  const options = {
    body: data.body || 'Новое сообщение',
    icon: '/assets/logo.png',
    badge: '/assets/favicon.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/chat.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ===== КЛИК ПО УВЕДОМЛЕНИЮ =====
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/chat.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Если уже есть открытое окно — переключаемся на него
        for (const client of clientList) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        // Иначе открываем новое
        return clients.openWindow(url);
      })
  );
});