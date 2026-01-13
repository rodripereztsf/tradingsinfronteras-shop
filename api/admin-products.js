// api/admin-products.js
// Lee productos desde Upstash Redis REST de forma robusta (autodetección de esquema/prefijo).
// Devuelve SIEMPRE: { products: [...], meta: {...} }

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function envOk() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
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

  // parse campos típicos que a veces llegan como string JSON
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

async function tryGetJsonArrayFromKey(key) {
  const got = await upstash(["get", key]);
  const raw = got ? got.result : null;
  const parsed = safeParseJson(raw);
  if (Array.isArray(parsed)) return parsed.map(normalizeProduct).filter(Boolean);
  return null;
}

async function tryLRangeJsonArrayFromList(key) {
  // Lista donde cada item es JSON de producto
  const got = await upstash(["lrange", key, "0", "-1"]);
  const arr = got ? got.result : null;
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const products = [];
  for (const item of arr) {
    const p = safeParseJson(item);
    const norm = normalizeProduct(p);
    if (norm) products.push(norm);
  }
  return products.length ? products : null;
}

async function trySetIdsThenHashes(setKey, hashPrefix) {
  const idsRes = await upstash(["smembers", setKey]);
  const ids = idsRes ? idsRes.result : null;
  if (!Array.isArray(ids) || ids.length === 0) return null;

  const products = [];
  for (const id of ids) {
    const key = `${hashPrefix}${id}`;
    const h = await upstash(["hgetall", key]);
    const result = h ? h.result : null;

    let obj = null;
    if (result && typeof result === "object" && !Array.isArray(result)) {
      obj = result;
    } else if (Array.isArray(result)) {
      obj = {};
      for (let i = 0; i < result.length; i += 2) obj[result[i]] = result[i + 1];
    }

    if (obj) {
      if (!obj.id) obj.id = id;
      const norm = normalizeProduct(obj);
      if (norm) products.push(norm);
    }
  }
  return products.length ? products : null;
}

async function tryHashesByKeysMatch(patterns, limitKeys = 400) {
  //
