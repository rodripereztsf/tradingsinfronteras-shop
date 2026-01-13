// api/admin-products.js
//
// Objetivo: devolver { products: [...] } leyendo desde Upstash Redis REST
// Soporta 2 esquemas comunes:
// 1) Un key "products" que contiene un JSON array
// 2) Un hash "products:<id>" por producto (y opcionalmente un set/list de ids)
//
// NOTA: No toca diseño. Solo estabiliza la API.

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function setCors(res) {
  // Si querés restringir, podés cambiar a tu dominio.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function envOk() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return Boolean(url && token);
}

async function upstash(cmdParts) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // cmdParts ejemplo: ["get","products"] o ["keys","products:*"]
  const path = cmdParts.map(encodeURIComponent).join("/");
  const url = `${base}/${path}`;

  const r = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!r.ok) {
    const err = new Error(`Upstash HTTP ${r.status}`);
    err.details = data;
    throw err;
  }

  if (data && data.error) {
    const err = new Error(`Upstash error: ${data.error}`);
    err.details = data;
    throw err;
  }

  return data;
}

function safeParseJson(val) {
  if (val == null) return null;
  if (typeof val !== "string") return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function normalizeProduct(p) {
  if (!p || typeof p !== "object") return null;

  // Normalización mínima sin romper tu estructura actual
  const out = { ...p };

  // Asegurar id
  if (!out.id) out.id = out.slug || out.sku || out.name;

  // Normalizar price si viene como string
  if (typeof out.price === "string") {
    const n = Number(out.price);
    if (!Number.isNaN(n)) out.price = n;
  }

  // Normalizar fields típicos para que el admin no “rompa”
  if (out.active == null && out.isActive != null) out.active = out.isActive;
  if (out.whatsapp == null && out.waLink != null) out.whatsapp = out.waLink;

  return out;
}

async function readFromKeyProductsJsonArray() {
  // GET products  -> value string JSON array
  const got = await upstash(["get", "products"]);
  const raw = got ? got.result : null;
  const parsed = safeParseJson(raw);

  if (Array.isArray(parsed)) {
    return parsed.map(normalizeProduct).filter(Boolean);
  }
  return null; // no está en este formato
}

async function readFromHashesProductsStar() {
  // KEYS products:*  -> ["products:abc", "products:def"]
  const keysRes = await upstash(["keys", "products:*"]);
  const keys = keysRes && keysRes.result;

  if (!Array.isArray(keys) || keys.length === 0) {
    return [];
  }

  // Leer cada hash
  const products = [];
  for (const key of keys) {
    // HGETALL products:<id> -> array [field, value, field, value] o object (depende)
    let h;
    try {
      h = await upstash(["hgetall", key]);
    } catch (e) {
      // Si un key está corrupto no tiramos todo
      console.error("[admin-products] hgetall failed for", key, e.details || e);
      continue;
    }

    const result = h ? h.result : null;
    let obj = null;

    if (result && typeof result === "object" && !Array.isArray(result)) {
      // ya es object
      obj = result;
    } else if (Array.isArray(result)) {
      // array plano [k,v,k,v]
      obj = {};
      for (let i = 0; i < result.length; i += 2) {
        obj[result[i]] = result[i + 1];
      }
    }

    if (!obj) continue;

    // Algunos campos se guardan JSON-stringificados (ej: instructivo, pdfMeta, etc.)
    for (const k of Object.keys(obj)) {
      const maybe = safeParseJson(obj[k]);
      if (maybe !== null && (typeof obj[k] === "string")) obj[k] = maybe;
    }

    // id desde key si falta
    if (!obj.id && typeof key === "string") {
      const parts = key.split(":");
      obj.id = parts.length > 1 ? parts.slice(1).join(":") : key;
    }

    const norm = normalizeProduct(obj);
    if (norm) products.push(norm);
  }

  return products;
}

export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method !== "GET") {
      return json(res, 405, { error: "Method not allowed" });
    }

    if (!envOk()) {
      console.error("[admin-products] Missing Upstash env vars");
      return json(res, 500, {
        error: "Missing UPSTASH env vars",
        missing: {
          UPSTASH_REDIS_REST_URL: !process.env.UPSTASH_REDIS_REST_URL,
          UPSTASH_REDIS_REST_TOKEN: !process.env.UPSTASH_REDIS_REST_TOKEN,
        },
      });
    }

    // 1) Intento formato key "products" JSON array
    let products = await readFromKeyProductsJsonArray();

    // 2) Si no existe, fallback a hashes products:*
    if (products === null) {
      products = await readFromHashesProductsStar();
    }

    // Orden estable si hay name o createdAt
    products.sort((a, b) => {
      const an = (a.name || "").toString().toLowerCase();
      const bn = (b.name || "").toString().toLowerCase();
      if (an && bn) return an.localeCompare(bn);
      return 0;
    });

    return json(res, 200, { products });
  } catch (err) {
    console.error("[admin-products] CRASH", err.details || err);
    return json(res, 500, {
      error: "FUNCTION_INVOCATION_FAILED",
      message: err && err.message ? err.message : "Unknown error",
      details: err && err.details ? err.details : undefined,
    });
  }
}
