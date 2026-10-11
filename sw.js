// Pig Path service worker.
// The version comes from the registration URL (sw.js?v=X.Y.Z, set from js/version.js),
// so bumping APP_VERSION automatically refreshes the cache on your iPhone.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `pigpath-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/version.js',
  'js/store.js',
  'js/ui.js',
  'js/sheet.js',
  'js/map.js',
  'js/waShield.js',
  'js/search.js',
  'js/directions.js',
  'js/navigation.js',
  'js/safety.js',
  'js/adventure.js',
  'js/curviness.js',
  'js/fog.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/pig.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('pigpath-') && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

function stash(req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App files: network first (so updates show up), cache as offline fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => stash(req, res))
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
    );
    return;
  }

  // Mapbox GL library (versioned URL): cache first.
  if (url.href.startsWith('https://api.mapbox.com/mapbox-gl-js/')) {
    event.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => stash(req, res))));
  }
  // Map tiles / traffic / API calls go straight to the network.
});
