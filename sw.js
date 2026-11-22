/* Offline shell + audio. CACHE is generated from the shell content at build time. */
const CACHE = 'duas-84b30b40';
/* Audio lives in its own cache with a byte cap: lessons are ~1.6 MB each, so an uncapped
   cache-first policy would grow without limit on a phone. Oldest clips are evicted first. */
const AUDIO_CACHE = 'duas-audio';
const MAX_AUDIO_BYTES = 48 * 1024 * 1024;
const INDEX_URL = new URL('__audio_index__', self.registration.scope).href;

async function readIndex() {
  const c = await caches.open(AUDIO_CACHE);
  const r = await c.match(INDEX_URL);
  if (!r) return [];
  try { const v = await r.json(); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

async function writeIndex(list) {
  const c = await caches.open(AUDIO_CACHE);
  await c.put(INDEX_URL, new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }));
}

async function noteAudio(url, size) {
  const list = await readIndex();
  const kept = list.filter(x => x.u !== url);
  kept.push({ u: url, s: size, t: Date.now() });
  await writeIndex(kept);
  return kept;
}

async function trim(maxBytes) {
  const cap = typeof maxBytes === 'number' ? maxBytes : MAX_AUDIO_BYTES;
  const c = await caches.open(AUDIO_CACHE);
  let list = await readIndex();
  let total = list.reduce((n, x) => n + (x.s || 0), 0);
  while (total > cap && list.length > 1) {
    const oldest = list.shift();
    await c.delete(oldest.u);
    total -= (oldest.s || 0);
  }
  await writeIndex(list);
  return { bytes: total, count: list.length };
}

self.addEventListener('message', e => {
  const msg = (e.data && e.data.type) || '';
  // answer on the MessageChannel port when the caller supplied one, otherwise broadcast to the
  // originating client — a port-only caller never sees an e.source reply
  const reply = payload => {
    if (e.ports && e.ports[0]) e.ports[0].postMessage(payload);
    else if (e.source) e.source.postMessage(payload);
  };
  if (msg === 'audio-stats') {
    readIndex().then(list => reply({
      type: 'audio-stats',
      count: list.length,
      bytes: list.reduce((n, x) => n + (x.s || 0), 0)
    }));
  } else if (msg === 'clear-audio') {
    caches.open(AUDIO_CACHE).then(c => c.keys().then(keys =>
      Promise.all(keys.map(k => c.delete(k))))).then(() => reply({ type: 'audio-stats', count: 0, bytes: 0 }));
  } else if (msg === 'trim-audio') {
    trim(e.data.maxBytes).then(stats => reply(Object.assign({ type: 'audio-stats' }, stats)));
  }
});
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
 "assets/lessons/ayatul-kursi.js",
 "baqarah-end.html",
 "assets/lessons/baqarah-end.js",
 "protection.html",
 "assets/lessons/protection.js",
 "salawat.html",
 "assets/lessons/salawat.js",
 "huda.html",
 "assets/lessons/huda.js",
 "kahf-ten.html",
 "assets/lessons/kahf-ten.js",
 "yunus.html",
 "assets/lessons/yunus.js",
 "hasanah.html",
 "assets/lessons/hasanah.js",
 "hasbunallah.html",
 "assets/lessons/hasbunallah.js",
 "parents.html",
 "assets/lessons/parents.js",
 "salawat-ayah.html",
 "assets/lessons/salawat-ayah.js",
 "sleep.html",
 "assets/lessons/sleep.js"
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
  // audio: cache-first in its own capped cache, so a learned lesson stays playable offline
  if (url.pathname.endsWith('.mp3')) {
    e.respondWith((async () => {
      const c = await caches.open(AUDIO_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) {
        // bookkeeping must never be able to break playback: any failure here is swallowed and
        // the freshly fetched audio is still returned to the player
        try {
          const buf = await res.clone().arrayBuffer();
          await c.put(req, new Response(buf, {
            headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(buf.byteLength) }
          }));
          await noteAudio(req.url, buf.byteLength);
          trim().catch(() => {});
        } catch (err) { /* ignore cache errors */ }
      }
      return res;
    })());
    return;
  }
  // pages and assets: network-first so updates land, cache as fallback
  e.respondWith(fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
});
