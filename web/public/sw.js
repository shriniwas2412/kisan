// Offline support. App shell: network first, cached copy when offline.
// Leaf model and the pinned onnxruntime files: cache first (they never change).
// API calls are never cached here; the app keeps its own dated copies in IndexedDB.
const SHELL = "kisan-shell-v1";
const STATIC = "kisan-static-v1";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(["./", "index.html", "manifest.webmanifest", "icon.svg", "model/labels.json"])));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, STATIC].includes(k)).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/") || url.hostname === "api.open-meteo.com") return;
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
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) caches.open(SHELL).then(c => c.put(e.request, res.clone()));
    return res;
  }).catch(async () => (await caches.match(e.request)) || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error())));
});
