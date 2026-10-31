/* ========================================== */
/* CLOUDFLARE WORKER - ANALIZAR RECIBO        */
/* ========================================== */
// Pega este código en: Cloudflare → Workers & Pages → tu Worker → Edit code.
//
// Variables en Settings → Variables and Secrets:
//   GEMINI_API_KEY          (Secret)  tu clave de Gemini
//   ALLOWED_ORIGINS         (Text)    webs autorizadas, separadas por comas. Ej:
//                           https://TU-SITIO.netlify.app,http://localhost:8888
// Opcionales (Text):
//   GEMINI_MODEL            modelo principal. Por defecto "gemini-3.8-flash"
//   GEMINI_FALLBACK_MODEL   modelo de respaldo si el principal está saturado.
//                           Por defecto "gemini-3.5-flash-lite". Usa "none" para desactivarlo
//   GEMINI_THINKING_LEVEL   por defecto "low" (también "minimal", "medium", "high")
//   GEMINI_API_REVISION     si se define, se envía como cabecera Api-Revision

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BASE64_LENGTH = 6 * 1024 * 1024; // ~4,5 MB de imagen real
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const TOTAL_BUDGET_MS = 55000; // tiempo máximo total (la app espera hasta 60 s)
const ATTEMPT_TIMEOUT_MS = 25000; // tiempo máximo de cada intento
const RETRY_DELAY_MS = 2000; // pausa antes de reintentar
const RETRYABLE_STATUS = [429, 500, 502, 503, 504];

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Se arma el JSON como texto para no volver a procesar la imagen completa
function buildRequestBody({
  model,
  thinkingLevel,
  prompt,
  mimeType,
  imageBase64,
}) {
  const generationConfig = thinkingLevel
    ? '{"thinking_level":' +
      JSON.stringify(thinkingLevel) +
      ',"max_output_tokens":8192}'
    : '{"max_output_tokens":8192}';
  return (
    '{"model":' +
    JSON.stringify(model) +
    ',"input":[{"type":"text","text":' +
    JSON.stringify(prompt) +
    '},{"type":"image","data":"' +
    imageBase64 +
    '","mime_type":' +
    JSON.stringify(mimeType) +
    '}],"generation_config":' +
    generationConfig +
    "}"
  );
}

async function callGemini(body, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      /* respuesta no JSON */
    }
    return {
      ok: response.ok,
      status: response.status,
      raw,
      data,
      timedOut: false,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      return { ok: false, status: 0, raw: "", data: null, timedOut: true };
    }
    return {
      ok: false,
      status: 0,
      raw: String(error.message),
      data: null,
      networkError: true,
    };
  } finally {
    clearTimeout(timer);
  }
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

    // El cuerpo es el base64 de la imagen (text/plain); el resto va en la URL.
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
    const prompt = buildPrompt(safeCurrency, safeCountry);

    const headers = {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    };
    if (env.GEMINI_API_REVISION)
      headers["Api-Revision"] = env.GEMINI_API_REVISION;

    // Plan de intentos: modelo principal, reintento tras una pausa, y modelo de respaldo
    const primaryModel = env.GEMINI_MODEL || "gemini-3.8-flash";
    const fallbackModel =
      env.GEMINI_FALLBACK_MODEL === undefined
        ? "gemini-3.5-flash-lite"
        : env.GEMINI_FALLBACK_MODEL;
    // "none" desactiva thinking_level (modelos como gemini-2.5-flash no lo admiten)
    const thinkingLevel =
      env.GEMINI_THINKING_LEVEL === "none"
        ? null
        : env.GEMINI_THINKING_LEVEL || "low";

    // Un 503 de saturación responde en 1-2 s, así que reintentar es barato.
    // El modelo de respaldo no recibe thinking_level: no todos lo admiten.
    const hasFallback =
      fallbackModel &&
      fallbackModel !== "none" &&
      fallbackModel !== primaryModel;
    const primary = (delayMs) => ({
      model: primaryModel,
      thinkingLevel,
      delayMs,
    });
    const backup = (delayMs) => ({
      model: fallbackModel,
      thinkingLevel: null,
      delayMs,
    });

    const attempts = [primary(0), primary(RETRY_DELAY_MS)];
    if (hasFallback) attempts.push(backup(500));
    attempts.push(primary(4000));
    if (hasFallback) attempts.push(backup(2000));

    const startedAt = Date.now();
    let success = null;
    let firstFailure = null;

    for (const attempt of attempts) {
      if (attempt.delayMs) await sleep(attempt.delayMs);
      const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (remaining < 5000) break;

      const attemptStart = Date.now();
      const result = await callGemini(
        buildRequestBody({
          model: attempt.model,
          thinkingLevel: attempt.thinkingLevel,
          prompt,
          mimeType,
          imageBase64,
        }),
        headers,
        Math.min(ATTEMPT_TIMEOUT_MS, remaining),
      );
      console.log(
        `Intento con ${attempt.model}: ${result.timedOut ? "tiempo agotado" : result.status} en ${Date.now() - attemptStart} ms`,
      );

      if (result.ok) {
        success = { ...result, model: attempt.model };
        break;
      }
      if (!firstFailure) firstFailure = result;
      if (result.raw) console.error("Detalle:", result.raw.slice(0, 400));

      // Errores como 400, 401 o 403 no se arreglan reintentando
      const retryable =
        result.timedOut ||
        result.networkError ||
        RETRYABLE_STATUS.includes(result.status);
      if (!retryable && attempt.model === primaryModel) break;
    }

    if (!success) {
      const failure = firstFailure || { timedOut: true };
      if (failure.timedOut) {
        return reply(504, {
          error: "El análisis tardó demasiado. Inténtalo de nuevo.",
        });
      }
      if (failure.networkError) {
        return reply(502, {
          error: "No se pudo contactar con el servicio de IA.",
        });
      }
      const detail = failure.data?.error?.message || "petición fallida";
      const reason =
        failure.data?.error?.details?.find((d) => d.reason)?.reason ||
        failure.data?.error?.status ||
        "";
      const code = reason
        ? `${failure.status} · ${reason}`
        : `${failure.status}`;

      if (
        failure.status === 401 ||
        failure.status === 403 ||
        reason === "API_KEY_INVALID"
      ) {
        return reply(502, {
          error: `Google rechazó la clave de Gemini (${code}). Revisa GEMINI_API_KEY en Cloudflare.`,
        });
      }
      if (failure.status === 503) {
        return reply(503, {
          error:
            "Gemini tiene mucha demanda en este momento. Inténtalo de nuevo en unos minutos.",
        });
      }
      if (failure.status === 429) {
        return reply(429, {
          error:
            "Hay demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.",
        });
      }
      return reply(502, {
        error: `Error del servicio de IA (${code}): ${detail}`,
      });
    }

    const text = extractText(success.data);
    if (!text) {
      console.error("Respuesta sin texto:", success.raw.slice(0, 500));
      return reply(502, {
        error: "La IA no devolvió ninguna respuesta de texto.",
      });
    }
    console.log(
      `Análisis correcto con ${success.model} en ${Date.now() - startedAt} ms`,
    );
    return reply(200, { text });
  },
};
