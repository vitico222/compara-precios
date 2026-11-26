/* ========================================== */
/* RECEIPT-PARSE.JS - LECTURA ROBUSTA DE MONTOS */
/* ========================================== */
/*
  Por qué existe este archivo
  Cada impresora fiscal escribe los números a su manera:
    - Formato "ve": punto para los miles y coma para los decimales  -> 2.781,70
    - Formato "us": coma para los miles y punto para los decimales  -> 2,781.70
  Si la IA convierte los números por su cuenta, puede equivocarse con los ticket del
  segundo tipo (por ejemplo, leer "5,417" como 5,417 en vez de 5417), y todos los
  precios salen 1000 veces más baratos. Por eso la IA ahora copia los montos como TEXTO,
  tal como están impresos, y aquí se decide cómo leerlos.

  Cómo se decide
  1. Si algún monto trae decimales con punto ("90.44") y ninguno con coma, el ticket es "us";
     si trae decimales con coma ("1.201,50") y ninguno con punto, es "ve".
  2. Si no hay pistas claras, se prueban los dos formatos y gana el que hace cuadrar la
     aritmética (cantidad x precio = importe) y la suma de las líneas con el subtotal.
  3. Si sigue empatado, se usa el formato habitual del país.

  Cómo se verifica cada línea
  Una línea queda "verificada" cuando cantidad x precio unitario = importe de la línea.
  Las líneas que no cuadran se marcan y NO se comparten con la comunidad.
*/

const AMOUNT_TOLERANCE = { relative: 0.015, absolute: 0.05 };

// Países donde lo habitual es la coma decimal (1.234,56)
const DECIMAL_COMMA_COUNTRIES = [
  "VE",
  "CO",
  "AR",
  "CL",
  "ES",
  "UY",
  "EC",
  "BO",
  "PY",
];

const defaultAmountFormat = (country) =>
  DECIMAL_COMMA_COUNTRIES.includes(country) ? "ve" : "us";

// Rango en el que suele estar el precio MEDIANO de un producto de supermercado en cada moneda
// [mínimo, máximo]. Sirve para dos cosas: desempatar cuando todos los montos tienen la forma
// "5,417" y no hay otra pista, y avisar cuando los precios leídos son imposibles (por ejemplo
// 1.711 Bs en vez de 1.711.00 Bs, un error de escala de 1000). Ajusta estos valores si cambia la
// moneda (por ejemplo, tras una reconversión).
const PLAUSIBLE_UNIT_RANGE = {
  VES: [50, 2000000],
  COP: [500, 5000000],
  ARS: [100, 5000000],
  CLP: [300, 500000],
  MXN: [5, 5000],
  PEN: [0.5, 1000],
  USD: [0.3, 500],
  EUR: [0.3, 500],
};

function medianOf(values) {
  const sorted = values
    .filter((v) => v !== null && v > 0)
    .sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

const isPlausibleMedian = (median, currency) => {
  const range = PLAUSIBLE_UNIT_RANGE[currency];
  return (
    !range || median === null || (median >= range[0] && median <= range[1])
  );
};

// Convierte "1,201", "2.781,70" o "452.22" en número según el formato. Los números se dejan igual.
function parseAmountWith(value, format) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value ?? "").replace(/[^\d.,]/g, "");
  if (!text) return null;
  text =
    format === "us"
      ? text.replace(/,/g, "")
      : text.replace(/\./g, "").replace(",", ".");
  const number = parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

// Las cantidades ("0.19", "1,235", "3") nunca llevan separador de miles
function parseQuantityText(value) {
  if (typeof value === "number")
    return Number.isFinite(value) && value > 0 ? value : null;
  const text = String(value ?? "")
    .replace(/[^\d.,]/g, "")
    .replace(",", ".");
  const number = parseFloat(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

// Renglón de cálculo impreso aparte: "2x Bs 1.195,77", "0.67xBs 9.152,21", "3 X Bs 2.781,70"
const CALC_LINE = /(\d[\d.,]*)\s*[xX×]\s*(?:Bs\.?|US\$|\$)?\s*(\d[\d.,]*)/;

function parseCalcLine(text, format) {
  if (typeof text !== "string") return null;
  const match = text.match(CALC_LINE);
  if (!match) return null;
  const quantity = parseQuantityText(match[1]);
  const unitPrice = parseAmountWith(match[2], format);
  return quantity && unitPrice ? { quantity, unitPrice } : null;
}

function amountsAgree(quantity, unitPrice, lineTotal) {
  const tolerance = Math.max(
    AMOUNT_TOLERANCE.absolute,
    lineTotal * AMOUNT_TOLERANCE.relative,
  );
  return Math.abs(quantity * unitPrice - lineTotal) <= tolerance;
}

function detectAmountFormat(
  rawItems,
  rawSubtotal,
  rawTotal,
  country,
  currency,
) {
  const texts = [];
  rawItems.forEach((item) => {
    [
      item?.unit_price,
      item?.unitPrice,
      item?.line_total,
      item?.lineTotal,
      item?.price,
    ].forEach((v) => {
      if (typeof v === "string") texts.push(v);
    });
  });
  rawItems.forEach((item) => {
    [item?.calc_line_above, item?.calc_line_below].forEach((v) => {
      const match = typeof v === "string" ? v.match(CALC_LINE) : null;
      if (match) texts.push(match[2]);
    });
  });
  [rawSubtotal, rawTotal].forEach((v) => {
    if (typeof v === "string") texts.push(v);
  });
  if (texts.length === 0) return defaultAmountFormat(country); // todo llegó ya como número

  // 1) Pista directa: decimales de uno o dos dígitos
  let dotDecimals = 0;
  let commaDecimals = 0;
  texts.forEach((text) => {
    const clean = text.replace(/[^\d.,]/g, "");
    if (/\.\d{1,2}$/.test(clean)) dotDecimals += 1;
    if (/,\d{1,2}$/.test(clean)) commaDecimals += 1;
  });
  if (dotDecimals > 0 && commaDecimals === 0) return "us";
  if (commaDecimals > 0 && dotDecimals === 0) return "ve";

  // 2) Sin pista clara: gana el formato que hace cuadrar las cuentas
  const score = (format) => {
    let checked = 0;
    let agree = 0;
    let sum = 0;
    rawItems.forEach((item) => {
      const quantity = parseQuantityText(item?.quantity) || 1;
      const unit = parseAmountWith(
        item?.unit_price ?? item?.unitPrice ?? item?.price,
        format,
      );
      const total = parseAmountWith(
        item?.line_total ?? item?.lineTotal,
        format,
      );
      if (total !== null) sum += total;
      if (unit !== null && total !== null) {
        checked += 1;
        if (amountsAgree(quantity, unit, total)) agree += 1;
      }
    });
    let points = checked ? agree / checked : 0;
    const subtotal = parseAmountWith(rawSubtotal, format);
    if (subtotal && Math.abs(sum - subtotal) / subtotal <= 0.03) points += 1; // el subtotal decide
    return points;
  };
  const us = score("us");
  const ve = score("ve");
  if (us !== ve) return us > ve ? "us" : "ve";

  // 3) Empate: se descarta la lectura que da precios imposibles para esa moneda
  if (PLAUSIBLE_UNIT_RANGE[currency]) {
    const medianUnit = (format) =>
      medianOf(
        rawItems.map((item) =>
          parseAmountWith(
            item?.unit_price ?? item?.unitPrice ?? item?.price,
            format,
          ),
        ),
      );
    const usOk = isPlausibleMedian(medianUnit("us"), currency);
    const veOk = isPlausibleMedian(medianUnit("ve"), currency);
    if (usOk !== veOk) return usOk ? "us" : "ve";
  }
  return defaultAmountFormat(country);
}

/**
 * Ajusta una línea con lo que se leyó de cantidad, precio unitario e importe.
 * @returns { quantity, unitPrice, verified }  verified: true = cuadra, false = no cuadra,
 *          null = no hay dos montos para comprobarlo.
 */
function reconcileLine(
  quantityRead,
  unitPrice,
  lineTotal,
  candidates = [],
  borrowedFromNext = false,
) {
  const quantity = quantityRead && quantityRead > 0 ? quantityRead : 1;
  const hasUnit = unitPrice !== null && unitPrice > 0;
  const hasTotal = lineTotal !== null && lineTotal > 0;

  if (hasTotal) {
    if (hasUnit && amountsAgree(quantity, unitPrice, lineTotal))
      return { quantity, unitPrice, verified: true };

    // La IA pudo tomar el renglón "N x precio" del producto vecino. Se prueban el renglón de
    // arriba y el de abajo: el que multiplicado dé el importe de ESTE producto es el suyo.
    for (const candidate of candidates) {
      if (amountsAgree(candidate.quantity, candidate.unitPrice, lineTotal)) {
        return {
          quantity: candidate.quantity,
          unitPrice: candidate.unitPrice,
          verified: true,
        };
      }
    }
  }

  // Producto de una sola unidad (sin renglón "N x precio" encima) al que la IA le pegó el
  // renglón del producto SIGUIENTE: la cantidad es 1 y el precio es el importe.
  if (hasTotal && borrowedFromNext)
    return { quantity: 1, unitPrice: lineTotal, verified: null };

  if (hasUnit && hasTotal) {
    // La IA puso el importe de la línea como si fuera el precio de una unidad
    if (quantity > 1 && Math.abs(unitPrice - lineTotal) <= lineTotal * 0.01) {
      return { quantity, unitPrice: lineTotal / quantity, verified: true };
    }

    // La cantidad se leyó mal (por ejemplo, un "17" del nombre cortado "ATUN ... 17"):
    // se deduce de los montos, solo si sale un número entero
    const implied = lineTotal / unitPrice;
    const rounded = Math.round(implied);
    // Tolerancia estricta: una cantidad deducida debe ser un entero casi exacto (2,000; 3,001...)
    if (rounded >= 1 && Math.abs(implied - rounded) <= 0.03 + implied * 0.002) {
      return { quantity: rounded, unitPrice, verified: true };
    }
    return { quantity, unitPrice, verified: false };
  }
  if (hasTotal)
    return { quantity, unitPrice: lineTotal / quantity, verified: null };
  if (hasUnit) return { quantity, unitPrice, verified: null };
  return { quantity, unitPrice: null, verified: false };
}

/**
 * Convierte lo que devolvió la IA (montos como texto) en líneas con números fiables.
 * @returns { format, lines: [{ name, quantity, unitPrice, verified }], scaleSuspect, subtotal, total }
 */
function parseReceiptLines(rawItems, rawSubtotal, rawTotal, country, currency) {
  const format = detectAmountFormat(
    rawItems,
    rawSubtotal,
    rawTotal,
    country,
    currency,
  );
  const lines = rawItems.map((item) => {
    const name = String(item?.name ?? "")
      .trim()
      .slice(0, 120);
    const unit = parseAmountWith(
      item?.unit_price ?? item?.unitPrice ?? item?.price,
      format,
    );
    const total = parseAmountWith(item?.line_total ?? item?.lineTotal, format);
    const candidates = [
      parseCalcLine(item?.calc_line_above, format),
      parseCalcLine(item?.calc_line_below, format),
    ].filter(Boolean);
    // ¿Lo que la IA dio como cantidad y precio es, en realidad, el renglón de DEBAJO? Y el de arriba
    // no existe (null): entonces el producto era de una sola unidad.
    const quantityRead = parseQuantityText(item?.quantity);
    const below = parseCalcLine(item?.calc_line_below, format);
    const borrowedFromNext = Boolean(
      item?.calc_line_above === null &&
      below &&
      quantityRead &&
      unit &&
      Math.abs(below.quantity - quantityRead) < 1e-9 &&
      Math.abs(below.unitPrice - unit) / unit < 0.005,
    );
    return {
      name,
      lineTotal: total,
      ...reconcileLine(quantityRead, unit, total, candidates, borrowedFromNext),
    };
  });

  // Dos productos DISTINTOS con exactamente la misma cantidad, precio e importe (con cantidad
  // distinta de 1) casi siempre significan que a uno se le copió el renglón del otro.
  const repeated = new Map();
  lines.forEach((line, index) => {
    if (line.verified !== true || line.quantity === 1 || !line.lineTotal)
      return;
    const key = `${line.quantity}|${line.unitPrice.toFixed(2)}|${line.lineTotal.toFixed(2)}`;
    repeated.set(key, [...(repeated.get(key) || []), index]);
  });
  repeated.forEach((indexes) => {
    const names = new Set(
      indexes.map((i) =>
        lines[i].name.toLowerCase().replace(/\s+/g, " ").trim(),
      ),
    );
    if (indexes.length > 1 && names.size > 1)
      indexes.forEach((i) => (lines[i].verified = false));
  });
  // ¿Los precios leídos son imposibles para esta moneda? (típico error de escala de 1000)
  const scaleSuspect = !isPlausibleMedian(
    medianOf(lines.map((line) => line.unitPrice)),
    currency,
  );
  return {
    format,
    lines,
    scaleSuspect,
    subtotal: parseAmountWith(rawSubtotal, format),
    total: parseAmountWith(rawTotal, format),
  };
}
