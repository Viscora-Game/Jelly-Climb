'use strict';

const CACHE_NAME = 'jelly-climb-twa-v29';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/privacy-policy.html',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-512-maskable.png',
  '/assets/audio/cybercore_sound_2_hollywood.wav',
  '/assets/bgm/arcade-theme.mp3',
  '/src/constants.js',
  '/src/i18n.js',
  '/src/audio.js',
  '/src/particles.js',
  '/src/accessories.js',
  '/src/abilities.js',
  '/src/collectibles.js',
  '/src/player.js',
  '/src/obstacles.js',
  '/src/bosses.js',
  '/src/levelGenerator.js',
  '/src/leaderboard.js',
  '/src/game.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache dynamic API calls, service worker updates, or Digital Asset Links
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/.well-known/') ||
    url.pathname === '/sw.js'
  ) {
    return;
  }

  // Navigation requests: network-first with instant cached offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Game scripts & media: network-first with seamless offline fallback
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
