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
  // URL de tu Worker de Cloudflare (ver cloudflare/analyze-receipt-worker.js).
  // No es secreta: la clave de Gemini vive solo dentro del Worker.
  // Debe terminar en «-ai» (compara-precios-ai); «-ia» era el Worker antiguo, ya borrado.
  analyzeEndpoint: "https://compara-precios-ai.vitico222.workers.dev",
  analyzeTimeoutMs: 110000, // un ticket largo puede tardar ~40 s por intento
  maxImageSide: 1600, // px: las fotos de móvil se reducen antes de enviarse
  jpegQuality: 0.8,
  fuseThreshold: 0.35,
  listFuseThreshold: 0.45,
  maxItemsPerReceipt: 80,
  maxOffersPerQuery: 300,
  searchDebounceMs: 350,
  compareDays: 30, // comparación de un recibo recién escaneado
  listDays: 90, // lista inteligente: hay pocos datos, se aceptan registros más antiguos
  communityKeyScan: 300, // recibos recientes que se leen: dan los nombres de productos y los precios destacados
  communityFuseThreshold: 0.25, // más bajo = exige nombres más parecidos
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

const VALID_VIEWS = ["home", "scan", "compare", "list", "search", "top"];

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

  // Si ya se vieron los resultados de la lista y se sale de esa vista, la próxima lista empieza vacía
  const currentView = document.querySelector(".app-view.active-view");
  if (
    listOptimized &&
    currentView &&
    currentView.id === "view-list" &&
    viewId !== "list"
  ) {
    resetShoppingList();
  }

  // Al entrar a "Escanear" desde otra pantalla se empieza de cero, sin el recibo anterior
  if (viewId === "scan" && (!currentView || currentView.id !== "view-scan")) {
    clearImagePreview();
    setScanStatus("");
  }

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
  if (viewId === "top") renderTopView();
}

function showInitialView() {
  const hash = location.hash.replace("#", "");
  switchView(["scan", "list", "search", "top"].includes(hash) ? hash : "home", {
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
  $("receipt-camera-input").value = "";
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
  } finally {
    event.target.value = ""; // así se puede volver a elegir el mismo archivo
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

  const params = new URLSearchParams({
    mime: mimeType,
    currency: AppState.currency,
    country: AppState.country,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SETTINGS.analyzeTimeoutMs);

  let response;
  try {
    // text/plain evita la petición previa (preflight) de CORS
    response = await fetch(`${SETTINGS.analyzeEndpoint}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: base64Data,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      error.name === "AbortError"
        ? "El análisis tardó demasiado. Inténtalo de nuevo."
        : "No se pudo conectar con el servicio de análisis. Revisa tu conexión.",
    );
  } finally {
    clearTimeout(timer);
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
        "El servicio de análisis no está disponible. Revisa la URL del Worker.",
      );
    }
    throw new Error(
      payload?.error || `El análisis falló (código ${response.status}).`,
    );
  }
  return extractJsonObject(payload?.text);
}

// La IA a veces lee mal el año del ticket (ej. 2024 en vez de 2026). Como los recibos
// se escanean poco después de la compra, si la fecha es muy antigua se prueba con el
// año actual (o el anterior) antes de darla por buena.
function resolveReceiptDate(rawDate) {
  const today = todayIso();
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate));
  if (!valid || rawDate > today) return today;

  const oldestRecent = daysAgoIso(62);
  if (rawDate >= oldestRecent) return rawDate;

  const year = Number(today.slice(0, 4));
  for (const candidateYear of [year, year - 1]) {
    const candidate = `${candidateYear}${rawDate.slice(4)}`;
    if (candidate <= today && candidate >= oldestRecent) return candidate;
  }
  return rawDate; // recibo realmente antiguo: se conserva su fecha
}

// Líneas del ticket que no son productos comparables (bolsas de caja, redondeo, donaciones...)
function isNonProductLine(name) {
  const clean = normalizeName(name);
  return (
    /^bolsas?( de (cliente|caja|supermercado|papel)| para embalar| plastica| reutilizable| ecologica)?$/.test(
      clean,
    ) || /^(redondeo|donacion|propina|servicio)\b/.test(clean)
  );
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
      // El importe de la derecha del ticket es el dato que la IA lee con más fiabilidad.
      // Si el precio unitario no cuadra con él (por ejemplo, devolvió el total de la línea
      // como si fuera el de una sola unidad), se calcula: importe de la línea ÷ cantidad.
      if (lineTotal !== null && lineTotal > 0) {
        const fromTotal = lineTotal / quantity;
        const agrees =
          unitPrice !== null &&
          Math.abs(unitPrice - fromTotal) / fromTotal <= 0.02;
        if (!agrees) unitPrice = fromTotal;
      }
      return { name, quantity, unitPrice };
    })
    .filter(
      (item) => item.name && item.unitPrice !== null && item.unitPrice > 0,
    )
    .filter((item) => !isNonProductLine(item.name))
    .slice(0, SETTINGS.maxItemsPerReceipt);

  if (items.length === 0) {
    throw new Error(
      "No encontramos productos en el recibo. Prueba con una foto más nítida y completa.",
    );
  }

  const itemsSum = round2(
    items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
  );
  // El SUBTOTAL impreso permite detectar productos o precios mal leídos
  const subtotal = toNumber(raw?.subtotal);
  const subtotalMismatch =
    subtotal !== null &&
    subtotal > 0 &&
    Math.abs(itemsSum - subtotal) / subtotal > 0.02;
  const receiptDate = resolveReceiptDate(String(raw?.date ?? ""));

  return {
    establishment:
      String(raw?.establishment ?? "")
        .trim()
        .slice(0, 80) || "Establecimiento general",
    address: String(raw?.address ?? "")
      .trim()
      .slice(0, 160),
    date: receiptDate,
    items,
    itemsSum,
    subtotal,
    subtotalMismatch,
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

// Animación translúcida sobre la foto mientras la IA lee el ticket
let scanHintTimers = [];
let screenWakeLock = null;

// Evita que la pantalla se apague mientras se analiza (si se apaga, la conexión puede cortarse)
async function keepScreenOn(on) {
  try {
    if (on && "wakeLock" in navigator) {
      screenWakeLock = await navigator.wakeLock.request("screen");
    } else if (!on && screenWakeLock) {
      await screenWakeLock.release();
      screenWakeLock = null;
    }
  } catch {
    screenWakeLock = null; // no es imprescindible: el análisis sigue igual
  }
}

function setAnalyzing(on) {
  const overlay = $("scan-overlay");
  if (overlay) overlay.classList.toggle("hidden", !on);
  const changePhoto = $("btn-remove-image");
  if (changePhoto) changePhoto.disabled = on;

  scanHintTimers.forEach(clearTimeout);
  scanHintTimers = [];
  const label = $("scan-label-text");
  if (label) label.textContent = "Analizando recibo";
  keepScreenOn(on);

  if (on) {
    setScanStatus(
      "Mantén la pantalla encendida mientras analizamos tu ticket.",
    );
    if (label) {
      scanHintTimers.push(
        setTimeout(
          () =>
            (label.textContent =
              "Los tickets largos pueden tardar hasta 40 segundos"),
          10000,
        ),
      );
      scanHintTimers.push(
        setTimeout(
          () => (label.textContent = "Casi listo, un momento más"),
          40000,
        ),
      );
    }
  }
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
  setAnalyzing(true);

  try {
    const raw = await requestReceiptAnalysis(selectedImageDataUrl);
    const receipt = normalizeReceiptData(raw);
    receipt.processedItems = processReceiptItems(receipt.items);
    AppState.currentReceiptData = receipt;

    // 1) Comparar con la comunidad ANTES de guardar, para no compararte contigo mismo
    await renderParallelTickets(receipt);
    switchView("compare");
    setScanStatus("");
    clearImagePreview(); // la foto ya se analizó: se libera para el próximo recibo

    // 2) Compartir tu recibo con la comunidad
    const saved = await saveReceiptToCommunity(receipt);
    if (!saved) showToast("No se pudo compartir tu recibo con la comunidad.");
  } catch (error) {
    console.error("Error al procesar el recibo:", error);
    setScanStatus(error.message || "No se pudo procesar el recibo.", true);
  } finally {
    setAnalyzing(false);
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
      priceBasis: "unit", // marca que el precio NO es el total de la línea
      quantity: item.quantity,
      productId: item.productId,
    }));

    const docData = {
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
    };
    if (receipt.address) docData.address = receipt.address;

    try {
      await db.collection("community_receipts").add(docData);
    } catch (error) {
      // Si las reglas de Firestore todavía no aceptan el campo "address", se guarda sin él
      if (error.code === "permission-denied" && docData.address) {
        delete docData.address;
        await db.collection("community_receipts").add(docData);
      } else {
        throw error;
      }
    }

    clearOffersCache();
    return true;
  } catch (error) {
    console.error("Error al guardar el recibo comunitario:", error);
    return false;
  }
}

// Caché en memoria: evita repetir lecturas (y costos) durante la sesión
const offersCache = new Map();

// Índice de los nombres de producto que ya existen en recibos de la comunidad. Sirve para
// reconocer que "cer flips dulce de leche bo" (una tienda) y "cer flips dulce de leche
// bolsa" (otra) son el mismo producto. Se carga una vez por sesión y se reutiliza.
const communityKeyIndex = { promise: null, loadedAt: 0 };
// Recibos recientes de la comunidad: se leen una sola vez y sirven para el índice de nombres
// de producto y para los precios destacados de la semana.
const communityData = { promise: null, loadedAt: 0 };

function clearOffersCache() {
  offersCache.clear();
  communityKeyIndex.promise = null;
  communityData.promise = null;
}

// Medidas y presentaciones del nombre (500g, 1kg, 1.5l, x6): dos productos con medidas
// distintas no son comparables aunque los nombres se parezcan.
function extractMeasures(text) {
  const found =
    String(text).match(/\b(?:\d+(?:\.\d+)?(?:kg|g|l|ml)|x\d+)\b/g) || [];
  return [...new Set(found)].sort().join("|");
}

function measuresCompatible(a, b) {
  const ma = extractMeasures(a);
  const mb = extractMeasures(b);
  return !ma || !mb || ma === mb;
}

function loadCommunityReceipts() {
  const fresh =
    communityData.promise && Date.now() - communityData.loadedAt < 300000;
  if (fresh) return communityData.promise;

  communityData.loadedAt = Date.now();
  communityData.promise = (async () => {
    try {
      await ensureAuth();
      const snapshot = await db
        .collection("community_receipts")
        .orderBy("createdAt", "desc")
        .limit(SETTINGS.communityKeyScan)
        .get();
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          userId: data.userId || "",
          createdMs:
            data.createdAt && typeof data.createdAt.toMillis === "function"
              ? data.createdAt.toMillis()
              : 0,
          country: data.country,
          currency: data.currency,
          cityKey: data.cityKey || "",
          stateKey: data.stateKey || "",
          city: data.city || "",
          state: data.state || "",
          establishment: data.establishment || "",
          address: data.address || "",
          date: data.date || "",
          itemKeys: Array.isArray(data.itemKeys) ? data.itemKeys : [],
          items: Array.isArray(data.items) ? data.items : [],
        };
      });
    } catch (error) {
      console.warn(
        "No se pudieron leer los recibos recientes de la comunidad:",
        error,
      );
      communityData.promise = null;
      showToast("No se pudieron cargar los datos de la comunidad.");
      return [];
    }
  })();
  return communityData.promise;
}

function loadCommunityKeyIndex() {
  const fresh =
    communityKeyIndex.promise &&
    Date.now() - communityKeyIndex.loadedAt < 300000;
  if (fresh) return communityKeyIndex.promise;

  communityKeyIndex.loadedAt = Date.now();
  communityKeyIndex.promise = (async () => {
    try {
      const receipts = await loadCommunityReceipts();
      const keys = new Set();
      receipts.forEach((receipt) => {
        if (
          receipt.country !== AppState.country ||
          receipt.currency !== AppState.currency
        )
          return;
        receipt.itemKeys.forEach((key) => keys.add(key));
      });
      if (typeof Fuse === "undefined") return null;
      return new Fuse(
        [...keys].map((name) => ({ name })),
        {
          keys: ["name"],
          threshold: SETTINGS.communityFuseThreshold,
          includeScore: true,
          ignoreLocation: true,
        },
      );
    } catch (error) {
      console.warn(
        "No se pudo cargar el índice de productos de la comunidad:",
        error,
      );
      communityKeyIndex.promise = null;
      return null;
    }
  })();
  return communityKeyIndex.promise;
}

// Nombres parecidos ya guardados por la comunidad (sin repetir el mismo y con medidas compatibles)
async function similarCommunityKeys(text, limit = 3) {
  const fuse = await loadCommunityKeyIndex();
  const clean = normalizeName(text);
  if (!fuse || !clean) return [];
  return fuse
    .search(clean, { limit: limit + 3 })
    .filter(
      (r) =>
        r.score <= SETTINGS.communityFuseThreshold &&
        r.item.name !== clean &&
        measuresCompatible(clean, r.item.name),
    )
    .slice(0, limit)
    .map((r) => r.item.name);
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
          // Recibos guardados antes de marcar la base del precio: con cantidad > 1 no se sabe si
          // el precio era unitario o el total de la línea, así que no se usan.
          if (item.priceBasis !== "unit" && Number(item.quantity) > 1) return;
          const price = toNumber(item.price);
          if (price === null || price <= 0) return;
          offers.push({
            price,
            establishment: data.establishment || "Comercio local",
            address: data.address || "",
            city: data.city || "",
            state: data.state || "",
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
  if (receipt.subtotalMismatch) {
    leftHtml += `<p class="ticket-warning">⚠ La suma de los productos (${escapeHtml(formatMoney(receipt.itemsSum))}) no coincide con el subtotal del ticket (${escapeHtml(formatMoney(receipt.subtotal))}). Puede haber un producto o un precio mal leído.</p>`;
  }
  leftContainer.innerHTML = leftHtml;

  // Comparación con la comunidad (todas las consultas en paralelo)
  rightContainer.innerHTML =
    '<p class="ticket-hint empty">Buscando los mejores precios...</p>';
  const results = await Promise.all(
    receipt.processedItems.map(async (item) => {
      const similar = await similarCommunityKeys(item.standardName);
      const info = await findBestOffer(
        [item.standardName, ...similar],
        SETTINGS.compareDays,
      );
      return info.best;
    }),
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
        hint = `<span class="ticket-hint saving">📍 Más barato en: <strong>${escapeHtml(result.offer.establishment)}</strong> (~${escapeHtml(formatMoney(result.offer.price))} c/u, ${SCOPE_LABELS[result.scope]})</span>${
          result.offer.key !== item.standardName
            ? `<br><small class="ticket-hint empty">producto similar: ${escapeHtml(result.offer.key)}</small>`
            : ""
        }`;
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
// Se pone en true cuando ya se mostraron resultados de la lista actual
let listOptimized = false;

function saveShoppingList() {
  storageSet(STORAGE.shoppingList, JSON.stringify(AppState.shoppingList));
}

// Los resultados dejan de ser válidos si cambia la lista
function clearOptimizationResults() {
  const container = $("optimization-result-container");
  if (container) container.innerHTML = "";
  listOptimized = false;
}

// Vacía la lista y los resultados para empezar una lista nueva
function resetShoppingList() {
  AppState.shoppingList = [];
  saveShoppingList();
  clearOptimizationResults();
  renderShoppingList();
}

// Separa "azúcar, leche; 1,5 l de aceite" en productos sueltos. La coma entre dos
// números ("1,5") es un decimal y no separa; el punto y coma y el salto de línea sí.
function splitShoppingItems(text) {
  const parts = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const decimalComma =
      ch === "," &&
      /\d/.test(text[i - 1] || "") &&
      /\d/.test(text[i + 1] || "");
    if (ch === ";" || ch === "\n" || (ch === "," && !decimalComma)) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

// Agrega productos a la lista sin repetir. Devuelve cuántos se agregaron y cuántos ya estaban.
function addItemsToShoppingList(names) {
  const MAX_ITEMS = 100;
  const known = new Set(AppState.shoppingList.map(normalizePlace));
  let added = 0;
  let repeated = 0;

  for (const raw of names) {
    const itemName = raw.slice(0, 80);
    const key = normalizePlace(itemName);
    if (known.has(key)) {
      repeated += 1;
      continue;
    }
    if (AppState.shoppingList.length >= MAX_ITEMS) break;
    AppState.shoppingList.push(itemName);
    known.add(key);
    added += 1;
  }

  if (added > 0) {
    clearOptimizationResults();
    saveShoppingList();
    renderShoppingList();
  }
  return { added, repeated };
}

function addShoppingItem() {
  const input = $("shopping-item-input");
  if (!input) return;

  const { added, repeated } = addItemsToShoppingList(
    splitShoppingItems(input.value),
  );
  if (added === 0 && repeated === 0) return;

  input.value = "";
  renderShoppingSuggestions();
  input.focus();

  if (added > 1 || repeated > 0) {
    const parts = [];
    if (added > 1) parts.push(`Se agregaron ${added} productos`);
    else if (added === 1) parts.push("Se agregó 1 producto");
    if (repeated > 0)
      parts.push(`${repeated} ya estaba${repeated > 1 ? "n" : ""} en la lista`);
    showToast(parts.join(". "));
  }
}

function removeShoppingItem(index) {
  AppState.shoppingList.splice(index, 1);
  clearOptimizationResults();
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

  const hasItems = AppState.shoppingList.length > 0;
  $("btn-optimize-list").classList.toggle("hidden", !hasItems);
  $("btn-clear-list").classList.toggle("hidden", !hasItems);
  renderShoppingSuggestions();
}

/* ---------- Sugerencias: canasta básica y coincidencias mientras se escribe ---------- */
let suggestionsExpanded = false;

// La parte que se está escribiendo es la última, después de la última coma
function currentShoppingSegment() {
  const input = $("shopping-item-input");
  const parts = (input ? input.value : "").split(/[,;\n]/);
  return (parts[parts.length - 1] || "").trim();
}

function chipHtml(value, basic) {
  const label = `${basic ? "★ " : ""}${value}`;
  return `<button type="button" class="chip${basic ? " chip-basic" : ""}" data-add="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

function renderShoppingSuggestions() {
  const box = $("shopping-suggestions");
  if (!box || typeof suggestProducts !== "function") return;

  const inList = new Set(AppState.shoppingList.map(normalizePlace));
  const segment = currentShoppingSegment();
  let html = "";

  if (segment.length >= 2) {
    const items = suggestProducts(segment, { limit: 6, exclude: inList });
    if (items.length > 0) {
      html = `<div class="suggestions-head"><span class="suggestions-title">Sugerencias</span></div>
        <div class="chip-list">${items.map((item) => chipHtml(item.value, item.basic)).join("")}</div>`;
    }
  } else {
    const items = canastaSuggestions({
      expanded: suggestionsExpanded,
      exclude: inList,
    });
    const toggle = `<button type="button" class="chip-toggle" data-toggle-canasta>${
      suggestionsExpanded ? "Ver menos" : "Ver los 60"
    }</button>`;
    html = `<div class="suggestions-head"><span class="suggestions-title">Canasta básica</span>${toggle}</div>`;
    if (!suggestionsExpanded) {
      html += `<div class="chip-list">${items.map((item) => chipHtml(item.value, false)).join("")}</div>`;
    } else {
      const groups = [...new Set(items.map((item) => item.group))];
      groups.forEach((group) => {
        html += `<div class="suggestions-group">${escapeHtml(group)}</div><div class="chip-list">${items
          .filter((item) => item.group === group)
          .map((item) => chipHtml(item.value, false))
          .join("")}</div>`;
      });
    }
    if (items.length === 0) html = "";
  }
  box.innerHTML = html;
}

// Quita de la caja de texto la parte que se estaba escribiendo (ya se agregó como producto)
function removeCurrentShoppingSegment() {
  const input = $("shopping-item-input");
  if (!input) return;
  const cut = Math.max(
    input.value.lastIndexOf(","),
    input.value.lastIndexOf(";"),
  );
  input.value = cut === -1 ? "" : input.value.slice(0, cut + 1).trimEnd() + " ";
}

function cleanShoppingQuery(query) {
  return query
    .replace(/\b(de|del|la|el|los|las|un|una|unos|unas)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resultCardHtml(title, subtitle, statusHtml, note = "", detailId = "") {
  const clickable = detailId
    ? ` role="button" tabindex="0" data-detail="${escapeHtml(detailId)}" aria-label="Ver detalles de ${escapeHtml(title)}"`
    : "";
  const more = detailId
    ? '<div class="result-more">Ver detalles y dirección <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></div>'
    : "";
  return `
    <div class="product-result-card${detailId ? " clickable" : ""}"${clickable}>
      <div class="result-head">
        <h4 class="result-title">${escapeHtml(title)}</h4>
        ${subtitle ? `<small class="result-query">${escapeHtml(subtitle)}</small>` : ""}
      </div>
      <div class="price-status">${statusHtml}</div>
      ${note ? `<div class="result-note">${escapeHtml(note)}</div>` : ""}
      ${more}
    </div>`;
}

/* ---------- Ventana con el detalle de un precio ---------- */
const GENERIC_ESTABLISHMENTS = ["Establecimiento general", "Comercio local"];
const priceDetails = new Map();
let priceDetailCounter = 0;
let priceModalOpener = null;

function registerPriceDetail(detail, group = "") {
  const id = `d${++priceDetailCounter}`;
  priceDetails.set(id, { ...detail, group });
  return id;
}

// Cada pantalla (search, list, top) borra solo sus propios detalles al volver a dibujarse
function clearPriceDetails(group) {
  [...priceDetails].forEach(([id, detail]) => {
    if (detail.group === group) priceDetails.delete(id);
  });
}

const storeLabel = (offer) =>
  GENERIC_ESTABLISHMENTS.includes(offer.establishment)
    ? "Comercio no identificado en el ticket"
    : offer.establishment;

function daysAgoLabel(dateIso) {
  const time = dateIso ? new Date(`${dateIso}T12:00:00`).getTime() : NaN;
  if (Number.isNaN(time)) return "fecha desconocida";
  const days = Math.round((Date.now() - time) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

// Enlace al mapa: con la dirección si existe; si no, con el nombre del comercio (si lo tiene)
function mapsUrl(offer) {
  const hasName = !GENERIC_ESTABLISHMENTS.includes(offer.establishment);
  const parts = offer.address
    ? [offer.address, offer.city, offer.state]
    : hasName
      ? [offer.establishment, offer.city, offer.state]
      : [];
  const query = parts.filter(Boolean).join(", ");
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

// Mejor precio de cada establecimiento, del más barato al más caro
function bestPerEstablishment(offers) {
  const best = new Map();
  [...offers]
    .sort(
      (a, b) =>
        a.price - b.price || String(b.date).localeCompare(String(a.date)),
    )
    .forEach((offer) => {
      const key = normalizePlace(
        `${offer.establishment}|${offer.address || ""}`,
      );
      if (!best.has(key)) best.set(key, offer);
    });
  return [...best.values()];
}

function priceDetailHtml(detail) {
  const stores = bestPerEstablishment(detail.offers);
  const top = stores[0];
  const others = stores.slice(1, 5);
  const place = [top.city, top.state].filter(Boolean).join(", ");
  const tags = [
    detail.basic ? "★ Canasta básica" : "",
    prettyProductName(SCOPE_LABELS[detail.scope] || ""),
  ]
    .filter(Boolean)
    .join(" · ");
  const address = top.address
    ? escapeHtml(top.address)
    : '<span class="price-detail-missing">Dirección no proporcionada</span>';
  const map = mapsUrl(top);

  let html = `<h3 id="price-modal-title" class="price-detail-title">${escapeHtml(prettyProductName(detail.title))}</h3>`;
  if (tags) html += `<p class="price-detail-tags">${escapeHtml(tags)}</p>`;
  html += `
    <div class="price-detail-best">
      <div class="price-detail-label">Mejor precio encontrado</div>
      <div class="price-detail-price">${escapeHtml(formatMoney(top.price))} <small>c/u</small></div>
      <div class="price-detail-row"><i class="fa-solid fa-store" aria-hidden="true"></i><span>${escapeHtml(storeLabel(top))}</span></div>
      <div class="price-detail-row"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>${address}</span></div>
      ${place ? `<div class="price-detail-row"><i class="fa-solid fa-city" aria-hidden="true"></i><span>${escapeHtml(place)}</span></div>` : ""}
      <div class="price-detail-row"><i class="fa-regular fa-clock" aria-hidden="true"></i><span>Registrado ${escapeHtml(daysAgoLabel(top.date))}${top.date ? ` (${escapeHtml(top.date)})` : ""}</span></div>
      ${top.key && top.key !== detail.title ? `<div class="price-detail-row"><i class="fa-solid fa-tag" aria-hidden="true"></i><span>Producto: ${escapeHtml(prettyProductName(top.key))}</span></div>` : ""}
    </div>`;
  if (map) {
    html += `<a class="btn-3d primary-btn price-detail-map" href="${escapeHtml(map)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-diamond-turn-right" aria-hidden="true"></i> Cómo llegar</a>`;
  }
  if (others.length > 0) {
    html += `<h4 class="price-detail-sub">Otros precios encontrados</h4><ul class="price-detail-others">${others
      .map(
        (offer) =>
          `<li><span>${escapeHtml(storeLabel(offer))}${offer.city ? ` · ${escapeHtml(offer.city)}` : ""}</span><strong>${escapeHtml(formatMoney(offer.price))}</strong></li>`,
      )
      .join("")}</ul>`;
  }
  html += `<p class="price-detail-foot">Basado en ${detail.offers.length} registro(s) de la comunidad. Los precios pueden haber cambiado.</p>`;
  return html;
}

function openPriceDetail(id) {
  const detail = priceDetails.get(id);
  const modal = $("price-modal");
  if (!detail || !modal || detail.offers.length === 0) return;
  $("price-modal-body").innerHTML = priceDetailHtml(detail);
  priceModalOpener = document.activeElement;
  modal.classList.remove("hidden");
  const closeButton = $("btn-close-price");
  if (closeButton) closeButton.focus();
}

function closePriceModal() {
  const modal = $("price-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  if (priceModalOpener && typeof priceModalOpener.focus === "function")
    priceModalOpener.focus();
  priceModalOpener = null;
}

// Nombres con los que puede estar guardado el producto: el texto escrito tal cual,
// el texto sin artículos ("de", "la"...) y las coincidencias más cercanas del catálogo.
// Interpreta lo que escribió la persona. Si es algo general ("pasta", "leche", "salsa") se
// queda con el producto más popular (espagueti, leche en polvo, salsa de tomate); si es algo
// específico ("pasta de tomate") gana lo específico. Devuelve grupos de nombres para buscar
// precios por orden de prioridad: en cuanto un grupo tiene precios, se usa ese.
async function resolveShoppingQuery(query) {
  const exact = normalizeName(query);
  const cleaned = normalizeName(cleanShoppingQuery(query));
  const ranked =
    typeof rankProducts === "function" ? rankProducts(query, { limit: 4 }) : [];
  const top = ranked[0] ? ranked[0].product.name : null;
  const similarToTop = top ? await similarCommunityKeys(top) : [];

  const tiers = [
    [exact, top, ...similarToTop], // lo escrito tal cual y el producto más popular que coincide
    ranked.slice(1).map((r) => r.product.name), // otros productos parecidos, por popularidad
    await similarCommunityKeys(cleaned || exact), // productos de recibos que no están en el catálogo
  ].map((tier) => [...new Set(tier.filter(Boolean))]);

  return { tiers, interpreted: top };
}

async function findBestOfferTiered(tiers, days = SETTINGS.listDays) {
  const allKeys = [...new Set(tiers.flat())];
  const tried = [];
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i].length === 0) continue;
    const info = await findBestOffer(tiers[i], days);
    info.tier = i;
    if (info.best) return { ...info, keys: allKeys };
    tried.push(info);
  }
  const base = tried.find((info) => info.stale) ||
    tried[0] || { best: null, stale: null, totalOffers: 0, tier: 0 };
  return { ...base, keys: allKeys };
}

// Busca el mejor precio entre todos los nombres candidatos (ciudad, luego estado, luego país)
async function findBestOffer(keys, days = SETTINGS.listDays) {
  const lists = await Promise.all(
    keys.map(async (key) => ({
      key,
      offers: await fetchOffersForProduct(key),
    })),
  );
  const totalOffers = lists.reduce((sum, item) => sum + item.offers.length, 0);

  for (const scope of ["city", "state", "country"]) {
    const pool = [];
    lists.forEach(({ key, offers }) => {
      filterOffers(offers, { scope, days }).forEach((offer) =>
        pool.push({ ...offer, key }),
      );
    });
    if (pool.length > 0) {
      return {
        best: { offer: pickBestOffer(pool), scope, count: pool.length },
        pool,
        totalOffers,
        keys,
      };
    }
  }

  // Sin precios recientes: se ofrece el último registro conocido, avisando de su fecha
  let stale = null;
  if (totalOffers > 0) {
    const all = [];
    lists.forEach(({ key, offers }) =>
      offers.forEach((offer) => all.push({ ...offer, key })),
    );
    stale = [...all].sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) || a.price - b.price,
    )[0];
  }
  return { best: null, stale, totalOffers, keys };
}

function noOfferStatusHtml(info) {
  if (info && info.stale) {
    const s = info.stale;
    return `<span class="price-empty">📍 Último registro conocido: <strong>${escapeHtml(s.establishment)}</strong> (~${escapeHtml(formatMoney(s.price))}) <small class="result-query">fecha ${escapeHtml(s.date || "desconocida")} · puede estar desactualizado</small></span>`;
  }
  const searched = info && info.keys.length ? info.keys.join(" · ") : "";
  return `<span class="price-empty">📍 Aún no hay registros de este producto${
    searched
      ? ` <small class="result-query">(buscado como: ${escapeHtml(searched)})</small>`
      : ""
  }</span>`;
}

function bestOfferStatusHtml(best, info) {
  if (!best) return noOfferStatusHtml(info);
  const when = best.offer.date ? ` · ${escapeHtml(best.offer.date)}` : "";
  return `📍 Cómpralo más barato en: <strong>${escapeHtml(best.offer.establishment)}</strong> (~${escapeHtml(formatMoney(best.offer.price))} c/u) <small class="result-query">${SCOPE_LABELS[best.scope]} · ${best.count} registro(s)${when}</small>`;
}

async function optimizeShoppingList() {
  clearPriceDetails("list");
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
        const plan = await resolveShoppingQuery(query);
        const info = await findBestOfferTiered(plan.tiers);
        return {
          query,
          plan,
          title: info.best ? info.best.offer.key : plan.interpreted || query,
          best: info.best,
          info,
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
      const usedFallback =
        row.best &&
        row.plan.interpreted &&
        row.info.tier > 0 &&
        row.best.offer.key !== row.plan.interpreted;
      const detailId = row.best
        ? registerPriceDetail(
            {
              title: row.title,
              offers: row.info.pool,
              scope: row.best.scope,
              basic: Boolean(
                standardProductCatalog.find((p) => p.name === row.title)?.basic,
              ),
            },
            "list",
          )
        : "";
      html += resultCardHtml(
        row.title,
        `Buscado: "${row.query}"`,
        bestOfferStatusHtml(row.best, row.info),
        usedFallback
          ? `Aún no hay registros de ${prettyProductName(row.plan.interpreted)}: se muestra el producto más cercano.`
          : "",
        detailId,
      );
    });
    if (withPrice > 0) {
      html += `<p class="ticket-total optimized">Total estimado (${withPrice} de ${rows.length} productos): ${escapeHtml(formatMoney(estimatedTotal))}</p>`;
    }
    html += adBlockHtml("list");
    container.innerHTML = html;
    mountAds(container);
    listOptimized = true;
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
  clearPriceDetails("search");

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

  // Primero lo más específico y, a igualdad, lo más popular (la canasta básica va primero)
  const ranked =
    typeof rankProducts === "function" ? rankProducts(query, { limit: 8 }) : [];
  const basicNames = new Set(
    ranked.filter((r) => r.product.basic).map((r) => r.product.name),
  );
  let names = ranked.map((r) => r.product.name);
  // También productos que solo existen en recibos de la comunidad (fuera del catálogo)
  const communityNames = await similarCommunityKeys(cleaned, 5);
  names = [...new Set([...names, ...communityNames])].slice(0, 8);
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
  rows.forEach(({ name, offers }, index) => {
    if (index === 3) html += adBlockHtml("search"); // tras el tercer resultado
    if (offers.length === 0) {
      html += resultCardHtml(
        name,
        basicNames.has(name) ? "★ Canasta básica" : "",
        '<span class="price-empty">📍 Sin registros con estos filtros</span>',
      );
      return;
    }
    const best = pickBestOffer(offers);
    html += resultCardHtml(
      name,
      `${basicNames.has(name) ? "★ Canasta básica · " : ""}${offers.length} registro(s) · ${SCOPE_LABELS[scope]}`,
      `📍 Mejor precio: <strong>${escapeHtml(formatMoney(best.price))}</strong> c/u en ${escapeHtml(storeLabel(best))}`,
      "",
      registerPriceDetail(
        {
          title: name,
          offers: offers.map((offer) => ({ ...offer, key: name })),
          scope,
          basic: basicNames.has(name),
        },
        "search",
      ),
    );
  });
  if (rows.length >= 2 && rows.length <= 3) html += adBlockHtml("search"); // pocos resultados: al final
  container.innerHTML =
    html ||
    '<p class="section-subtitle">No encontramos productos con ese nombre.</p>';
  mountAds(container);
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runProductSearch, SETTINGS.searchDebounceMs);
}

/* ========================================== */
/* 12 bis. PUBLICIDAD (GOOGLE ADSENSE)        */
/* ========================================== */
// Los anuncios solo aparecen en pantallas con contenido (resultados), nunca en el inicio
// ni junto a botones de navegación. Mientras ads.js no tenga tus datos de AdSense no se
// muestra nada ni se carga ningún script de Google.
// Tamaños fijos estándar de AdSense: 300 x 250 (rectángulo mediano) y 250 x 250 (cuadrado),
// este último solo para pantallas muy estrechas.
const AD_SIZES = [
  { width: 300, height: 250 },
  { width: 250, height: 250 },
];

const pickAdSize = (availableWidth) =>
  AD_SIZES.find((size) => size.width <= availableWidth) || null;

function adsenseReady(placement) {
  return (
    typeof ADSENSE_CLIENT !== "undefined" &&
    /^ca-pub-\d{10,20}$/.test(ADSENSE_CLIENT) &&
    typeof ADSENSE_SLOTS !== "undefined" &&
    /^\d{6,20}$/.test(String(ADSENSE_SLOTS[placement] || ""))
  );
}

// Espacio reservado con etiqueta "Publicidad" y 2 rem de aire arriba y abajo
function adBlockHtml(placement) {
  if (!adsenseReady(placement)) return "";
  return `<div class="ad-wrap"><span class="ad-label">Publicidad</span><div class="ad-box" data-ad-box data-placement="${escapeHtml(placement)}"></div></div>`;
}

let adsenseScriptLoaded = false;

function loadAdsenseScript() {
  if (adsenseScriptLoaded) return;
  adsenseScriptLoaded = true;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
  document.head.appendChild(script);
}

// Convierte cada espacio reservado en un bloque de AdSense del tamaño exacto
function mountAds(container) {
  if (!container) return;
  container.querySelectorAll("[data-ad-box]").forEach((box) => {
    const wrap = box.closest(".ad-wrap");
    const size = pickAdSize(box.clientWidth);
    const placement = box.dataset.placement;
    if (!size || !adsenseReady(placement)) {
      if (wrap) wrap.remove(); // sin espacio suficiente: no se muestra el anuncio
      return;
    }
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.cssText = `display:inline-block;width:${size.width}px;height:${size.height}px`;
    ins.dataset.adClient = ADSENSE_CLIENT;
    ins.dataset.adSlot = String(ADSENSE_SLOTS[placement]);
    if (typeof ADSENSE_TEST_MODE !== "undefined" && ADSENSE_TEST_MODE)
      ins.dataset.adtest = "on";
    box.appendChild(ins);
    loadAdsenseScript();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.warn("AdSense:", error);
    }
  });
}

/* ========================================== */
/* 12 ter. PRECIOS DESTACADOS DE LA SEMANA    */
/* ========================================== */
// El cálculo está en top-prices.js. Aquí solo se dibuja la pantalla.
let topState = { category: "all", result: null };
let topRenderToken = 0;

const prefersReducedMotion = () =>
  Boolean(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

function topPlaceLabel(scope) {
  if (scope === "city") return AppState.city;
  if (scope === "state") return AppState.state;
  return "tu país";
}

function topIconHtml(category, size = "") {
  return `<span class="top-icon${size ? ` ${size}` : ""}"><i class="fa-solid ${topIconFor(category)}" aria-hidden="true"></i></span>`;
}

function topStoreLine(offer) {
  const place =
    offer.city && normalizePlace(offer.city) !== normalizePlace(AppState.city)
      ? ` · ${offer.city}`
      : "";
  return `${storeLabel(offer)}${place}`;
}

function topSavingPill(item, compact = false) {
  const pct = Math.round(item.saving * 100);
  return `<span class="saving-pill${compact ? " sm" : ""}">−<span class="count-up" data-to="${pct}">${pct}</span> %${
    compact ? "" : " bajo el promedio"
  }</span>`;
}

// Barra sin imágenes: el relleno es este precio y la marca es el promedio de la zona
function topBarHtml(item) {
  const scale = item.mean * 1.3;
  const fill = Math.min(100, (item.bestPrice / scale) * 100).toFixed(1);
  const mark = Math.min(100, (item.mean / scale) * 100).toFixed(1);
  return `<div class="avg-bar" style="--fill:${fill}%;--mark:${mark}%"><span class="avg-bar-fill"></span><span class="avg-bar-mark"></span></div>
    <div class="avg-legend"><span>Este precio</span><span>Promedio de la zona</span></div>`;
}

function topFirstCardHtml(item, detailId) {
  const name = prettyProductName(item.key);
  return `<article class="top-card top-first" role="button" tabindex="0" data-detail="${escapeHtml(detailId)}" aria-label="${escapeHtml(`Puesto 1: ${name}`)}">
    <div class="top-card-head">
      <span class="rank-badge">1</span>
      <div class="top-card-title"><h3>${escapeHtml(name)}</h3><p>${escapeHtml(topStoreLine(item.best))}</p></div>
      ${topIconHtml(item.category)}
    </div>
    <div class="top-card-price"><span class="top-price">${escapeHtml(formatMoney(item.bestPrice))}</span><small>c/u</small></div>
    ${topSavingPill(item)}
    ${topBarHtml(item)}
    <div class="top-meta">${item.count} registros · ${item.storeCount} comercios · ${escapeHtml(daysAgoLabel(item.best.date))}</div>
    ${item.basic ? '<span class="top-basic">★ Canasta básica</span>' : ""}
  </article>`;
}

function topSmallCardHtml(item, rank, detailId) {
  const name = prettyProductName(item.key);
  return `<article class="top-card top-small ${rank === 2 ? "top-second" : "top-third"}" role="button" tabindex="0" data-detail="${escapeHtml(detailId)}" aria-label="${escapeHtml(`Puesto ${rank}: ${name}`)}">
    <div class="top-small-head"><span class="rank-badge sm">${rank}</span>${topIconHtml(item.category, "sm")}</div>
    <h3>${escapeHtml(name)}</h3>
    <div class="top-price sm">${escapeHtml(formatMoney(item.bestPrice))}</div>
    ${topSavingPill(item, true)}
    <p class="top-store">${escapeHtml(topStoreLine(item.best))}</p>
  </article>`;
}

function topRowHtml(item, rank, detailId) {
  const name = prettyProductName(item.key);
  return `<div class="top-row" role="button" tabindex="0" data-detail="${escapeHtml(detailId)}" aria-label="${escapeHtml(`Puesto ${rank}: ${name}`)}">
    <span class="top-row-rank">${rank}</span>
    ${topIconHtml(item.category, "sm")}
    <span class="top-row-name"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(topStoreLine(item.best))}</small></span>
    <span class="top-row-price">${escapeHtml(formatMoney(item.bestPrice))}<small class="top-row-saving">−${Math.round(item.saving * 100)} %</small></span>
  </div>`;
}

function topEmptyHtml(result) {
  return `<div class="top-empty card-3d">
    <div class="top-empty-icon"><i class="fa-solid fa-chart-line" aria-hidden="true"></i></div>
    <h3>Aún no hay suficientes datos en ${escapeHtml(AppState.city)}</h3>
    <p>Para destacar un precio necesitamos, esta semana, al menos ${TOP_SETTINGS.minRecords} registros del mismo producto, de ${TOP_SETTINGS.minStores} comercios y ${TOP_SETTINGS.minUsers} personas distintas.</p>
    <p class="top-empty-count">Recibos de los últimos ${TOP_SETTINGS.days} días en tu ciudad: <strong>${result.cityReceiptCount}</strong></p>
    <button type="button" class="btn-3d primary-btn" data-view="scan"><i class="fa-solid fa-camera" aria-hidden="true"></i> Subir mi recibo</button>
  </div>`;
}

let topDetailIds = [];

function renderTopChips() {
  const box = $("top-chips");
  if (!box) return;
  box.innerHTML = TOP_CATEGORIES.map(
    (category) =>
      `<button type="button" class="top-chip" data-top-category="${category.id}" aria-pressed="${category.id === topState.category}">${escapeHtml(category.label)}</button>`,
  ).join("");
}

function animateCountUps(root) {
  root.querySelectorAll(".count-up").forEach((element) => {
    const target = Number(element.dataset.to);
    if (!Number.isFinite(target)) return;
    if (prefersReducedMotion()) {
      element.textContent = String(target);
      return;
    }
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / 700);
      element.textContent = String(
        Math.round(target * (1 - Math.pow(1 - t, 3))),
      );
      if (t < 1) requestAnimationFrame(step);
    };
    element.textContent = "0";
    requestAnimationFrame(step);
  });
}

function renderTopContent() {
  const container = $("top-results-container");
  const result = topState.result;
  if (!container || !result) return;

  clearPriceDetails("top");
  const subtitle = $("top-subtitle");

  if (result.items.length === 0) {
    if (subtitle)
      subtitle.textContent = `${AppState.city} · últimos ${TOP_SETTINGS.days} días`;
    container.innerHTML = topEmptyHtml(result);
    return;
  }

  const items = filterTopByCategory(result.items, topState.category).slice(
    0,
    8,
  );
  if (subtitle) {
    subtitle.textContent = `${topPlaceLabel(result.scope)} · últimos ${TOP_SETTINGS.days} días · ${items.length} ${
      items.length === 1 ? "producto" : "productos"
    }`;
  }

  const detailFor = (item) =>
    registerPriceDetail(
      {
        title: item.key,
        offers: item.offers,
        scope: result.scope,
        basic: item.basic,
      },
      "top",
    );

  let html = "";
  if (result.scope !== "city") {
    html += `<p class="top-scope-note">Aún no hay suficientes datos en ${escapeHtml(AppState.city)}: mostramos los de ${escapeHtml(topPlaceLabel(result.scope))}.</p>`;
  }
  if (items.length === 0) {
    html +=
      '<p class="section-subtitle">Ningún producto destacado de esta semana pertenece a esa categoría.</p>';
  } else {
    html += '<div class="top-podium">';
    items.slice(0, 3).forEach((item, index) => {
      html +=
        index === 0
          ? topFirstCardHtml(item, detailFor(item))
          : topSmallCardHtml(item, index + 1, detailFor(item));
    });
    html += "</div>";
    if (items.length > 3) html += adBlockHtml("top");
    if (items.length > 3) {
      html += `<div class="top-list">${items
        .slice(3)
        .map((item, index) => topRowHtml(item, index + 4, detailFor(item)))
        .join("")}</div>`;
    }
    html += `<p class="top-foot">Basado en ${result.receiptCount} recibos de los últimos ${TOP_SETTINGS.days} días. El promedio se calcula con los registros de la misma zona. Los precios pueden haber cambiado.</p>`;
  }
  container.innerHTML = html;
  mountAds(container);
  animateCountUps(container);
}

async function renderTopView() {
  const container = $("top-results-container");
  if (!container) return;
  if (!hasRegionConfig()) {
    openRegionalModal();
    return;
  }
  const token = ++topRenderToken;
  const subtitle = $("top-subtitle");
  if (subtitle)
    subtitle.textContent = `${AppState.city} · últimos ${TOP_SETTINGS.days} días`;
  renderTopChips();
  container.innerHTML =
    '<div class="top-skeleton"></div><div class="top-skeleton short"></div><div class="top-skeleton"></div>';

  const receipts = await loadCommunityReceipts();
  if (token !== topRenderToken) return; // se abrió otra vez mientras cargaba
  topState.result = computeTopPrices(receipts, {
    country: AppState.country,
    currency: AppState.currency,
    cityKey: normalizePlace(AppState.city),
    stateKey: normalizePlace(AppState.state),
  });
  renderTopContent();
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
      closePriceModal();
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
  $("receipt-camera-input").addEventListener("change", handleImageUpload);
  $("btn-remove-image").addEventListener("click", () => {
    clearImagePreview(); // vuelven a mostrarse los botones de cámara y galería
    setScanStatus("");
  });
  $("btn-process-receipt").addEventListener("click", processReceiptWithGemini);
  $("btn-close-alert").addEventListener("click", closeAlertModal);

  // Detalle de un precio: tocar una tarjeta lo abre; la X o tocar fuera de la ventana lo cierra
  [
    "search-results-container",
    "optimization-result-container",
    "top-results-container",
  ].forEach((id) => {
    const container = $(id);
    if (!container) return;
    container.addEventListener("click", (event) => {
      const card = event.target.closest("[data-detail]");
      if (card) openPriceDetail(card.dataset.detail);
    });
  });
  const topChips = $("top-chips");
  if (topChips) {
    topChips.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-top-category]");
      if (!chip) return;
      topState.category = chip.dataset.topCategory;
      renderTopChips();
      renderTopContent();
    });
  }
  const priceModal = $("price-modal");
  if (priceModal) {
    priceModal.addEventListener("click", (event) => {
      if (
        event.target === priceModal ||
        event.target.closest("#btn-close-price")
      )
        closePriceModal();
    });
  }

  // Lista de compras
  $("btn-add-shopping-item").addEventListener("click", addShoppingItem);
  $("shopping-item-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addShoppingItem();
  });
  $("shopping-item-input").addEventListener("input", renderShoppingSuggestions);
  const suggestionsBox = $("shopping-suggestions");
  if (suggestionsBox) {
    suggestionsBox.addEventListener("click", (event) => {
      const addButton = event.target.closest("[data-add]");
      if (addButton) {
        const typing = currentShoppingSegment().length >= 2;
        const { repeated } = addItemsToShoppingList([addButton.dataset.add]);
        if (typing) removeCurrentShoppingSegment();
        if (repeated > 0) showToast("Ese producto ya estaba en la lista");
        renderShoppingSuggestions();
        return;
      }
      if (event.target.closest("[data-toggle-canasta]")) {
        suggestionsExpanded = !suggestionsExpanded;
        renderShoppingSuggestions();
      }
    });
  }
  // Un campo de una sola línea borra los saltos de línea al pegar: se convierten en comas
  $("shopping-item-input").addEventListener("paste", (event) => {
    const text = event.clipboardData && event.clipboardData.getData("text");
    if (!text || !/[\r\n]/.test(text)) return;
    event.preventDefault();
    const input = event.target;
    input.setRangeText(
      text.replace(/\s*[\r\n]+\s*/g, ", "),
      input.selectionStart,
      input.selectionEnd,
      "end",
    );
  });
  $("shopping-list-items").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-index]");
    if (btn) removeShoppingItem(Number(btn.dataset.removeIndex));
  });
  $("btn-optimize-list").addEventListener("click", optimizeShoppingList);
  $("btn-clear-list").addEventListener("click", () => {
    resetShoppingList();
    $("shopping-item-input").focus();
  });

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
