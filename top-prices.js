/* ========================================== */
/* TOP-PRICES.JS - PRECIOS DESTACADOS DE LA SEMANA */
/* ========================================== */
/*
  Con los recibos de los últimos 7 días calcula qué productos tienen un precio claramente
  por debajo del promedio de la zona (primero tu ciudad; si no hay datos, tu estado y luego
  tu país).

  Para que el resultado sea confiable, un producto solo entra si cumple TODO esto:
  - Tiene al menos 3 registros, de al menos 2 comercios y 2 personas distintas
    (así una sola persona o un solo comercio no puede armar el Top).
  - Se descartan precios atípicos (menos de 0,4 veces o más de 2,5 veces la mediana),
    que casi siempre son lecturas erróneas de la IA.
  - El ahorro frente al promedio está entre 5 % y 60 %.
  - Una persona cuenta una sola vez por producto y por día.

  Todos los límites están en TOP_SETTINGS: ajústalos aquí. Mientras la comunidad es pequeña
  puedes bajar minUsers y minStores a 1 para probar, y volver a subirlos después.
*/

const TOP_SETTINGS = {
  days: 7,
  minRecords: 3,
  minStores: 2, //normal es:2 (está en 1 por periodo de prueba)
  minUsers: 2, //normal es: 2 (está en 1 por periodo de prueba)
  minSaving: 0.05,
  maxSaving: 0.6,
  outlierLow: 0.4,
  outlierHigh: 2.5,
  minItems: 3, // productos mínimos para mostrar la sección
  maxResults: 24, // se calculan más de 8 para poder filtrar por categoría
  basicBoost: 3, // pequeño empujón a los productos de la canasta básica
};

const TOP_GENERIC_STORES = ["Establecimiento general", "Comercio local"];

// Filtros de la pantalla. "match" son las categorías del catálogo que incluye cada uno.
const TOP_CATEGORIES = [
  { id: "all", label: "Todos", match: null },
  { id: "viveres", label: "Víveres", match: ["Víveres"] },
  { id: "carnes", label: "Carnes", match: ["Carnes", "Embutidos", "Pescados"] },
  { id: "lacteos", label: "Lácteos", match: ["Lácteos"] },
  { id: "frescos", label: "Frutas y verduras", match: ["Frutas", "Verduras"] },
  { id: "bebidas", label: "Bebidas", match: ["Bebidas", "Licores"] },
  {
    id: "hogar",
    label: "Hogar e higiene",
    match: ["Limpieza", "Cuidado Personal"],
  },
];

// Como no hay fotos de productos, cada categoría tiene su icono
const TOP_ICONS = {
  Víveres: "fa-wheat-awn",
  Lácteos: "fa-cheese",
  Carnes: "fa-drumstick-bite",
  Embutidos: "fa-drumstick-bite",
  Pescados: "fa-fish",
  Verduras: "fa-carrot",
  Frutas: "fa-apple-whole",
  Bebidas: "fa-bottle-water",
  Licores: "fa-wine-bottle",
  Limpieza: "fa-spray-can-sparkles",
  "Cuidado Personal": "fa-pump-soap",
};

const topIconFor = (category) => TOP_ICONS[category] || "fa-tag";

function topNormalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function topMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Convierte los recibos en una lista de productos con su mejor precio y su ahorro
function buildTopItems(receipts, catalogByName, settings) {
  const newestFirst = [...receipts].sort((a, b) => b.createdMs - a.createdMs);
  const seen = new Set();
  const groups = new Map();

  newestFirst.forEach((receipt) => {
    (receipt.items || []).forEach((item) => {
      const price = Number(item.price);
      if (!item.standardName || !(price > 0)) return;
      // Registros antiguos con cantidad > 1 y sin la marca "unit": no se sabe si el precio es unitario
      if (item.priceBasis !== "unit" && Number(item.quantity) > 1) return;

      // Una persona cuenta una sola vez por producto y por día
      const onceKey = `${receipt.userId}|${item.standardName}|${receipt.date}`;
      if (seen.has(onceKey)) return;
      seen.add(onceKey);

      const unnamed =
        !receipt.establishment ||
        TOP_GENERIC_STORES.includes(receipt.establishment);
      const storeKey = unnamed
        ? `sin-nombre|${receipt.userId}`
        : `${topNormalize(receipt.establishment)}|${topNormalize(receipt.address)}`;

      if (!groups.has(item.standardName)) groups.set(item.standardName, []);
      groups.get(item.standardName).push({
        price,
        userId: receipt.userId,
        storeKey,
        createdMs: receipt.createdMs,
        offer: {
          price,
          establishment: receipt.establishment || "Comercio local",
          address: receipt.address || "",
          city: receipt.city || "",
          state: receipt.state || "",
          date: receipt.date || "",
          key: item.standardName,
        },
      });
    });
  });

  const items = [];
  groups.forEach((observations, key) => {
    // 1) fuera los precios atípicos
    const median = topMedian(observations.map((o) => o.price));
    const kept = observations.filter(
      (o) =>
        o.price >= median * settings.outlierLow &&
        o.price <= median * settings.outlierHigh,
    );
    // 2) suficiente evidencia y de fuentes distintas
    if (kept.length < settings.minRecords) return;
    const stores = new Set(kept.map((o) => o.storeKey));
    const users = new Set(kept.map((o) => o.userId));
    if (stores.size < settings.minStores || users.size < settings.minUsers)
      return;

    // 3) ahorro frente al promedio de la zona
    const mean = kept.reduce((sum, o) => sum + o.price, 0) / kept.length;
    const best = [...kept].sort(
      (a, b) => a.price - b.price || b.createdMs - a.createdMs,
    )[0];
    const saving = (mean - best.price) / mean;
    if (saving < settings.minSaving || saving > settings.maxSaving) return;

    const product = catalogByName.get(key);
    const category = product ? product.category : "Otros";
    const basic = Boolean(product && product.basic);
    items.push({
      key,
      category,
      basic,
      bestPrice: best.price,
      mean,
      saving,
      count: kept.length,
      storeCount: stores.size,
      best: best.offer,
      offers: kept.map((o) => o.offer).sort((a, b) => a.price - b.price),
      score:
        saving * 100 +
        (basic ? settings.basicBoost : 0) +
        Math.min(kept.length, 10) * 0.1,
    });
  });

  return items.sort((a, b) => b.score - a.score).slice(0, settings.maxResults);
}

/**
 * @param receipts  recibos de la comunidad: { userId, createdMs, country, currency, cityKey,
 *                  stateKey, city, state, establishment, address, date, items: [...] }
 * @param region    { country, currency, cityKey, stateKey }
 * @returns { scope: "city"|"state"|"country"|null, items, receiptCount, cityReceiptCount }
 */
function computeTopPrices(receipts, region, options = {}) {
  const settings = { ...TOP_SETTINGS, ...(options.settings || {}) };
  const now = options.now ?? Date.now();
  const catalog =
    options.catalog ||
    (typeof initialCatalogData !== "undefined" ? initialCatalogData : []);
  const catalogByName = new Map(
    catalog.map((product) => [product.name, product]),
  );
  const since = now - settings.days * 86400000;

  const recent = receipts.filter(
    (r) =>
      r.country === region.country &&
      r.currency === region.currency &&
      r.createdMs >= since,
  );
  const scopes = [
    {
      id: "city",
      pool: recent.filter((r) => r.cityKey && r.cityKey === region.cityKey),
    },
    {
      id: "state",
      pool: recent.filter((r) => r.stateKey && r.stateKey === region.stateKey),
    },
    { id: "country", pool: recent },
  ];

  for (const scope of scopes) {
    const items = buildTopItems(scope.pool, catalogByName, settings);
    if (items.length >= settings.minItems) {
      return {
        scope: scope.id,
        items,
        receiptCount: scope.pool.length,
        cityReceiptCount: scopes[0].pool.length,
      };
    }
  }
  return {
    scope: null,
    items: [],
    receiptCount: recent.length,
    cityReceiptCount: scopes[0].pool.length,
  };
}

function filterTopByCategory(items, categoryId) {
  const category = TOP_CATEGORIES.find((c) => c.id === categoryId);
  if (!category || !category.match) return items;
  return items.filter((item) => category.match.includes(item.category));
}
