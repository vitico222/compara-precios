/* ========================================== */
/* SERVICE WORKER - COMPARA PRECIOS           */
/* ========================================== */

// Sube el número SOLO si cambias la lista de archivos a precargar.
// El código (HTML, JS, CSS) se actualiza solo: se pide primero a la red.
const CACHE_NAME = "compara-precios-v2";
const CACHE_PREFIX = "compara-precios-";
const NETWORK_TIMEOUT_MS = 4000;

// Archivos propios de la app (si alguno falta, solo se muestra un aviso)
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./utils.js",
  "./catalog-data.js",
  "./script.js",
  "./manifest.json",
  "./assets/logo_compara_precios.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

// Librerías externas, con la misma URL exacta que usa index.html
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/fuse.js@6.6.2",
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
];

/* ---------- Utilidades ---------- */
async function addToCache(cache, url, isCrossOrigin) {
  // "reload" evita guardar una copia vieja del caché HTTP del navegador
  const request = new Request(
    url,
    isCrossOrigin ? { mode: "no-cors" } : { cache: "reload" },
  );
  const response = await fetch(request);
  if (response.status === 200 || response.type === "opaque") {
    await cache.put(request, response);
  } else {
    throw new Error(`${url} respondió ${response.status}`);
  }
}

function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms),
  );
}

function isCdnAsset(url) {
  return (
    url.hostname === "cdn.jsdelivr.net" ||
    url.hostname === "cdnjs.cloudflare.com" ||
    (url.hostname === "www.gstatic.com" &&
      url.pathname.startsWith("/firebasejs/"))
  );
}

/* ---------- Estrategias ---------- */
// Red primero (con tiempo límite); si falla o tarda, usa la copia guardada
async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);

  const networkPromise = fetch(request).then((response) => {
    if (response.status === 200) cache.put(request, response.clone());
    return response;
  });

  try {
    return await Promise.race([networkPromise, timeout(NETWORK_TIMEOUT_MS)]);
  } catch {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
    if (cached) {
      networkPromise.catch(() => {}); // evita errores sin capturar en segundo plano
      return cached;
    }
    return networkPromise; // sin copia local: espera a la red
  }
}

// Caché primero: para librerías con versión fija en la URL
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.status === 200 || response.type === "opaque") {
    cache.put(request, response.clone());
  }
  return response;
}

/* ---------- Eventos ---------- */
// 1. Instalación: precarga archivos; un archivo que falle NO cancela la instalación
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const jobs = [
        ...APP_SHELL.map((url) => ({
          url,
          promise: addToCache(cache, url, false),
        })),
        ...CDN_ASSETS.map((url) => ({
          url,
          promise: addToCache(cache, url, true),
        })),
      ];
      const results = await Promise.allSettled(jobs.map((job) => job.promise));
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(
            "SW: no se pudo precargar",
            jobs[index].url,
            result.reason,
          );
        }
      });
    })(),
  );
  self.skipWaiting();
});

// 2. Activación: elimina cachés de versiones anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// 3. Peticiones
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // Nunca interceptar la función de análisis ni otras funciones de Netlify
    if (url.pathname.startsWith("/.netlify/")) return;

    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, "./index.html"));
    } else {
      event.respondWith(networkFirst(request));
    }
    return;
  }

  if (isCdnAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
  // Todo lo demás (Firestore, Firebase Auth, etc.) va directo a la red
});
