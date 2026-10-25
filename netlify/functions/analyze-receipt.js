/* ========================================== */
/* NETLIFY FUNCTION - ANALIZAR RECIBO         */
/* Ruta: netlify/functions/analyze-receipt.js */
/* ========================================== */
// La clave vive SOLO aquí, en la variable de entorno GEMINI_API_KEY de Netlify.
// Variables opcionales:
//   GEMINI_MODEL         (por defecto "gemini-3.8-flash")
//   GEMINI_API_REVISION  (si se define, se envía como cabecera Api-Revision)

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
// Netlify limita el cuerpo de la petición a ~6 MB; el base64 pesa ~33 % más
const MAX_BASE64_LENGTH = 4.5 * 1024 * 1024;

const reply = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// El prompt vive en el servidor: así nadie puede usar tu clave para otras tareas
function buildPrompt(currency, country) {
  return `Analiza esta imagen de un recibo de supermercado (país: ${country}, moneda local: ${currency}).
Devuelve SOLO un objeto JSON válido, sin Markdown ni explicaciones, con exactamente estas claves:
- "establishment": nombre del comercio (string).
- "date": fecha de la compra en formato YYYY-MM-DD (string), o null si no se lee.
- "items": array de productos. Cada uno con: "name" (string, como aparece en el recibo, incluyendo peso o volumen si aparece), "quantity" (número, 1 si no se indica), "unit_price" (precio de UNA unidad o de un kilo, número) y "line_total" (importe total de esa línea, número).
- "total": total pagado (número).
Reglas: usa punto como separador decimal y números sin símbolo de moneda ni separador de miles. Ignora líneas de IVA, impuestos, subtotales, descuentos globales, vuelto y métodos de pago. Si un dato no se puede leer usa null. No inventes productos.`;
}

// Tolera pequeñas variaciones en la forma de la respuesta de la API
function extractText(data) {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text;

  const steps = Array.isArray(data.steps) ? data.steps : [];
  for (const step of steps) {
    if (step.type === "model_output" && Array.isArray(step.content)) {
      const text = step.content
        .filter((part) => typeof part.text === "string")
        .map((part) => part.text)
        .join("");
      if (text) return text;
    }
  }

  const parts = data.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((p) => p.text || "").join("");
  }
  return "";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Método no permitido." });
  }

  // Quita espacios, saltos de línea y comillas que se cuelan al pegar la clave
  const apiKey = (process.env.GEMINI_API_KEY || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!apiKey) {
    return reply(500, {
      error: "El servidor no tiene configurada la clave de Gemini.",
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Petición no válida." });
  }

  const { imageBase64, mimeType, currency, country } = body;
  if (typeof imageBase64 !== "string" || !imageBase64) {
    return reply(400, { error: "Falta la imagen del recibo." });
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return reply(413, {
      error: "La imagen es demasiado grande. Prueba con otra foto.",
    });
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    return reply(400, {
      error: "Formato de imagen no permitido. Usa JPG, PNG o WebP.",
    });
  }
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  const safeCountry = /^[A-Z]{2}$/.test(country) ? country : "XX";

  const headers = {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };
  if (process.env.GEMINI_API_REVISION) {
    headers["Api-Revision"] = process.env.GEMINI_API_REVISION;
  }

  // Netlify corta las funciones a los 10 s (plan gratuito). Cortamos un poco antes
  // para devolver un mensaje claro en lugar de un 504 genérico.
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || 9000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  let response;
  let raw;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        input: [
          { type: "text", text: buildPrompt(safeCurrency, safeCountry) },
          { type: "image", data: imageBase64, mime_type: mimeType },
        ],
        // Menos razonamiento = respuesta mucho más rápida (leer un ticket es sobre todo OCR)
        generation_config: {
          thinking_level: process.env.GEMINI_THINKING_LEVEL || "low",
          max_output_tokens: 8192,
        },
      }),
    });
    raw = await response.text();
  } catch (error) {
    if (error.name === "AbortError") {
      console.error(`Gemini no respondió en ${timeoutMs} ms`);
      return reply(504, {
        error:
          "El análisis tardó demasiado. Inténtalo de nuevo; si se repite, prueba con una foto más nítida.",
      });
    }
    console.error("No se pudo contactar con Gemini:", error.message);
    return reply(502, { error: "No se pudo contactar con el servicio de IA." });
  } finally {
    clearTimeout(timer);
  }
  console.log(
    `Gemini respondió ${response.status} en ${Date.now() - startedAt} ms`,
  );

  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    /* respuesta no JSON */
  }

  if (!response.ok) {
    console.error("Error de Gemini:", response.status, raw.slice(0, 500));
    if (response.status === 429) {
      return reply(429, {
        error:
          "Hay demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.",
      });
    }
    const detail = data?.error?.message || "petición fallida";
    const reason =
      data?.error?.details?.find((d) => d.reason)?.reason ||
      data?.error?.status ||
      "";
    const code = reason
      ? `${response.status} · ${reason}`
      : `${response.status}`;
    if (response.status === 401 || response.status === 403) {
      return reply(502, {
        error: `Google rechazó la clave de Gemini (${code}). Revisa GEMINI_API_KEY en Netlify y vuelve a desplegar.`,
      });
    }
    return reply(502, {
      error: `Error del servicio de IA (${code}): ${detail}`,
    });
  }

  const text = extractText(data);
  if (!text) {
    console.error("Respuesta sin texto:", raw.slice(0, 500));
    return reply(502, {
      error: "La IA no devolvió ninguna respuesta de texto.",
    });
  }
  return reply(200, { text });
};
