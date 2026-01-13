// api/admin-products.js (Vercel Serverless - CommonJS)
// Devuelve { products: [...], meta: {...} } leyendo Upstash.
// Importante: NO usa export default (para evitar crash si no es Next.js).

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function getDebugFlag(req) {
  try {
    const u = new URL(req.url, "http://localhost");
    return u.searchParams.get("debug") === "1" || u.searchParams.get("debug") === "true";
  } catch {
    return false;
  }
}

function envStatus() {
  return {
    UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
  };
}

async function upstash(cmdParts) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const path = cmdParts.map(encodeURIComponent).join("/");
  const url = `${base}/${path}`;

  const r = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

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
  try { return JSON.parse(val); } catch { return null; }
}

function normalizeProduct(p) {
  if (!p || typeof p !== "object") return null;
  const out = { ...p };

  if (!out.id) out.id = out.slug || out.sku || out.name;

  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string") {
      const parsed = safeParseJson(out[k]);
      if (parsed !== null) out[k] = parsed;
    }
  }

  if (typeof out.price === "string") {
    const n = Number(out.price);
    if (!Number.isNaN(n)) out.price = n;
  }

  return out;
}

async function tryGetJsonArrayKey(key) {
  const got = await upstash(["get", key]);
  const parsed = safeParseJson(got ? got.result : null);
  if (Array.isArray(parsed)) return parsed.map(normalizeProduct).filter(Boolean);
  return null;
}

async function tryHashes(pattern) {
  const keysRes = await upstash(["keys", pattern]);
  const keys = keysRes ? keysRes.result : null;
  if (!Array.isArray(keys) || keys.length === 0) return null;

  const products = [];
  for (const key of keys.slice(0, 400)) {
    let h;
    try {
      h = await upstash(["hgetall", key]);
    } catch (e) {
      console.error("[admin-products] hgetall fail", key, e.details || e);
      continue;
    }

    const result = h ? h.result : null;
    let obj = null;

    if (result && typeof result === "object" && !Array.isArray(result)) {
      obj = result;
    } else if (Array.isArray(result)) {
      obj = {};
      for (let i = 0; i < result.length; i += 2) obj[result[i]] = result[i + 1];
    }

    if (!obj) continue;

    if (!obj.id) {
      const parts = String(key).split(":");
      obj.id = parts.length > 1 ? parts.slice(1).join(":") : key;
    }

    const norm = normalizeProduct(obj);
    if (norm) products.push(norm);
  }

  return products.length ? products : null;
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const debug = getDebugFlag(req);
  const env = envStatus();

  try {
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      // Devuelvo 200 para que el panel no explote y puedas ver el motivo
      return sendJson(res, 200, {
        products: [],
        meta: { source: "none", error: true, message: "Missing Upstash env vars", env },
      });
    }

    if (debug) {
      const patterns = ["*products*", "products:*", "product:*", "shop:*", "store:*", "tsf*"];
      const sample = {};

      for (const pat of patterns) {
        try {
          const r = await upstash(["keys", pat]);
          sample[pat] = Array.isArray(r.result) ? r.result.slice(0, 50) : [];
        } catch (e) {
          sample[pat] = { error: e.message, details: e.details || null };
        }
      }

      return sendJson(res, 200, { products: [], meta: { debug: true, env }, keys_sample: sample });
    }

    // 1) Array JSON en una key
    const jsonKeys = ["products", "shop:products", "store:products", "tsfshop:products", "products:list"];
    for (const k of jsonKeys) {
      const arr = await tryGetJsonArrayKey(k);
      if (arr) return sendJson(res, 200, { products: arr, meta: { source: `get:${k}` } });
    }

    // 2) Hashes por patrón
    const patterns = ["products:*", "product:*", "shop:products:*", "store:products:*", "tsfshop:products:*"];
    for (const pat of patterns) {
      const arr = await tryHashes(pat);
      if (arr) return sendJson(res, 200, { products: arr, meta: { source: `hashes:${pat}` } });
    }

    return sendJson(res, 200, { products: [], meta: { source: "none" } });
  } catch (err) {
    console.error("[admin-products] CRASH", err.details || err);
    // Devuelvo 200 con info para que el panel no muestre "Error al cargar" por un 500 crudo
    return sendJson(res, 200, {
      products: [],
      meta: {
        error: true,
        message: err && err.message ? err.message : "Unknown error",
        details: err && err.details ? err.details : null,
      },
    });
  }
};
