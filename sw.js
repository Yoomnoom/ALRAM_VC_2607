const CACHE_NAME = 'alarm-app-shell-v25-settings-boxes';

const SHELL_PATHS = [
  './',
  './index.html',
  './style.css?v=25',
  './script.js?v=25',
  './news/news.js',
  './news/news.css',
  './radar/radar.js',
  './radar/radar.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_PATHS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .catch(() => {})
  );
  self.clients.claim();
});

const SHELL_URLS = new Set(SHELL_PATHS.map((path) => new URL(path, self.registration.scope).href));

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || !SHELL_URLS.has(request.url)) {
    return;
  }

  if (request.mode === 'navigate' || request.url.endsWith('/index.html')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
