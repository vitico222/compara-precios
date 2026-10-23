/* ========================================== */
/* SERVICE WORKER - COMPARA PRECIOS           */
/* ========================================== */

const CACHE_NAME = "compara-precios-v1";
const assetsToCache = [
  "./index.html",
  "./styles.css",
  "./script.js",
  "./utils.js",
  "./catalog-data.js",
  "./manifest.json",
  "./assets/logo_compara_precios.jpg",
];

// 1. Evento de instalación: Almacena en caché los archivos estáticos principales
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Archivos principales y modulares cacheados exitosamente");
      return cache.addAll(assetsToCache);
    }),
  );
  self.skipWaiting();
});

// 2. Evento de activación: Limpia versiones de caché antiguas si actualizas la app
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Eliminando caché antigua:", cache);
            return caches.delete(cache);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

// 3. Evento fetch: Intercepta las peticiones de red para servir los archivos desde la caché
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Si el archivo está en caché, lo devuelve; si no, lo busca en la red
      return cachedResponse || fetch(event.request);
    }),
  );
});
