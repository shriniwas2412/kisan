// Offline support.
// - Install: cache the app shell AND the hashed JS/CSS bundles (their names are written
//   into __PRECACHE__ at build time by build/precache.ts), so an offline reload works
//   after the very first visit.
// - Pages: network first with a 4 s limit, then the cached copy.
// - Leaf model and the pinned onnxruntime files: cache first (they never change).
// - API calls are never cached here; the app keeps its own dated copies in IndexedDB.
self.__PRECACHE__ = [];
self.__VERSION__ = "dev";
const SHELL = `kisan-shell-${self.__VERSION__}`;
const STATIC = "kisan-static-v1";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(self.__PRECACHE__)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, STATIC].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("slow network")), ms))]);
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.includes("/api/") || url.hostname === "api.open-meteo.com") return;
  const immutable = url.hostname === "cdn.jsdelivr.net" || url.pathname.endsWith(".onnx");
  if (immutable) {
    e.respondWith(caches.open(STATIC).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  const network = fetch(e.request).then(res => {
    if (res.ok) caches.open(SHELL).then(c => c.put(e.request, res.clone()));
    return res;
  });
  e.respondWith(withTimeout(network, 4000).catch(async () =>
    (await caches.match(e.request, { ignoreSearch: true })) ||
    (e.request.mode === "navigate" ? caches.match("index.html") : network)));
});
