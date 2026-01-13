// api/admin-products.js
// Next.js / Vercel Serverless (Node)
// Guarda/lee productos desde Upstash Redis (REST API)

export const config = {
  api: { bodyParser: true },
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

// Clave única en Redis para tu catálogo
const PRODUCTS_KEY = "tsf_shop_products_v1";

async function upstash(cmd, args = []) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error("Faltan env UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
  }

  const res = await fetch(`${UPSTASH_URL}/${cmd}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Upstash error ${res.status}`);
  }
  return data;
}

async function readProducts() {
  const r = await upstash("get", [PRODUCTS_KEY]);
  // Upstash devuelve { result: "string" } o { result: null }
  if (!r || r.result == null) return [];
  try {
    const parsed = JSON.parse(r.result);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeProducts(products) {
  const payload = JSON.stringify(products || []);
  await upstash("set", [PRODUCTS_KEY, payload]);
}

function safeString(x) {
  return String(x == null ? "" : x).trim();
}

function toBool(x, defaultValue = false) {
  if (typeof x === "boolean") return x;
  if (typeof x === "string") return x.toLowerCase() === "true";
  return defaultValue;
}

function normalizeProduct(input) {
  // Estructura estándar que usa tu tienda + webhook
  const id = safeString(input.id) || `p_${Math.random().toString(36).slice(2, 10)}`;

  const price_cents = Number.isFinite(Number(input.price_cents))
    ? Math.max(0, Math.round(Number(input.price_cents)))
    : 0;

  return {
    id,
    name: safeString(input.name),
    type: safeString(input.type) || "other",
    short_description: safeString(input.short_description),
    price_cents,
    currency: safeString(input.currency || "USD") || "USD",
    image_url: safeString(input.image_url),
    is_active: toBool(input.is_active, true),
    is_featured: toBool(input.is_featured, true),
    delivery_type: safeString(input.delivery_type || (safeString(input.delivery_value) ? "drive_link" : "none")),
    delivery_value: safeString(input.delivery_value),
    email_subject: safeString(input.email_subject),
    email_body: safeString(input.email_body),
    pdf_url: safeString(input.pdf_url),

    // ✅ NUEVO: walink por producto
    walink: safeString(input.walink),
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // GET -> listar productos (para admin)
    if (req.method === "GET") {
      const products = await readProducts();
      return res.status(200).json({ products });
    }

    // POST -> crear/editar
    if (req.method === "POST") {
      const body = req.body || {};

      const incoming = normalizeProduct(body);

      if (!incoming.name) return res.status(400).json({ error: "Nombre obligatorio" });
      if (!incoming.price_cents || incoming.price_cents <= 0) {
        return res.status(400).json({ error: "Precio inválido" });
      }

      const products = await readProducts();

      const idx = products.findIndex((p) => p.id === incoming.id);
      if (idx >= 0) {
        products[idx] = { ...products[idx], ...incoming };
      } else {
        products.push(incoming);
      }

      await writeProducts(products);
      return res.status(200).json({ ok: true, product: incoming, products });
    }

    // DELETE -> eliminar por id
    if (req.method === "DELETE") {
      const { id } = req.body || {};
      const productId = safeString(id);
      if (!productId) return res.status(400).json({ error: "Falta id" });

      const products = await readProducts();
      const next = products.filter((p) => p.id !== productId);

      await writeProducts(next);
      return res.status(200).json({ ok: true, products: next });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("admin-products error:", err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
