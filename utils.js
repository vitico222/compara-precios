/* ========================================== */
/* UTILS.JS - CAPA DE PREPROCESAMIENTO Y LIMPIEZA */
/* ========================================== */

// Abreviaturas frecuentes en los tickets (agrega las que veas en tus recibos)
const RECEIPT_ABBREVIATIONS = {
  refin: "refinada",
  precoc: "precocida",
  espag: "espagueti",
  deterg: "detergente",
  mant: "mantequilla",
  marg: "margarina",
};

// Palabras que aparecen en los tickets pero no describen el producto
const RECEIPT_NOISE_WORDS = /\b(iva|exento|exenta|impuesto)\b/g;

/**
 * Convierte una cantidad y su unidad a la forma estándar del catálogo.
 * Pesos: g (si es menor a 1000) o kg. Volúmenes: ml (si es menor a 1000) o l.
 * @param {number} baseAmount - Cantidad ya expresada en g o ml
 * @param {"g"|"ml"} baseUnit
 */
function formatMeasure(baseAmount, baseUnit) {
  if (baseAmount >= 1000) {
    const big = Number((baseAmount / 1000).toFixed(3));
    return `${big}${baseUnit === "g" ? "kg" : "l"}`;
  }
  return `${Number(baseAmount.toFixed(3))}${baseUnit}`;
}

/**
 * Limpia y normaliza el nombre en bruto de un producto extraído de un recibo.
 * @param {string} rawName - Nombre original (ej: "*AZUCAR REFIN. 1000G / IVA*")
 * @returns {string} - Nombre limpio y estandarizado (ej: "azucar refinada 1kg")
 */
function normalizeProductName(rawName) {
  if (!rawName) return "";

  let text = String(rawName)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos y diacríticos
    .replace(/#/g, " ")
    .replace(/(\d)[.,](\d)/g, "$1#$2") // Proteger decimales: 1,5 y 1.5 -> 1#5
    .replace(/[^a-z0-9#\s]/g, " ") // Caracteres especiales -> espacio
    .replace(/#/g, ".") // Restaurar el punto decimal
    .replace(/\b\d{6,}\b/g, " ") // Códigos de barras o de artículo
    .replace(/\bx\s*(\d+)\b/g, "x$1"); // "x 6" -> "x6" (paquetes)

  // Expandir abreviaturas y quitar ruido del ticket
  text = text
    .replace(/\b[a-z]+\b/g, (word) => RECEIPT_ABBREVIATIONS[word] || word)
    .replace(RECEIPT_NOISE_WORDS, " ");

  // Unificar medidas: "1 Litro", "1000g", "0,5 L", "500 GRS" -> 1l, 1kg, 500ml, 500g
  text = text
    .replace(/(\d+(?:\.\d+)?)\s*(?:kilogramos?|kilos?|kgs?)\b/g, (_, n) =>
      formatMeasure(parseFloat(n) * 1000, "g"),
    )
    .replace(/(\d+(?:\.\d+)?)\s*(?:mililitros?|mls?|cc)\b/g, (_, n) =>
      formatMeasure(parseFloat(n), "ml"),
    )
    .replace(/(\d+(?:\.\d+)?)\s*(?:gramos?|grs?|gr|g)\b/g, (_, n) =>
      formatMeasure(parseFloat(n), "g"),
    )
    .replace(/(\d+(?:\.\d+)?)\s*(?:litros?|lts?|lt|l)\b/g, (_, n) =>
      formatMeasure(parseFloat(n) * 1000, "ml"),
    );

  return text.replace(/\s+/g, " ").trim();
}

// Ejemplos de transformaciones esperadas:
// "*AZUCAR REFIN. 1000G / IVA*" -> "azucar refinada 1kg"
// "*HARINA PRECOC. 1000G*"      -> "harina precocida 1kg"
// "CAFÉ MOLIDO 500GRS."         -> "cafe molido 500g"
// "Leche  Entera  1 Litro"      -> "leche entera 1l"
// "Refresco Cola 1,5 L"         -> "refresco cola 1.5l"
// "Aceite 0,5L"                 -> "aceite 500ml"
// "Servilletas x 100"           -> "servilletas x100"
