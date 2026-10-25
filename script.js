/* ========================================== */
/* SCRIPT.JS - COMPARA PRECIOS                */
/* ========================================== */
"use strict";

/* ========================================== */
/* 1. CONFIGURACIÓN Y ESTADO GLOBAL           */
/* ========================================== */

// Esta configuración de Firebase es pública por diseño. Lo que protege tus datos
// son las reglas de Firestore (firestore.rules) y las restricciones de la clave.
const firebaseConfig = {
  apiKey: "AIzaSyB31p33QzBjnxIr_1biHrKNLJUxNNXyxAM",
  authDomain: "compara-precios-b1830.firebaseapp.com",
  projectId: "compara-precios-b1830",
  storageBucket: "compara-precios-b1830.firebasestorage.app",
  messagingSenderId: "516658074463",
  appId: "1:516658074463:web:f1cd38fc50bc9a8ae1dcea",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

const SETTINGS = {
  analyzeEndpoint: "/.netlify/functions/analyze-receipt",
  maxImageSide: 1600, // px: las fotos de móvil se reducen antes de enviarse
  jpegQuality: 0.8,
  fuseThreshold: 0.35,
  listFuseThreshold: 0.45,
  maxItemsPerReceipt: 80,
  maxOffersPerQuery: 300,
  searchDebounceMs: 350,
  compareDays: 30,
};

const STORAGE = {
  country: "cp_country",
  state: "cp_state",
  city: "cp_city",
  currency: "cp_currency",
  locationName: "cp_location_name",
  shoppingList: "cp_shopping_list",
};

const SCOPE_LABELS = {
  city: "en tu ciudad",
  state: "en tu estado",
  country: "en tu país",
};

const VALID_VIEWS = ["home", "scan", "compare", "list", "search"];

/* ========================================== */
/* 2. UTILIDADES                              */
/* ========================================== */
const $ = (id) => document.getElementById(id);

function storageGet(key, fallback = "") {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible: la app sigue funcionando */
  }
}

function loadShoppingList() {
  try {
    const parsed = JSON.parse(storageGet(STORAGE.shoppingList, "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string").slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

// Estado global de la aplicación
const AppState = {
  country: storageGet(STORAGE.country),
  state: storageGet(STORAGE.state),
  city: storageGet(STORAGE.city),
  currency: storageGet(STORAGE.currency),
  locationName: storageGet(STORAGE.locationName),
  currentReceiptData: null,
  shoppingList: loadShoppingList(),
};

function escapeHtml(value) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}

// Convierte "1.234,56", "1,234.56", "12,5" o 12.5 en un número (o null)
function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let s = value.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s =
      lastComma > lastDot
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.match(/,/g).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1 && s.match(/\./g).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n) => Math.round(n * 100) / 100;
const formatMoney = (n) => `${Number(n).toFixed(2)} ${AppState.currency}`;
const formatQuantity = (q) => String(Number(Number(q).toFixed(3)));

function normalizePlace(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
}

let toastTimer = null;
function showToast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

function setScanStatus(message, isError = false) {
  const el = $("scan-status");
  if (!el) return;
  if (!message) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.classList.remove("hidden");
}

/* ========================================== */
/* 3. AUTENTICACIÓN ANÓNIMA                   */
/* ========================================== */
// Las reglas de Firestore exigen un usuario autenticado. Entramos de forma
// anónima: no se pide correo ni se guardan datos personales.
let authReadyPromise = null;

function ensureAuth() {
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
          return;
        }
        try {
          const credential = await auth.signInAnonymously();
          unsubscribe();
          resolve(credential.user);
        } catch (error) {
          console.warn(
            "No se pudo iniciar sesión anónima (¿está activada en Firebase Authentication?):",
            error,
          );
          unsubscribe();
          resolve(null);
        }
      });
    });
  }
  return authReadyPromise;
}

/* ========================================== */
/* 4. CATÁLOGO Y COINCIDENCIA APROXIMADA      */
/* ========================================== */
// El catálogo se lee del archivo local catalog-data.js: es rápido, gratis y no
// necesita escribir en Firestore. Los precios se agrupan por nombre estándar.
let standardProductCatalog = [];
let catalogFuse = null;

const fuseOptions = {
  keys: [
    { name: "name", weight: 0.7 },
    { name: "keywords", weight: 0.3 },
  ],
  threshold: SETTINGS.fuseThreshold,
  includeScore: true,
  ignoreLocation: true,
};

function loadStandardCatalog() {
  standardProductCatalog =
    typeof initialCatalogData !== "undefined" ? initialCatalogData : [];
  catalogFuse =
    typeof Fuse !== "undefined"
      ? new Fuse(standardProductCatalog, fuseOptions)
      : null;
}

function normalizeName(rawName) {
  return typeof normalizeProductName === "function"
    ? normalizeProductName(rawName)
    : normalizePlace(rawName);
}

function matchProductWithCatalog(
  rawProductName,
  threshold = SETTINGS.fuseThreshold,
) {
  const cleanName = normalizeName(rawProductName);
  if (!cleanName) {
    return { matched: false, cleanedName: "", originalName: rawProductName };
  }
  const results = catalogFuse
    ? catalogFuse.search(cleanName, { limit: 1 })
    : [];
  if (results.length > 0 && results[0].score <= threshold) {
    return {
      matched: true,
      product: results[0].item,
      score: results[0].score,
      originalName: rawProductName,
    };
  }
  return {
    matched: false,
    cleanedName: cleanName,
    originalName: rawProductName,
  };
}

/* ========================================== */
/* 5. CONTROL DE VISTAS (SPA)                 */
/* ========================================== */
function switchView(viewId, { push = true } = {}) {
  if (!VALID_VIEWS.includes(viewId)) viewId = "home";
  if (viewId === "compare" && !AppState.currentReceiptData) viewId = "home";

  document
    .querySelectorAll(".app-view")
    .forEach((view) => view.classList.remove("active-view"));
  const target = $(`view-${viewId}`);
  if (target) target.classList.add("active-view");

  // La vista "compare" se considera parte de "scan" en el menú inferior
  const navId = viewId === "compare" ? "scan" : viewId;
  document.querySelectorAll(".nav-item").forEach((item) => {
    const active = item.dataset.view === navId;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  if (push && location.hash !== `#${viewId}`) {
    try {
      history.pushState({ view: viewId }, "", `#${viewId}`);
    } catch {
      /* algunos entornos no permiten pushState */
    }
  }
  window.scrollTo({ top: 0 });
}

function showInitialView() {
  const hash = location.hash.replace("#", "");
  switchView(["scan", "list", "search"].includes(hash) ? hash : "home", {
    push: false,
  });
}

/* ========================================== */
/* 6. REGIÓN, PAÍS Y MONEDA                   */
/* ========================================== */
function hasRegionConfig() {
  return Boolean(
    AppState.country && AppState.state && AppState.city && AppState.currency,
  );
}

function updateLocationBadge() {
  const label = $("display-location");
  if (!label) return;
  label.textContent = hasRegionConfig()
    ? AppState.locationName || `${AppState.city}, ${AppState.country}`
    : "Selecciona tu región";
}

function openRegionalModal() {
  $("select-country").value = AppState.country || "";
  $("input-state").value = AppState.state || "";
  $("input-city").value = AppState.city || "";
  $("select-currency").value = AppState.currency || "";
  $("btn-cancel-region").classList.toggle("hidden", !hasRegionConfig());
  $("regional-modal").classList.remove("hidden");
  $("select-country").focus();
}

function closeRegionalModal() {
  $("regional-modal").classList.add("hidden");
}

function checkRegionalConfig() {
  if (hasRegionConfig() && !AppState.locationName) {
    AppState.locationName = `${AppState.city}, ${AppState.country}`;
  }
  updateLocationBadge();
  if (!hasRegionConfig()) openRegionalModal();
}

function handleRegionalSubmit(event) {
  event.preventDefault();
  const country = $("select-country").value;
  const state = $("input-state").value.trim().slice(0, 60);
  const city = $("input-city").value.trim().slice(0, 60);
  const currency = $("select-currency").value;
  if (!country || !state || !city || !currency) return;

  AppState.country = country;
  AppState.state = state;
  AppState.city = city;
  AppState.currency = currency;
  AppState.locationName = `${city}, ${country}`;

  storageSet(STORAGE.country, country);
  storageSet(STORAGE.state, state);
  storageSet(STORAGE.city, city);
  storageSet(STORAGE.currency, currency);
  storageSet(STORAGE.locationName, AppState.locationName);

  clearOffersCache();
  updateLocationBadge();
  closeRegionalModal();
  showToast("Región guardada");
}

function handleCountryChange() {
  const option = $("select-country").selectedOptions[0];
  if (option && option.dataset.currency) {
    $("select-currency").value = option.dataset.currency;
  }
}

/* ========================================== */
/* 7. IMAGEN DEL RECIBO                       */
/* ========================================== */
let selectedImageDataUrl = null;

// Reduce la foto y la convierte a JPEG: menos peso, análisis más rápido y
// dentro del límite de tamaño de las funciones de Netlify.
function resizeImageToJpeg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = Math.min(1, SETTINGS.maxImageSide / longest);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", SETTINGS.jpegQuality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Imagen no válida"));
    };
    img.src = url;
  });
}

function showImagePreview(dataUrl) {
  $("receipt-preview").src = dataUrl;
  document.querySelector(".upload-trigger").classList.add("hidden");
  $("image-preview-container").classList.remove("hidden");
  $("btn-process-receipt").disabled = false;
}

function clearImagePreview() {
  selectedImageDataUrl = null;
  $("receipt-file-input").value = "";
  $("receipt-preview").removeAttribute("src");
  $("image-preview-container").classList.add("hidden");
  document.querySelector(".upload-trigger").classList.remove("hidden");
  $("btn-process-receipt").disabled = true;
}

async function handleImageUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setScanStatus("El archivo seleccionado no es una imagen.", true);
    return;
  }
  setScanStatus("Preparando la imagen...");
  try {
    selectedImageDataUrl = await resizeImageToJpeg(file);
    showImagePreview(selectedImageDataUrl);
    setScanStatus("");
  } catch {
    clearImagePreview();
    setScanStatus(
      "No se pudo leer la imagen. Prueba con otra foto en formato JPG o PNG.",
      true,
    );
  }
}

/* ========================================== */
/* 8. ANÁLISIS DEL RECIBO CON IA (VÍA NETLIFY) */
/* ========================================== */
// El navegador NO llama a Gemini: llama a tu función de Netlify, que guarda la
// clave en una variable de entorno (GEMINI_API_KEY).
function extractJsonObject(text) {
  const clean = String(text || "")
    .replace(/```json|```/gi, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(
      "La IA no devolvió un recibo legible. Prueba con una foto más nítida.",
    );
  }
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw new Error(
      "La respuesta de la IA no tenía el formato esperado. Inténtalo de nuevo.",
    );
  }
}

async function requestReceiptAnalysis(dataUrl) {
  const [header, base64Data] = dataUrl.split(",");
  const mimeType = (
    header.split(";")[0].split(":")[1] || "image/jpeg"
  ).toLowerCase();

  let response;
  try {
    response = await fetch(SETTINGS.analyzeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: base64Data,
        mimeType,
        currency: AppState.currency,
        country: AppState.country,
      }),
    });
  } catch {
    throw new Error(
      "No se pudo conectar con el servicio de análisis. Revisa tu conexión.",
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* respuesta sin JSON */
  }

  if (!response.ok) {
    if (response.status === 504 && !payload?.error) {
      throw new Error(
        "El análisis tardó demasiado. Inténtalo de nuevo en unos segundos.",
      );
    }
    if (response.status === 404 && !payload) {
      throw new Error(
        "El servicio de análisis no está disponible. Si pruebas en local, ejecuta «netlify dev».",
      );
    }
    throw new Error(
      payload?.error || `El análisis falló (código ${response.status}).`,
    );
  }
  return extractJsonObject(payload?.text);
}

// Valida y normaliza lo que devuelve la IA antes de usarlo o guardarlo
function normalizeReceiptData(raw) {
  const list = Array.isArray(raw?.items) ? raw.items : [];
  const items = list
    .map((item) => {
      const name = String(item?.name ?? "")
        .trim()
        .slice(0, 120);
      const rawQty = toNumber(item?.quantity);
      const quantity = rawQty && rawQty > 0 ? rawQty : 1;
      const lineTotal = toNumber(item?.line_total ?? item?.lineTotal);
      let unitPrice = toNumber(
        item?.unit_price ?? item?.unitPrice ?? item?.price,
      );
      if (unitPrice === null && lineTotal !== null)
        unitPrice = lineTotal / quantity;
      return { name, quantity, unitPrice };
    })
    .filter(
      (item) => item.name && item.unitPrice !== null && item.unitPrice > 0,
    )
    .slice(0, SETTINGS.maxItemsPerReceipt);

  if (items.length === 0) {
    throw new Error(
      "No encontramos productos en el recibo. Prueba con una foto más nítida y completa.",
    );
  }

  const itemsSum = round2(
    items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
  );
  const rawDate = String(raw?.date ?? "");
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(rawDate) &&
    !Number.isNaN(Date.parse(rawDate)) &&
    rawDate <= todayIso();

  return {
    establishment:
      String(raw?.establishment ?? "")
        .trim()
        .slice(0, 80) || "Establecimiento general",
    date: validDate ? rawDate : todayIso(),
    items,
    itemsSum,
    total: toNumber(raw?.total) ?? itemsSum,
  };
}

// Empareja cada línea con el catálogo. El precio se agrupa por "standardName".
function processReceiptItems(items) {
  return items.map((item) => {
    const match = matchProductWithCatalog(item.name);
    const standardName = match.matched
      ? match.product.name
      : match.cleanedName || normalizePlace(item.name) || "producto";
    return {
      originalName: item.name,
      standardName,
      productId: match.matched ? match.product.id : null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    };
  });
}

async function processReceiptWithGemini() {
  if (!selectedImageDataUrl) return;
  if (!hasRegionConfig()) {
    openRegionalModal();
    return;
  }
  if (!navigator.onLine) {
    setScanStatus(
      "No tienes conexión a internet. Inténtalo cuando vuelvas a tener red.",
      true,
    );
    return;
  }

  const btn = $("btn-process-receipt");
  const originalLabel = btn.innerHTML;
  btn.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Analizando ticket con IA...';
  btn.disabled = true;
  setScanStatus("Analizando el ticket, esto puede tardar unos segundos...");

  try {
    const raw = await requestReceiptAnalysis(selectedImageDataUrl);
    const receipt = normalizeReceiptData(raw);
    receipt.processedItems = processReceiptItems(receipt.items);
    AppState.currentReceiptData = receipt;

    // 1) Comparar con la comunidad ANTES de guardar, para no compararte contigo mismo
    await renderParallelTickets(receipt);
    switchView("compare");
    setScanStatus("");

    // 2) Compartir tu recibo con la comunidad
    const saved = await saveReceiptToCommunity(receipt);
    if (!saved) showToast("No se pudo compartir tu recibo con la comunidad.");
  } catch (error) {
    console.error("Error al procesar el recibo:", error);
    setScanStatus(error.message || "No se pudo procesar el recibo.", true);
  } finally {
    btn.innerHTML = originalLabel;
    btn.disabled = !selectedImageDataUrl;
  }
}

/* ========================================== */
/* 9. FIRESTORE: GUARDAR Y CONSULTAR PRECIOS  */
/* ========================================== */
async function saveReceiptToCommunity(receipt) {
  try {
    const user = await ensureAuth();
    if (!user) return false;

    const items = receipt.processedItems.map((item) => ({
      standardName: item.standardName,
      originalName: item.originalName,
      price: round2(item.unitPrice), // precio por unidad (o por kg)
      quantity: item.quantity,
      productId: item.productId,
    }));

    await db.collection("community_receipts").add({
      country: AppState.country,
      state: AppState.state,
      city: AppState.city,
      stateKey: normalizePlace(AppState.state),
      cityKey: normalizePlace(AppState.city),
      currency: AppState.currency,
      establishment: receipt.establishment,
      date: receipt.date,
      items,
      itemKeys: [...new Set(items.map((i) => i.standardName))],
      total: round2(receipt.total),
      userId: user.uid, // identificador anónimo; ya no se guarda el correo
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    clearOffersCache();
    return true;
  } catch (error) {
    console.error("Error al guardar el recibo comunitario:", error);
    return false;
  }
}

// Caché en memoria: evita repetir lecturas (y costos) durante la sesión
const offersCache = new Map();

function clearOffersCache() {
  offersCache.clear();
}

async function fetchOffersForProduct(standardName) {
  const cacheKey = `${AppState.country}|${AppState.currency}|${standardName}`;
  if (offersCache.has(cacheKey)) return offersCache.get(cacheKey);

  const request = (async () => {
    try {
      await ensureAuth();
      const snapshot = await db
        .collection("community_receipts")
        .where("itemKeys", "array-contains", standardName)
        .limit(SETTINGS.maxOffersPerQuery)
        .get();

      const offers = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (
          data.country !== AppState.country ||
          data.currency !== AppState.currency
        )
          return;
        if (!Array.isArray(data.items)) return;
        data.items.forEach((item) => {
          if (item.standardName !== standardName) return;
          const price = toNumber(item.price);
          if (price === null || price <= 0) return;
          offers.push({
            price,
            establishment: data.establishment || "Comercio local",
            date: data.date || "",
            cityKey: data.cityKey || "",
            stateKey: data.stateKey || "",
          });
        });
      });
      return offers;
    } catch (error) {
      console.error("Error al consultar precios en Firestore:", error);
      offersCache.delete(cacheKey);
      showToast("No se pudieron consultar los precios de la comunidad.");
      return [];
    }
  })();

  offersCache.set(cacheKey, request);
  return request;
}

function filterOffers(
  offers,
  { scope = "city", days = SETTINGS.compareDays } = {},
) {
  const cutoff = daysAgoIso(days);
  const city = normalizePlace(AppState.city);
  const state = normalizePlace(AppState.state);
  return offers.filter((offer) => {
    if (offer.date && offer.date < cutoff) return false;
    if (scope === "city") return offer.cityKey === city;
    if (scope === "state") return offer.stateKey === state;
    return true;
  });
}

function pickBestOffer(offers) {
  return [...offers].sort(
    (a, b) => a.price - b.price || String(b.date).localeCompare(String(a.date)),
  )[0];
}

// Busca primero en tu ciudad; si no hay datos, amplía a tu estado y a tu país
async function getBestOfferWithFallback(
  standardName,
  days = SETTINGS.compareDays,
) {
  const offers = await fetchOffersForProduct(standardName);
  for (const scope of ["city", "state", "country"]) {
    const filtered = filterOffers(offers, { scope, days });
    if (filtered.length > 0) {
      return { offer: pickBestOffer(filtered), scope, count: filtered.length };
    }
  }
  return null;
}

/* ========================================== */
/* 10. TICKETS PARALELOS Y LÓGICA DE AHORRO   */
/* ========================================== */
async function renderParallelTickets(receipt) {
  const leftContainer = $("left-ticket-content");
  const rightContainer = $("right-ticket-content");
  if (!leftContainer || !rightContainer) return;

  // Ticket original
  let leftHtml = `<p><strong>Local:</strong> ${escapeHtml(receipt.establishment)}</p>`;
  leftHtml += `<p><strong>Fecha:</strong> ${escapeHtml(receipt.date)}</p><hr class="ticket-divider">`;
  receipt.processedItems.forEach((item) => {
    const label =
      item.quantity !== 1
        ? `${formatQuantity(item.quantity)} x ${item.originalName}`
        : item.originalName;
    leftHtml += `<div class="ticket-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatMoney(item.unitPrice * item.quantity))}</span></div>`;
  });
  leftHtml += `<hr class="ticket-divider"><p class="ticket-total">TOTAL: ${escapeHtml(formatMoney(receipt.total))}</p>`;
  leftContainer.innerHTML = leftHtml;

  // Comparación con la comunidad (todas las consultas en paralelo)
  rightContainer.innerHTML =
    '<p class="ticket-hint empty">Buscando los mejores precios...</p>';
  const results = await Promise.all(
    receipt.processedItems.map((item) =>
      getBestOfferWithFallback(item.standardName),
    ),
  );

  let rightHtml =
    '<p><strong>Precios registrados por la comunidad</strong></p><hr class="ticket-divider">';
  let optimizedTotal = 0;
  let itemsWithData = 0;

  receipt.processedItems.forEach((item, index) => {
    const result = results[index];
    let unitFinal = item.unitPrice;
    let hint =
      '<span class="ticket-hint empty">📍 Aún no hay datos para este producto</span>';

    if (result) {
      itemsWithData += 1;
      if (result.offer.price < item.unitPrice - 0.005) {
        unitFinal = result.offer.price;
        hint = `<span class="ticket-hint">📍 Más barato en: <strong>${escapeHtml(result.offer.establishment)}</strong> (~${escapeHtml(formatMoney(result.offer.price))} c/u, ${SCOPE_LABELS[result.scope]})</span>`;
      } else {
        hint =
          '<span class="ticket-hint">✓ Ya pagaste el mejor precio que conocemos</span>';
      }
    }

    optimizedTotal += unitFinal * item.quantity;
    rightHtml += `<div class="ticket-item"><strong>${escapeHtml(item.originalName)}</strong><br>${hint}</div>`;
  });

  const originalSum = receipt.itemsSum;
  const savings = Math.max(0, originalSum - optimizedTotal);
  rightHtml += `<hr class="ticket-divider"><p class="ticket-total optimized">TOTAL OPTIMIZADO: ${escapeHtml(formatMoney(optimizedTotal))}</p>`;
  rightContainer.innerHTML = rightHtml;

  if (itemsWithData === 0) {
    showAlertModal(
      "¡Gracias por contribuir!",
      "Todavía no hay precios de la comunidad para comparar. Tu recibo ayudará a otros a ahorrar.",
      "info",
    );
  } else if (savings <= originalSum * 0.01) {
    showAlertModal(
      "¡Excelente!",
      "Estás comprando con los mejores precios que conocemos.",
      "success",
    );
  } else {
    const percent = Math.round((savings / originalSum) * 100);
    showAlertModal(
      "¡Encontramos una oportunidad!",
      `Con estos precios podrías haber ahorrado ${formatMoney(savings)} (${percent}%) en esta compra.`,
      "info",
    );
  }
}

function showAlertModal(title, message, type) {
  const modal = $("alert-modal");
  if (!modal) return;
  $("alert-title").textContent = title;
  $("alert-message").textContent = message;
  $("alert-icon-container").innerHTML =
    type === "success"
      ? '<i class="fa-solid fa-circle-check success-icon" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-circle-info success-icon" style="color: var(--accent-teal);" aria-hidden="true"></i>';
  modal.classList.remove("hidden");
  $("btn-close-alert").focus();
}

function closeAlertModal() {
  const modal = $("alert-modal");
  if (modal) modal.classList.add("hidden");
}

/* ========================================== */
/* 11. LISTA DE COMPRAS INTELIGENTE           */
/* ========================================== */
function saveShoppingList() {
  storageSet(STORAGE.shoppingList, JSON.stringify(AppState.shoppingList));
}

function addShoppingItem() {
  const input = $("shopping-item-input");
  if (!input) return;
  const itemName = input.value.trim().slice(0, 80);
  if (!itemName) return;
  AppState.shoppingList.push(itemName);
  input.value = "";
  saveShoppingList();
  renderShoppingList();
  input.focus();
}

function removeShoppingItem(index) {
  AppState.shoppingList.splice(index, 1);
  saveShoppingList();
  renderShoppingList();
}

function renderShoppingList() {
  const ul = $("shopping-list-items");
  if (!ul) return;
  ul.replaceChildren();

  AppState.shoppingList.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "shopping-item";

    const name = document.createElement("span");
    name.className = "shopping-item-name";
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-basket-shopping";
    icon.setAttribute("aria-hidden", "true");
    name.append(icon, document.createTextNode(item)); // texto plano: sin riesgo de HTML

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-icon-danger";
    removeBtn.dataset.removeIndex = String(index);
    removeBtn.setAttribute("aria-label", `Quitar ${item}`);
    removeBtn.innerHTML =
      '<i class="fa-solid fa-trash" aria-hidden="true"></i>';

    li.append(name, removeBtn);
    ul.appendChild(li);
  });

  $("btn-optimize-list").classList.toggle(
    "hidden",
    AppState.shoppingList.length === 0,
  );
}

function cleanShoppingQuery(query) {
  return query
    .replace(/\b(de|del|la|el|los|las|un|una|unos|unas)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resultCardHtml(title, subtitle, statusHtml) {
  return `
    <div class="product-result-card">
      <div class="result-head">
        <h4 class="result-title">${escapeHtml(title)}</h4>
        ${subtitle ? `<small class="result-query">${escapeHtml(subtitle)}</small>` : ""}
      </div>
      <div class="price-status">${statusHtml}</div>
    </div>`;
}

function bestOfferStatusHtml(best) {
  if (!best)
    return '<span class="price-empty">📍 Aún no hay sugerencias para este producto</span>';
  return `📍 Cómpralo más barato en: <strong>${escapeHtml(best.offer.establishment)}</strong> (~${escapeHtml(formatMoney(best.offer.price))}) <small class="result-query">${SCOPE_LABELS[best.scope]} · ${best.count} registro(s)</small>`;
}

async function optimizeShoppingList() {
  if (AppState.shoppingList.length === 0) return;
  if (!hasRegionConfig()) {
    openRegionalModal();
    return;
  }

  const btn = $("btn-optimize-list");
  const container = $("optimization-result-container");
  btn.disabled = true;
  container.innerHTML =
    '<p class="section-subtitle">Buscando los mejores precios...</p>';

  try {
    const rows = await Promise.all(
      AppState.shoppingList.map(async (query) => {
        const match = matchProductWithCatalog(
          cleanShoppingQuery(query),
          SETTINGS.listFuseThreshold,
        );
        const key = match.matched
          ? match.product.name
          : match.cleanedName || normalizePlace(query);
        const best = await getBestOfferWithFallback(key);
        return {
          query,
          title: match.matched ? match.product.name : query,
          best,
        };
      }),
    );

    const estimatedTotal = rows.reduce(
      (sum, row) => sum + (row.best ? row.best.offer.price : 0),
      0,
    );
    const withPrice = rows.filter((row) => row.best).length;

    let html = `
      <div class="optimization-header">
        <h3>Resultado de optimización</h3>
        <button type="button" class="btn-link" data-view="home">
          <i class="fa-solid fa-house" aria-hidden="true"></i> Inicio
        </button>
      </div>`;
    rows.forEach((row) => {
      html += resultCardHtml(
        row.title,
        `Buscado: "${row.query}"`,
        bestOfferStatusHtml(row.best),
      );
    });
    if (withPrice > 0) {
      html += `<p class="ticket-total optimized">Total estimado (${withPrice} de ${rows.length} productos): ${escapeHtml(formatMoney(estimatedTotal))}</p>`;
    }
    container.innerHTML = html;
    container.scrollIntoView({ behavior: "smooth" });
  } finally {
    btn.disabled = false;
  }
}

/* ========================================== */
/* 12. CONSULTAR PRECIOS                      */
/* ========================================== */
let searchToken = 0;
let searchTimer = null;

async function runProductSearch() {
  const container = $("search-results-container");
  const query = $("product-search-input").value.trim();
  const token = ++searchToken;

  if (query.length < 2) {
    container.innerHTML =
      '<p class="section-subtitle">Escribe el nombre de un producto para ver sus precios.</p>';
    return;
  }
  if (!hasRegionConfig()) {
    openRegionalModal();
    return;
  }

  container.innerHTML = '<p class="section-subtitle">Buscando...</p>';
  const scope = $("filter-area").value;
  const days = Number($("filter-time").value) || SETTINGS.compareDays;
  const cleaned = normalizeName(query);

  let names = catalogFuse
    ? catalogFuse
        .search(cleaned, { limit: 5 })
        .filter((r) => r.score <= SETTINGS.listFuseThreshold)
        .map((r) => r.item.name)
    : [];
  if (names.length === 0 && cleaned) names = [cleaned];

  const rows = await Promise.all(
    names.map(async (name) => {
      const offers = filterOffers(await fetchOffersForProduct(name), {
        scope,
        days,
      });
      return { name, offers };
    }),
  );
  if (token !== searchToken) return; // llegó una búsqueda más reciente

  let html = "";
  rows.forEach(({ name, offers }) => {
    if (offers.length === 0) {
      html += resultCardHtml(
        name,
        "",
        '<span class="price-empty">📍 Sin registros con estos filtros</span>',
      );
      return;
    }
    const best = pickBestOffer(offers);
    html += resultCardHtml(
      name,
      `${offers.length} registro(s) · ${SCOPE_LABELS[scope]}`,
      `📍 Mejor precio: <strong>${escapeHtml(formatMoney(best.price))}</strong> en ${escapeHtml(best.establishment)}`,
    );
  });
  container.innerHTML =
    html ||
    '<p class="section-subtitle">No encontramos productos con ese nombre.</p>';
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runProductSearch, SETTINGS.searchDebounceMs);
}

/* ========================================== */
/* 13. EVENTOS E INICIALIZACIÓN               */
/* ========================================== */
function initEventListeners() {
  // Navegación: cualquier elemento con data-view
  document.addEventListener("click", (event) => {
    const viewTarget = event.target.closest("[data-view]");
    if (viewTarget) switchView(viewTarget.dataset.view);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAlertModal();
      if (hasRegionConfig()) closeRegionalModal();
      return;
    }
    // Teclado: Enter o espacio activan los elementos con role="button"
    if (
      (event.key === "Enter" || event.key === " ") &&
      event.target.matches('[role="button"]')
    ) {
      event.preventDefault();
      event.target.click();
    }
  });

  window.addEventListener("popstate", () => {
    const hash = location.hash.replace("#", "") || "home";
    switchView(hash, { push: false });
  });

  // Región
  $("regional-form").addEventListener("submit", handleRegionalSubmit);
  $("select-country").addEventListener("change", handleCountryChange);
  $("btn-change-region").addEventListener("click", openRegionalModal);
  $("btn-cancel-region").addEventListener("click", closeRegionalModal);

  // Recibo
  $("receipt-file-input").addEventListener("change", handleImageUpload);
  $("btn-remove-image").addEventListener("click", () => {
    clearImagePreview();
    setScanStatus("");
    $("receipt-file-input").click();
  });
  $("btn-process-receipt").addEventListener("click", processReceiptWithGemini);
  $("btn-close-alert").addEventListener("click", closeAlertModal);

  // Lista de compras
  $("btn-add-shopping-item").addEventListener("click", addShoppingItem);
  $("shopping-item-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addShoppingItem();
  });
  $("shopping-list-items").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-index]");
    if (btn) removeShoppingItem(Number(btn.dataset.removeIndex));
  });
  $("btn-optimize-list").addEventListener("click", optimizeShoppingList);

  // Búsqueda
  $("product-search-input").addEventListener("input", scheduleSearch);
  $("filter-area").addEventListener("change", runProductSearch);
  $("filter-time").addEventListener("change", runProductSearch);
}

function initApp() {
  loadStandardCatalog();
  initEventListeners();
  checkRegionalConfig();
  renderShoppingList();
  showInitialView();
  ensureAuth(); // inicia sesión anónima en segundo plano
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

/* ========================================== */
/* 14. SERVICE WORKER (PWA)                   */
/* ========================================== */
if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  // Si se instala una versión nueva, recarga una vez para usar los archivos nuevos
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("Service Worker registrado:", reg.scope))
      .catch((err) =>
        console.log("Error al registrar el Service Worker:", err),
      );
  });
}
