// api/admin-products.js
// CRUD de productos en Upstash Redis (REST API)
// - GET    -> { products: [...] }
// - POST   -> upsert (crear/editar)
// - DELETE -> eliminar por id
//
// Requiere env vars en Vercel:
// UPSTASH_REDIS_REST_URL
// UPSTASH_REDIS_REST_TOKEN
//
// Opcional:
// PRODUCTS_KEY (si no, usa tsf_shop_products_v1)

export const config = {
  api: { bodyParser: true },
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

const PRODUCTS_KEY = (process.env.PRODUCTS_KEY || "tsf_shop_products_v1").trim();

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

async function redisFetch(command, args = []) {
  const base = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

  if (!base || !token) {
    throw new Error(
      "Faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN en Vercel env."
    );
  }

  const url = `${base}/${command}/${args.map(encodeURIComponent).join("/")}`;
  const r = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await r.text();
  const data = safeJsonParse(text, { raw: text });

  if (!r.ok) {
    const msg = data?.error || data?.message || `Upstash error (${r.status})`;
    throw new Error(msg);
  }

  return data;
}

async function redisGetJson(key) {
  const data = await redisFetch("get", [key]);
  // Upstash REST: { result: "string" } o { result: null }
  const raw = data?.result ?? null;
  if (!raw) return [];
  const parsed = safeJsonParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function redisSetJson(key, value) {
  const json = JSON.stringify(value);
  await redisFetch("set", [key, json]);
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function makeIdFromName(name) {
  const base = slugify(name) || "producto";
  const rand = Math.random().toString(16).slice(2, 8);
  return `${base}-${Date.now().toString(16)}${rand}`;
}

function normalizeProduct(p) {
  const price = Number(p?.price_cents ?? 0);
  const out = {
    id: String(p?.id || "").trim() || makeIdFromName(p?.name),
    name: String(p?.name || "").trim(),
    type: String(p?.type || "other").trim(),
    short_description: String(p?.short_description || "").trim(),
    price_cents: Number.isFinite(price) ? Math.max(0, Math.round(price)) : 0,
    currency: String(p?.currency || "USD").trim(),
    image_url: String(p?.image_url || "").trim(),

    is_active: Boolean(p?.is_active ?? true),
    is_featured: p?.is_featured === false ? false : true,

    delivery_type: String(p?.delivery_type || (p?.delivery_value ? "drive_link" : "none")).trim(),
    delivery_value: String(p?.delivery_value || "").trim(),

    email_subject: String(p?.email_subject || "").trim(),
    email_body: String(p?.email_body || "").trim(),
    pdf_url: String(p?.pdf_url || "").trim(),

    // NUEVO (para botón WhatsApp por producto)
    walink_url: String(p?.walink_url || "").trim(),

    updated_at: nowIso(),
    created_at: String(p?.created_at || "").trim() || nowIso(),
  };

  // mínimos obligatorios
  if (!out.name) throw new Error("Nombre es obligatorio");
  if (!out.price_cents) throw new Error("Precio (USD) es obligatorio");

  return out;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method === "GET") {
      const products = await redisGetJson(PRODUCTS_KEY);
      return res.status(200).json({ products });
    }

    if (req.method === "POST") {
      const incoming = req.body || {};
      const products = await redisGetJson(PRODUCTS_KEY);

      const normalized = normalizeProduct(incoming);

      const idx = products.findIndex((x) => String(x.id) === String(normalized.id));
      if (idx >= 0) {
        // conserva created_at
        normalized.created_at = products[idx]?.created_at || normalized.created_at;
        products[idx] = normalized;
      } else {
        products.push(normalized);
      }

      await redisSetJson(PRODUCTS_KEY, products);
      return res.status(200).json({ ok: true, product: normalized, products });
    }

    if (req.method === "DELETE") {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: "Falta id" });

      const products = await redisGetJson(PRODUCTS_KEY);
      const next = products.filter((p) => String(p.id) !== String(id));

      await redisSetJson(PRODUCTS_KEY, next);
      return res.status(200).json({ ok: true, products: next });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("admin-products error:", err);
    return res.status(500).json({
      error: err?.message || "Internal Server Error",
      hint:
        "Revisá env vars UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en Vercel.",
      key: PRODUCTS_KEY,
    });
  }
}
