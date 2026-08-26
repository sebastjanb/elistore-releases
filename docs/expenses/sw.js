/* Offline shell. The app itself is precached; the heavy OCR and spreadsheet
   files are cached the first time they are actually used, so installing the app
   stays quick. Anything off-origin (map routing, place search) is left alone —
   it must be allowed to fail so the app can fall back to its own estimate. */
// Bump this whenever anything in PRECACHE changes, or an already
// installed copy keeps serving the old files forever.
const VERSION = 'v6';
const SHELL = 'shell-' + VERSION;
const RUNTIME = 'runtime-' + VERSION;

const PRECACHE = [
  './',
  'index.html',
  'css/app.css',
  'data/places.js',
  'data/countries.js',
  'js/util.js',
  'js/icons.js',
  'js/store.js',
  'js/distance.js',
  'js/ocr.js',
  'js/trip.js',
  'js/components.js',
  'js/forms.js',
  'js/views.js',
  'js/sync.js',
  'js/excel.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // routing / geocoding: straight to the network

  // Navigations: serve the shell so a deep link works offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('index.html', { ignoreSearch: true }))
    );
    return;
  }

  // The bundled OCR engine and spreadsheet library never change between
  // releases, so once they are cached they are served straight from there.
  const immutable = url.pathname.includes('/vendor/') || url.pathname.includes('/icons/');

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(immutable ? RUNTIME : SHELL).then((c) => c.put(req, copy));
        }
        return res;
      });
      if (hit && immutable) return hit;
      // Everything else: serve the cached copy at once but refresh it in the
      // background, so a new build is picked up on the next launch.
      if (hit) {
        network.catch(() => {});
        return hit;
      }
      return network;
    })
  );
});
