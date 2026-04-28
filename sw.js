const CACHE_NAME = 'scale-charts-pwa-v41';
const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data/audio/CREDITS.txt',
  './data/audio/bass/electric-bass-finger-E1.mp3',
  './data/audio/bass/electric-bass-finger-F1.mp3',
  './data/audio/bass/electric-bass-finger-Gb1.mp3',
  './data/audio/bass/electric-bass-finger-G1.mp3',
  './data/audio/bass/electric-bass-finger-Ab1.mp3',
  './data/audio/bass/electric-bass-finger-A1.mp3',
  './data/audio/bass/electric-bass-finger-Bb1.mp3',
  './data/audio/bass/electric-bass-finger-B1.mp3',
  './data/audio/bass/electric-bass-finger-C2.mp3',
  './data/audio/bass/electric-bass-finger-Db2.mp3',
  './data/audio/bass/electric-bass-finger-D2.mp3',
  './data/audio/bass/electric-bass-finger-Eb2.mp3',
  './data/audio/bass/electric-bass-finger-E2.mp3',
  './data/audio/bass/electric-bass-finger-F2.mp3',
  './data/audio/bass/electric-bass-finger-Gb2.mp3',
  './data/audio/bass/electric-bass-finger-G2.mp3',
  './data/audio/bass/electric-bass-finger-Ab2.mp3',
  './data/audio/bass/electric-bass-finger-A2.mp3',
  './data/audio/bass/electric-bass-finger-Bb2.mp3',
  './data/audio/bass/electric-bass-finger-B2.mp3',
  './data/audio/bass/electric-bass-finger-C3.mp3',
  './data/audio/bass/electric-bass-finger-Db3.mp3',
  './data/audio/bass/electric-bass-finger-D3.mp3',
  './data/audio/bass/electric-bass-finger-Eb3.mp3',
  './data/audio/bass/electric-bass-finger-E3.mp3',
  './data/audio/bass/electric-bass-finger-F3.mp3',
  './data/audio/bass/electric-bass-finger-Gb3.mp3',
  './data/audio/bass/electric-bass-finger-G3.mp3',
  './data/common-progressions-pack.json',
  './vendor/svguitar.umd.js',
  './data/templates/registry.json',
  './data/templates/caged-voicings.json',
  './data/templates/scale-overlays.json',
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});