/* ========================================== */
/* CLOUDFLARE WORKER - ANALIZAR RECIBO        */
/* ========================================== */
// Pega este código en: Cloudflare → Workers & Pages → tu Worker → Edit code.
//
// Variables que debes crear en Settings → Variables and Secrets:
//   GEMINI_API_KEY        (tipo Secret)  tu clave de Gemini
//   ALLOWED_ORIGINS       (tipo Text)    webs autorizadas, separadas por comas. Ej:
//                         https://TU-SITIO.netlify.app,http://localhost:8888
// Opcionales (tipo Text):
//   GEMINI_MODEL          por defecto "gemini-3.8-flash"
//   GEMINI_THINKING_LEVEL por defecto "low" (también: "minimal", "medium", "high")
//   GEMINI_API_REVISION   si se define, se envía como cabecera Api-Revision

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BASE64_LENGTH = 6 * 1024 * 1024; // ~4,5 MB de imagen real
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const GEMINI_TIMEOUT_MS = 55000;

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
  if (Array.isArray(parts)) return parts.map((p) => p.text || "").join("");
  return "";
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const originAllowed = allowedOrigins.includes(origin);

    const reply = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          ...(originAllowed ? corsHeaders(origin) : {}),
        },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: originAllowed ? corsHeaders(origin) : {},
      });
    }
    if (request.method !== "POST") {
      return reply(405, { error: "Método no permitido." });
    }
    if (!originAllowed) {
      // Este mensaje no contiene datos sensibles; se envía con CORS para que la app
      // pueda mostrarlo y se vea exactamente qué dirección falta en ALLOWED_ORIGINS.
      return new Response(
        JSON.stringify({
          error: `Origen no permitido (${origin || "desconocido"}). Añádelo a ALLOWED_ORIGINS en Cloudflare y vuelve a desplegar.`,
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...(origin ? corsHeaders(origin) : {}),
          },
        },
      );
    }

    // Quita espacios, saltos de línea y comillas que se cuelan al pegar la clave
    const apiKey = (env.GEMINI_API_KEY || "")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!apiKey) {
      return reply(500, {
        error: "El servidor no tiene configurada la clave de Gemini.",
      });
    }

    // Los datos llegan así: el cuerpo es el base64 de la imagen (text/plain) y el
    // resto va en la URL. No se parsea JSON para gastar muy poca CPU.
    const url = new URL(request.url);
    const mimeType = url.searchParams.get("mime") || "";
    const currency = url.searchParams.get("currency") || "";
    const country = url.searchParams.get("country") || "";
    const imageBase64 = (await request.text()).trim();

    if (!imageBase64) {
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
    // Esta comprobación también impide colar texto extra dentro del JSON
    if (!BASE64_PATTERN.test(imageBase64)) {
      return reply(400, { error: "La imagen no tiene un formato válido." });
    }
    const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
    const safeCountry = /^[A-Z]{2}$/.test(country) ? country : "XX";

    const model = env.GEMINI_MODEL || "gemini-3.8-flash";
    const thinkingLevel = env.GEMINI_THINKING_LEVEL || "low";

    // Se arma el JSON como texto para no volver a procesar la imagen completa
    const body =
      '{"model":' +
      JSON.stringify(model) +
      ',"input":[{"type":"text","text":' +
      JSON.stringify(buildPrompt(safeCurrency, safeCountry)) +
      '},{"type":"image","data":"' +
      imageBase64 +
      '","mime_type":' +
      JSON.stringify(mimeType) +
      '}],"generation_config":{"thinking_level":' +
      JSON.stringify(thinkingLevel) +
      ',"max_output_tokens":8192}}';

    const headers = {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    };
    if (env.GEMINI_API_REVISION)
      headers["Api-Revision"] = env.GEMINI_API_REVISION;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    const startedAt = Date.now();

    let response;
    let raw;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      raw = await response.text();
    } catch (error) {
      if (error.name === "AbortError") {
        console.error(`Gemini no respondió en ${GEMINI_TIMEOUT_MS} ms`);
        return reply(504, {
          error: "El análisis tardó demasiado. Inténtalo de nuevo.",
        });
      }
      console.error("No se pudo contactar con Gemini:", error.message);
      return reply(502, {
        error: "No se pudo contactar con el servicio de IA.",
      });
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
      if (
        response.status === 401 ||
        response.status === 403 ||
        reason === "API_KEY_INVALID"
      ) {
        return reply(502, {
          error: `Google rechazó la clave de Gemini (${code}). Revisa GEMINI_API_KEY en Cloudflare.`,
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
  },
};
