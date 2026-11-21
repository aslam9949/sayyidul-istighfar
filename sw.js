/* Offline shell + audio. CACHE is generated from the shell content at build time. */
const CACHE = 'duas-609f5bd3';
const SHELL = [
 "index.html",
 "assets/app.css",
 "assets/fonts.css",
 "assets/app.js",
 "assets/hub.js",
 "assets/lessons/index.js",
 "manifest.webmanifest",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/apple-touch-icon.png",
 "istighfar.html",
 "assets/lessons/istighfar.js",
 "rahmah.html",
 "assets/lessons/rahmah.js",
 "ihdini.html",
 "assets/lessons/ihdini.js",
 "habli.html",
 "assets/lessons/habli.js",
 "ajz.html",
 "assets/lessons/ajz.js",
 "wahdahu.html",
 "assets/lessons/wahdahu.js",
 "hawdi.html",
 "assets/lessons/hawdi.js",
 "ayatul-kursi.html",
 "assets/lessons/ayatul-kursi.js"
];

self.addEventListener('install', e => {
  // cache each entry individually: addAll() is all-or-nothing, so one missing file would make
  // the whole offline mode fail to install with no visible error
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u =>
    c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // audio: cache-first and keep it, so a learned lesson stays playable offline
  if (url.pathname.endsWith('.mp3')) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  // pages and assets: network-first so updates land, cache as fallback
  e.respondWith(fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
});
