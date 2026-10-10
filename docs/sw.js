// Service worker: aplikasi tetap bisa dibuka tanpa internet, tetapi saat ONLINE selalu memakai versi terbaru
// (jaringan lebih dulu, cadangan dari cache). Versi cache berubah tiap build.
const CACHE = 'tamagotchi-26247e5700';
const ASSETS = [
  "./",
  "./app.js",
  "./audio.js",
  "./card.js",
  "./friend.mjs",
  "./layout.mjs",
  "./minigame.js",
  "./notify.mjs",
  "./scene.js",
  "./style.css",
  "./api.js",
  "./core.js",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./index.html"
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  // 'reload' melewati cache HTTP browser/GitHub Pages agar berkas yang di-cache benar-benar versi baru
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    Promise.race([
      fetch(req, { cache: 'no-cache' }), // validasi ulang ke server (murah: 304 bila tidak berubah)
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ])
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./'))),
  );
});
