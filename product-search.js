/* ========================================== */
/* PRODUCT-SEARCH.JS - CANASTA BÁSICA Y BÚSQUEDA INTELIGENTE */
/* ========================================== */
/*
  Qué hace este archivo
  1. Define la "canasta básica" de 60 productos (CANASTA_BASICA) y le da un peso de
     popularidad a cada producto del catálogo.
  2. Ordena los resultados para que, si la persona escribe algo general ("pasta", "leche",
     "salsa"), salga primero el producto más popular (espagueti, leche en polvo, salsa de
     tomate), y si escribe algo específico ("pasta de tomate"), gane lo específico.

  Sobre la lista de 60 productos
  El Cendas-FVM mide su Canasta Alimentaria Familiar con 60 productos, pero no se pudo
  consultar el listado completo publicado. Esta lista es una ADAPTACIÓN: parte de los
  productos que los reportes del Cendas nombran (leche en polvo, arroz, harina de maíz,
  pastas, caraotas, aceite de maíz, margarina, azúcar, mortadela, sardinas, atún, queso
  blanco y amarillo, café, salsa de tomate, mayonesa...) y la completa con los rubros típicos
  (tubérculos, hortalizas, frutas, carnes). Se puede editar libremente: cambia, quita o
  reordena las filas. El orden importa: la primera fila es la más popular.
*/

// id = producto principal del catálogo; alt = variantes cercanas (algo menos populares)
const CANASTA_BASICA = [
  // Los más consultados (se muestran primero como sugerencias rápidas)
  {
    label: "Arroz",
    id: "prod_005",
    alt: ["prod_006", "prod_221"],
    group: "Cereales",
  },
  {
    label: "Harina de maíz",
    id: "prod_003",
    alt: ["prod_004"],
    group: "Cereales",
  },
  { label: "Pasta", id: "prod_007", alt: ["prod_008"], group: "Cereales" },
  {
    label: "Azúcar",
    id: "prod_001",
    alt: ["prod_002"],
    group: "Azúcares y grasas",
  },
  {
    label: "Aceite",
    id: "prod_009",
    alt: ["prod_010"],
    group: "Azúcares y grasas",
  },
  {
    label: "Leche en polvo",
    id: "prod_050",
    alt: ["prod_051", "prod_052", "prod_053"],
    group: "Lácteos y huevos",
  },
  {
    label: "Huevos",
    id: "prod_063",
    alt: ["prod_064"],
    group: "Lácteos y huevos",
  },
  {
    label: "Pollo",
    id: "prod_081",
    alt: ["prod_082", "prod_085", "prod_084"],
    group: "Carnes",
  },
  { label: "Carne molida", id: "prod_078", group: "Carnes" },
  {
    label: "Café",
    id: "prod_032",
    alt: ["prod_033"],
    group: "Azúcares y grasas",
  },
  { label: "Caraotas", id: "prod_012", group: "Leguminosas" },
  {
    label: "Queso blanco",
    id: "prod_054",
    alt: ["prod_055"],
    group: "Lácteos y huevos",
  },
  // Resto de la canasta
  {
    label: "Pan",
    id: "prod_040",
    alt: ["prod_041", "prod_042"],
    group: "Cereales",
  },
  {
    label: "Margarina",
    id: "prod_059",
    alt: ["prod_058"],
    group: "Azúcares y grasas",
  },
  { label: "Sal", id: "prod_016", group: "Azúcares y grasas" },
  {
    label: "Harina de trigo",
    id: "prod_029",
    alt: ["prod_028"],
    group: "Cereales",
  },
  { label: "Avena", id: "prod_030", group: "Cereales" },
  {
    label: "Galletas de soda",
    id: "prod_038",
    alt: ["prod_037", "prod_036"],
    group: "Cereales",
  },
  { label: "Maicena", id: "prod_047", group: "Cereales" },
  { label: "Frijoles", id: "prod_013", group: "Leguminosas" },
  { label: "Lentejas", id: "prod_014", group: "Leguminosas" },
  { label: "Arvejas", id: "prod_015", group: "Leguminosas" },
  { label: "Papelón", id: "prod_235", group: "Azúcares y grasas" },
  { label: "Queso amarillo", id: "prod_056", group: "Lácteos y huevos" },
  {
    label: "Carne para desmechar",
    id: "prod_077",
    alt: ["prod_079", "prod_080"],
    group: "Carnes",
  },
  {
    label: "Carne de cerdo",
    id: "prod_088",
    alt: ["prod_086", "prod_087"],
    group: "Carnes",
  },
  { label: "Hígado de res", id: "prod_234", group: "Carnes" },
  { label: "Mortadela", id: "prod_075", alt: ["prod_076"], group: "Embutidos" },
  { label: "Salchichas", id: "prod_073", group: "Embutidos" },
  { label: "Jamón", id: "prod_070", alt: ["prod_071"], group: "Embutidos" },
  {
    label: "Atún enlatado",
    id: "prod_017",
    alt: ["prod_018"],
    group: "Pescados",
  },
  { label: "Sardinas", id: "prod_019", group: "Pescados" },
  {
    label: "Pescado fresco",
    id: "prod_089",
    alt: ["prod_090"],
    group: "Pescados",
  },
  { label: "Papa", id: "prod_100", group: "Tubérculos y plátanos" },
  { label: "Yuca", id: "prod_109", group: "Tubérculos y plátanos" },
  { label: "Plátano", id: "prod_112", group: "Tubérculos y plátanos" },
  { label: "Ocumo", id: "prod_110", group: "Tubérculos y plátanos" },
  { label: "Ñame", id: "prod_111", group: "Tubérculos y plátanos" },
  { label: "Cebolla", id: "prod_101", group: "Hortalizas" },
  { label: "Tomate", id: "prod_102", group: "Hortalizas" },
  { label: "Zanahoria", id: "prod_103", group: "Hortalizas" },
  { label: "Pimentón", id: "prod_104", group: "Hortalizas" },
  { label: "Ajo", id: "prod_105", group: "Hortalizas" },
  { label: "Auyama", id: "prod_113", group: "Hortalizas" },
  { label: "Repollo", id: "prod_114", group: "Hortalizas" },
  { label: "Lechuga", id: "prod_115", group: "Hortalizas" },
  { label: "Cilantro", id: "prod_106", group: "Hortalizas" },
  { label: "Apio", id: "prod_108", group: "Hortalizas" },
  { label: "Cebollín", id: "prod_107", group: "Hortalizas" },
  { label: "Pepino", id: "prod_116", group: "Hortalizas" },
  { label: "Cambur", id: "prod_117", group: "Frutas" },
  { label: "Naranja", id: "prod_121", group: "Frutas" },
  { label: "Limón", id: "prod_122", group: "Frutas" },
  { label: "Patilla", id: "prod_123", group: "Frutas" },
  { label: "Lechoza", id: "prod_125", group: "Frutas" },
  { label: "Manzana", id: "prod_118", alt: ["prod_119"], group: "Frutas" },
  { label: "Piña", id: "prod_127", group: "Frutas" },
  { label: "Salsa de tomate", id: "prod_022", group: "Salsas" },
  { label: "Mayonesa", id: "prod_023", group: "Salsas" },
  { label: "Pasta de tomate", id: "prod_021", group: "Salsas" },
];

// Productos muy comprados que no son de la canasta alimentaria (limpieza, higiene, bebidas...)
const POPULAR_EXTRA_IDS = [
  "prod_142",
  "prod_143",
  "prod_140",
  "prod_149",
  "prod_170",
  "prod_171",
  "prod_172",
  "prod_174",
  "prod_176",
  "prod_180",
  "prod_181",
  "prod_185",
  "prod_200",
  "prod_202",
  "prod_204",
  "prod_207",
  "prod_045",
  "prod_036",
  "prod_031",
  "prod_060",
  "prod_061",
  "prod_057",
  "prod_025",
  "prod_024",
];

// Cuántas sugerencias rápidas se ven antes de pulsar "Ver los 60"
const CANASTA_PREVIEW_COUNT = 12;

/* ---------- Popularidad de cada producto del catálogo ---------- */
// pop: 100 = el más popular. Productos de la canasta: de 99,6 (1.º) a 79 (60.º).
function applyPopularity(catalog) {
  const byId = new Map(catalog.map((product) => [product.id, product]));
  catalog.forEach((product) => {
    product.pop = 30;
    product.basic = false;
    product.canastaRank = null;
    product.canastaLabel = null;
  });
  POPULAR_EXTRA_IDS.forEach((id) => {
    const product = byId.get(id);
    if (product) product.pop = 60;
  });

  CANASTA_BASICA.forEach((item, index) => {
    const rank = index + 1;
    const pop = 100 - rank * 0.35;
    const main = byId.get(item.id);
    if (!main) {
      console.warn(
        `Canasta: no existe en el catálogo ${item.id} (${item.label})`,
      );
      return;
    }
    main.pop = pop;
    main.basic = true;
    main.canastaRank = rank;
    main.canastaLabel = item.label;
    (item.alt || []).forEach((altId) => {
      const alt = byId.get(altId);
      if (alt && !alt.basic) {
        alt.pop = Math.max(alt.pop, pop - 8); // variante cercana: un poco menos popular
        alt.basic = true;
        alt.canastaLabel = item.label;
      }
    });
  });

  if (CANASTA_BASICA.length !== 60) {
    console.warn(
      `Canasta: tiene ${CANASTA_BASICA.length} productos y deberían ser 60`,
    );
  }
}

/* ---------- Búsqueda ---------- */
const SEARCH_STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "lo",
  "un",
  "una",
  "unos",
  "unas",
  "para",
  "con",
  "sin",
  "en",
  "y",
  "a",
  "al",
  "por",
]);

function searchTokens(text) {
  return normalizeProductName(text)
    .split(" ")
    .filter((token) => token && !SEARCH_STOPWORDS.has(token));
}

// "lentejas" ~ "lenteja", "tomates" ~ "tomate"
function wordForms(token) {
  const forms = [token];
  if (token.length > 3 && token.endsWith("s")) forms.push(token.slice(0, -1));
  if (token.length > 4 && token.endsWith("es")) forms.push(token.slice(0, -2));
  return forms;
}

function editDistanceWithin(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return false;
    previous = current;
  }
  return previous[b.length] <= maxDistance;
}

// Qué tan bien coincide una palabra escrita con las palabras de un producto (0 a 1)
function tokenScore(
  queryToken,
  tokenSet,
  allowShortPrefix,
  allowPrefix = true,
) {
  if (tokenSet.has(queryToken)) return 1;
  const queryForms = wordForms(queryToken);
  const minPrefix = allowShortPrefix ? 2 : 3;
  let best = 0;
  for (const token of tokenSet) {
    if (wordForms(token).some((form) => queryForms.includes(form))) {
      best = Math.max(best, 0.95); // singular / plural
    } else if (
      allowPrefix &&
      queryToken.length >= minPrefix &&
      token.startsWith(queryToken)
    ) {
      best = Math.max(best, 0.8); // la persona aún está escribiendo
    } else if (
      queryToken.length >= 5 &&
      token.length >= 5 &&
      editDistanceWithin(queryToken, token, queryToken.length >= 8 ? 2 : 1)
    ) {
      best = Math.max(best, 0.7); // errores de tipeo: "azucr", "espagetti"
    }
  }
  return best;
}

let productSearchIndex = null;
let productSearchIndexSource = null;

function getProductSearchIndex(catalog) {
  if (productSearchIndex && productSearchIndexSource === catalog)
    return productSearchIndex;
  productSearchIndexSource = catalog;
  productSearchIndex = catalog.map((product) => {
    const nameTokens = searchTokens(product.name);
    // Alias: otro nombre con el que se conoce el producto (ej. "mantequilla" = margarina).
    // Cuentan como si fueran parte del nombre.
    const aliasTokens = (product.aliases || []).flatMap((alias) =>
      searchTokens(alias),
    );
    const keywordTokens = new Set(
      (product.keywords || []).flatMap((keyword) => searchTokens(keyword)),
    );
    return {
      product,
      nameTokens,
      nameSet: new Set([...nameTokens, ...aliasTokens]),
      headSet: new Set([nameTokens[0], ...aliasTokens].filter(Boolean)),
      labelSet: new Set(searchTokens(product.canastaLabel || "")),
      keywordTokens,
    };
  });
  return productSearchIndex;
}

/**
 * Ordena los productos del catálogo para lo que escribió la persona.
 * Prioridad: 1) cuántas palabras coinciden (lo específico gana), 2) popularidad
 * (la canasta básica primero), 3) que la palabra buscada sea el "nombre principal" del
 * producto ("leche en polvo" antes que "chocolate con leche").
 * @returns {{product: object, score: number, coverage: number}[]}
 */
function rankProducts(query, { limit = 8, catalog = initialCatalogData } = {}) {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];
  const results = [];

  for (const entry of getProductSearchIndex(catalog)) {
    let sum = 0;
    let matched = 0;
    tokens.forEach((token, i) => {
      const isLast = i === tokens.length - 1;
      const inName = tokenScore(token, entry.nameSet, isLast);
      const inKeywords =
        tokenScore(token, entry.keywordTokens, isLast, false) * 0.85;
      const score = Math.max(inName, inKeywords);
      if (score >= 0.6) matched += 1;
      sum += score;
    });
    if (matched === 0) continue;
    if (tokens.length >= 2 && matched < Math.ceil(tokens.length / 2)) continue;

    const coverage = sum / tokens.length;
    const isHead =
      tokenScore(tokens[0], entry.headSet, tokens.length === 1) >= 0.8;
    // "Familia" de la canasta: las presas de pollo antes que la mortadela de pollo
    const inFamily =
      entry.labelSet.size > 0 &&
      tokens.every((token) => tokenScore(token, entry.labelSet, false) >= 0.9);
    const score =
      coverage * 100 +
      (entry.product.pop ?? 30) * 0.2 +
      (isHead ? 6 : 0) +
      (inFamily ? 8 : 0) -
      entry.nameTokens.length * 0.1;
    results.push({ product: entry.product, score, coverage });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ---------- Sugerencias para la lista ---------- */
function prettyProductName(name) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
}

// Sugerencias mientras se escribe (excluye lo que ya está en la lista)
function suggestProducts(text, { limit = 6, exclude = new Set() } = {}) {
  return rankProducts(text, { limit: limit + exclude.size + 2 })
    .filter((r) => !exclude.has(r.product.name))
    .slice(0, limit)
    .map((r) => ({
      value: prettyProductName(r.product.name),
      basic: Boolean(r.product.basic),
    }));
}

// Productos de la canasta para mostrar como accesos rápidos
function canastaSuggestions({ expanded = false, exclude = new Set() } = {}) {
  const items = CANASTA_BASICA.map((item) => ({
    value: item.label,
    group: item.group,
  })).filter((item) => !exclude.has(normalizeProductName(item.value)));
  return expanded ? items : items.slice(0, CANASTA_PREVIEW_COUNT);
}

if (typeof initialCatalogData !== "undefined")
  applyPopularity(initialCatalogData);
