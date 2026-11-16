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

// Precio típico mínimo de un producto de supermercado en cada moneda. Solo sirve para desempatar
// cuando todos los montos tienen la forma "5,417" y no hay otra pista: si leerlos de una manera
// da precios imposibles de tan bajos, esa lectura se descarta. Ajusta estos valores si cambia
// la moneda (por ejemplo, tras una reconversión).
const PLAUSIBLE_MEDIAN_MIN = { VES: 50, COP: 500, ARS: 100, CLP: 300 };

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

  // 3) Empate: se descarta la lectura que da precios imposiblemente bajos
  const minimum = PLAUSIBLE_MEDIAN_MIN[currency];
  if (minimum) {
    const medianUnit = (format) => {
      const units = rawItems
        .map((item) =>
          parseAmountWith(
            item?.unit_price ?? item?.unitPrice ?? item?.price,
            format,
          ),
        )
        .filter((value) => value !== null && value > 0)
        .sort((a, b) => a - b);
      return units.length ? units[Math.floor(units.length / 2)] : null;
    };
    const usMedian = medianUnit("us");
    const veMedian = medianUnit("ve");
    const usOk = usMedian !== null && usMedian >= minimum;
    const veOk = veMedian !== null && veMedian >= minimum;
    if (usOk !== veOk) return usOk ? "us" : "ve";
  }
  return defaultAmountFormat(country);
}

/**
 * Ajusta una línea con lo que se leyó de cantidad, precio unitario e importe.
 * @returns { quantity, unitPrice, verified }  verified: true = cuadra, false = no cuadra,
 *          null = no hay dos montos para comprobarlo.
 */
function reconcileLine(quantityRead, unitPrice, lineTotal) {
  const quantity = quantityRead && quantityRead > 0 ? quantityRead : 1;
  const hasUnit = unitPrice !== null && unitPrice > 0;
  const hasTotal = lineTotal !== null && lineTotal > 0;

  if (hasUnit && hasTotal) {
    if (amountsAgree(quantity, unitPrice, lineTotal))
      return { quantity, unitPrice, verified: true };

    // La IA puso el importe de la línea como si fuera el precio de una unidad
    if (quantity > 1 && Math.abs(unitPrice - lineTotal) <= lineTotal * 0.01) {
      return { quantity, unitPrice: lineTotal / quantity, verified: true };
    }

    // La cantidad se leyó mal (por ejemplo, un "17" del nombre cortado "ATUN ... 17"):
    // se deduce de los montos, solo si sale un número entero
    const implied = lineTotal / unitPrice;
    const rounded = Math.round(implied);
    if (rounded >= 1 && Math.abs(implied - rounded) <= implied * 0.02) {
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
 * @returns { format, lines: [{ name, quantity, unitPrice, verified }], subtotal, total }
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
    return {
      name,
      ...reconcileLine(parseQuantityText(item?.quantity), unit, total),
    };
  });
  return {
    format,
    lines,
    subtotal: parseAmountWith(rawSubtotal, format),
    total: parseAmountWith(rawTotal, format),
  };
}
