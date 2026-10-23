/* ========================================== */
/* UTILS.JS - CAPA DE PREPROCESAMIENTO Y LIMPIEZA */
/* ========================================== */

/**
 * Limpia y normaliza el nombre en bruto de un producto extraído de un recibo.
 * @param {string} rawName - Nombre original del producto (ej: "*AZUCAR REFIN. 1000G / IVA*")
 * @returns {string} - Nombre limpio y estandarizado (ej: "azucar refinada 1kg")
 */
function normalizeProductName(rawName) {
  if (!rawName) return "";

  return rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos y diacríticos
    .replace(/[^a-z0-9\s]/g, " ") // Reemplazar caracteres especiales por espacios
    .replace(/\b1000\s?g\b/g, "1kg") // Estandarizar 1000g o 1000 g a 1kg
    .replace(/\b1000\s?ml\b/g, "1l") // Estandarizar 1000ml o 1000 ml a 1l
    .replace(/\bgrs?\b/g, "g") // Estandarizar gr o grs a g
    .replace(/\bkilogramos?\b/g, "kg") // Estandarizar kilogramos a kg
    .replace(/\blitros?\b/g, "l") // Estandarizar litros a l
    .replace(/\s+/g, " ") // Reducir espacios múltiples a uno solo
    .trim(); // Eliminar espacios al inicio y final
}

// Ejemplo de transformaciones esperadas:
// "*HARINA PRECOC. 1000G*" -> "harina precoc 1kg"
// "CAFÉ MOLIDO 500GRS."    -> "cafe molido 500g"
// "Leche  Entera  1 Litro" -> "leche entera 1 l"
