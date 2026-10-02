// Service worker simples: guarda os arquivos estáticos para o app abrir rápido.
// Páginas e dados sempre vêm da internet (pedido exige conexão no MVP).
const CACHE = "startop-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const salvo = await cache.match(e.request);
        if (salvo) return salvo;
        const resp = await fetch(e.request);
        if (resp.ok) cache.put(e.request, resp.clone());
        return resp;
      }),
    );
  }
});
